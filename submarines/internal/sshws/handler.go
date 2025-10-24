package sshws

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for now (configure based on your needs)
		return true
	},
}

// Handler manages SSH WebSocket connections
type Handler struct {
	db        *sql.DB
	masterKey string
	mu        sync.Mutex
}

// NewHandler creates a new SSH WebSocket handler
func NewHandler(db *sql.DB, masterKey string) *Handler {
	return &Handler{
		db:        db,
		masterKey: masterKey,
	}
}

// HandleWebSocket handles WebSocket connections for SSH
func (h *Handler) HandleWebSocket(c *gin.Context) {
	serverID := c.Param("server_id")
	if serverID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "server_id is required"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[SSH-WS] Failed to upgrade connection: %v", err)
		return
	}
	defer ws.Close()

	sessionID := fmt.Sprintf("ssh_%d", time.Now().UnixNano())
	log.Printf("[%s] WebSocket connected for server %s", sessionID, serverID)

	// Send initial connection message
	h.sendMessage(ws, map[string]interface{}{
		"type":      "connected",
		"sessionId": sessionID,
		"message":   "WebSocket connected. Send auth message to begin SSH session.",
	})

	// Handle messages
	for {
		var msg Message
		err := ws.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[%s] WebSocket error: %v", sessionID, err)
			}
			break
		}

		switch msg.Type {
		case "auth":
			// handleAuth will take over the WebSocket reading, so return after calling it
			h.handleAuth(ws, sessionID, serverID, msg)
			return
		case "ping":
			h.sendMessage(ws, map[string]interface{}{"type": "pong"})
		default:
			log.Printf("[%s] Unknown message type: %s", sessionID, msg.Type)
		}
	}

	log.Printf("[%s] WebSocket disconnected", sessionID)
}

// handleAuth handles authentication and SSH connection establishment
func (h *Handler) handleAuth(ws *websocket.Conn, sessionID, serverID string, msg Message) {
	log.Printf("[%s] Auth request for server %s", sessionID, serverID)

	// Fetch server details from database
	var sshHost, sshUsername string
	var sshPort int
	var privateKeyContent sql.NullString

	query := `
		SELECT
			s.ssh_host,
			s.ssh_port,
			s.ssh_username,
			pk.private_key_content
		FROM admiral.servers s
		LEFT JOIN admiral.server_private_keys spk ON s.id = spk.server_id AND spk.is_primary = true
		LEFT JOIN admiral.private_keys pk ON spk.private_key_id = pk.id
		WHERE s.id = $1
	`

	err := h.db.QueryRow(query, serverID).Scan(&sshHost, &sshPort, &sshUsername, &privateKeyContent)
	if err != nil {
		log.Printf("[%s] Failed to fetch server: %v", sessionID, err)
		h.sendMessage(ws, map[string]interface{}{
			"type":    "error",
			"message": fmt.Sprintf("Server not found: %v", err),
		})
		return
	}

	if sshHost == "" {
		h.sendMessage(ws, map[string]interface{}{
			"type":    "error",
			"message": "SSH host not configured for this server",
		})
		return
	}

	// Prepare SSH client config
	sshConfig := &ssh.ClientConfig{
		User:            sshUsername,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // TODO: Implement proper host key verification
		Timeout:         10 * time.Second,
	}

	// Try private key authentication
	if privateKeyContent.Valid && privateKeyContent.String != "" {
		log.Printf("[%s] Using SSH key authentication", sessionID)

		// Decrypt private key
		decryptedKey, err := DecryptPrivateKey(privateKeyContent.String, h.masterKey)
		if err != nil {
			log.Printf("[%s] Failed to decrypt private key: %v", sessionID, err)
			h.sendMessage(ws, map[string]interface{}{
				"type":    "error",
				"message": fmt.Sprintf("Failed to decrypt private key: %v", err),
			})
			return
		}

		// Parse private key
		signer, err := ssh.ParsePrivateKey([]byte(decryptedKey))
		if err != nil {
			log.Printf("[%s] Failed to parse private key: %v", sessionID, err)
			h.sendMessage(ws, map[string]interface{}{
				"type":    "error",
				"message": fmt.Sprintf("Failed to parse private key: %v", err),
			})
			return
		}

		sshConfig.Auth = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	} else if msg.Password != "" {
		// Use password authentication (session-only, never stored in database)
		// This is intended for initial setup to allow users to connect and configure SSH keys
		log.Printf("[%s] Using password authentication (session-only)", sessionID)
		sshConfig.Auth = []ssh.AuthMethod{ssh.Password(msg.Password)}
	} else {
		h.sendMessage(ws, map[string]interface{}{
			"type":    "error",
			"message": "No authentication method available (need private key or password)",
		})
		return
	}

	// Connect to SSH server
	addr := fmt.Sprintf("%s:%d", sshHost, sshPort)
	log.Printf("[%s] Connecting to %s@%s", sessionID, sshUsername, addr)

	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		log.Printf("[%s] SSH connection failed: %v", sessionID, err)
		h.sendMessage(ws, map[string]interface{}{
			"type":    "error",
			"message": fmt.Sprintf("SSH connection failed: %v", err),
		})
		return
	}
	defer client.Close()

	// Request a session
	session, err := client.NewSession()
	if err != nil {
		log.Printf("[%s] Failed to create session: %v", sessionID, err)
		h.sendMessage(ws, map[string]interface{}{
			"type":    "error",
			"message": fmt.Sprintf("Failed to create session: %v", err),
		})
		return
	}
	defer session.Close()

	// Set up terminal modes
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	cols := msg.Cols
	rows := msg.Rows
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	// Request pseudo terminal
	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		log.Printf("[%s] Failed to request PTY: %v", sessionID, err)
		h.sendMessage(ws, map[string]interface{}{
			"type":    "error",
			"message": fmt.Sprintf("Failed to request PTY: %v", err),
		})
		return
	}

	// Set up pipes
	stdin, err := session.StdinPipe()
	if err != nil {
		log.Printf("[%s] Failed to get stdin: %v", sessionID, err)
		return
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		log.Printf("[%s] Failed to get stdout: %v", sessionID, err)
		return
	}

	stderr, err := session.StderrPipe()
	if err != nil {
		log.Printf("[%s] Failed to get stderr: %v", sessionID, err)
		return
	}

	// Start shell
	if err := session.Shell(); err != nil {
		log.Printf("[%s] Failed to start shell: %v", sessionID, err)
		h.sendMessage(ws, map[string]interface{}{
			"type":    "error",
			"message": fmt.Sprintf("Failed to start shell: %v", err),
		})
		return
	}

	log.Printf("[%s] SSH session established", sessionID)
	h.sendMessage(ws, map[string]interface{}{
		"type":    "auth_success",
		"message": "SSH connection established",
	})

	// Handle I/O
	done := make(chan struct{})
	var once sync.Once

	// Read from SSH stdout and send to WebSocket
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := stdout.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("[%s] SSH stdout error: %v", sessionID, err)
				}
				once.Do(func() { close(done) })
				return
			}
			if n > 0 {
				h.sendMessage(ws, map[string]interface{}{
					"type": "output",
					"data": string(buf[:n]),
				})
			}
		}
	}()

	// Read from SSH stderr and send to WebSocket
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := stderr.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("[%s] SSH stderr error: %v", sessionID, err)
				}
				return
			}
			if n > 0 {
				h.sendMessage(ws, map[string]interface{}{
					"type": "output",
					"data": string(buf[:n]),
				})
			}
		}
	}()

	// Read from WebSocket and send to SSH stdin
	go func() {
		for {
			var msg Message
			err := ws.ReadJSON(&msg)
			if err != nil {
				once.Do(func() { close(done) })
				return
			}

			switch msg.Type {
			case "input":
				if msg.Data != "" {
					_, err := stdin.Write([]byte(msg.Data))
					if err != nil {
						log.Printf("[%s] Failed to write to stdin: %v", sessionID, err)
						once.Do(func() { close(done) })
						return
					}
				}
			case "resize":
				// Handle terminal resize
				cols := msg.Cols
				rows := msg.Rows
				if cols == 0 {
					cols = 80
				}
				if rows == 0 {
					rows = 24
				}
				log.Printf("[%s] Resizing terminal to %dx%d", sessionID, cols, rows)
				session.WindowChange(rows, cols)
			}
		}
	}()

	// Wait for session to finish
	<-done
	log.Printf("[%s] SSH session closed", sessionID)
	h.sendMessage(ws, map[string]interface{}{
		"type":    "disconnected",
		"message": "SSH connection closed",
	})
}

// sendMessage sends a JSON message over WebSocket
func (h *Handler) sendMessage(ws *websocket.Conn, data interface{}) {
	if err := ws.WriteJSON(data); err != nil {
		log.Printf("Failed to send message: %v", err)
	}
}

// Message represents a WebSocket message
type Message struct {
	Type     string `json:"type"`
	Data     string `json:"data"`
	Password string `json:"password"`
	Cols     int    `json:"cols"`
	Rows     int    `json:"rows"`
}
