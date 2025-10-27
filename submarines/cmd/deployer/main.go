package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/lib/pq"
	"github.com/nodepulse/admiral/submarines/internal/config"
	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/sshws"
	"github.com/nodepulse/admiral/submarines/internal/valkey"
)

const (
	StreamKey     = "nodepulse:deployments:stream"
	ConsumerGroup = "nodepulse-deployers"
	ConsumerName  = "deployer-1"
	BatchSize     = 1 // Process one deployment at a time
)

type DeploymentMessage struct {
	DeploymentID string   `json:"deployment_id"`
	Playbook     string   `json:"playbook"`
	ServerIDs    []string `json:"server_ids"` // Will be JSON string, need to unmarshal
	Variables    string   `json:"variables"`  // JSON string of variables
	Timestamp    string   `json:"timestamp"`
}

var (
	db     *database.DB
	vk     *valkey.Client
	cfg    *config.Config
	logger *log.Logger
)

func main() {
	logger = log.New(os.Stdout, "[DEPLOYER] ", log.LstdFlags)
	logger.Println("Starting NodePulse Deployment Worker...")

	// Load configuration (master key required for decrypting SSH private keys)
	cfg = config.Load(config.LoadOptions{
		RequireMasterKey: true,
	})

	// Connect to PostgreSQL
	var err error
	db, err = database.New(cfg)
	if err != nil {
		logger.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	defer db.Close()
	logger.Println("✓ Connected to PostgreSQL")

	// Connect to Valkey
	vk, err = valkey.New(cfg)
	if err != nil {
		logger.Fatalf("Failed to connect to Valkey: %v", err)
	}
	defer vk.Close()
	logger.Println("✓ Connected to Valkey")

	// Ensure consumer group exists
	// Use "$" to process only NEW messages from this point forward
	// This ensures the consumer group tracks the stream properly
	ctx := context.Background()
	if err := vk.XGroupCreate(ctx, StreamKey, ConsumerGroup, "$"); err != nil {
		logger.Printf("Consumer group may already exist (this is OK): %v", err)
	}

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	logger.Printf("Consumer name: %s", ConsumerName)
	logger.Printf("Listening for deployment jobs on stream: %s", StreamKey)

	// Heartbeat ticker to confirm loop is running
	heartbeatTicker := time.NewTicker(30 * time.Second)
	defer heartbeatTicker.Stop()

	// Main processing loop
	running := true
	for running {
		select {
		case <-sigChan:
			logger.Println("Received shutdown signal, stopping gracefully...")
			running = false
		case <-heartbeatTicker.C:
			logger.Println("[HEARTBEAT] Deployer is alive and polling stream")
		default:
			if err := processDeployments(ctx); err != nil {
				logger.Printf("Error processing deployments: %v", err)
				time.Sleep(1 * time.Second)
			}
		}
	}

	logger.Println("Shutting down...")
}

func processDeployments(ctx context.Context) error {
	// Two-phase message reading to ensure we process ALL messages:
	// Phase 1: Read pending messages for THIS consumer (messages we claimed but didn't ACK)
	// Phase 2: Read new messages that haven't been delivered to ANY consumer yet

	var allMessages []valkey.StreamMessage

	// Phase 1: Check for pending messages using "0"
	logger.Printf("[POLL] Checking for pending messages...")
	pendingMessages, err := vk.XReadGroup(ctx, ConsumerGroup, ConsumerName, StreamKey, "0", BatchSize)
	if err != nil {
		return fmt.Errorf("failed to read pending messages: %w", err)
	}
	if len(pendingMessages) > 0 {
		logger.Printf("[DEBUG] Found %d pending message(s) for this consumer", len(pendingMessages))
		allMessages = append(allMessages, pendingMessages...)
	}

	// Phase 2: Read new messages using ">"
	// Only read new messages if we haven't hit the batch limit with pending messages
	logger.Printf("[POLL] Checking for new messages...")
	if len(allMessages) < int(BatchSize) {
		remainingCapacity := BatchSize - int64(len(allMessages))
		newMessages, err := vk.XReadGroup(ctx, ConsumerGroup, ConsumerName, StreamKey, ">", remainingCapacity)
		if err != nil {
			return fmt.Errorf("failed to read new messages: %w", err)
		}
		if len(newMessages) > 0 {
			logger.Printf("[DEBUG] Found %d new message(s) in stream", len(newMessages))
			allMessages = append(allMessages, newMessages...)
		}
	}

	// If no messages found in either phase, sleep briefly
	if len(allMessages) == 0 {
		time.Sleep(100 * time.Millisecond)
		return nil
	}

	logger.Printf("[DEBUG] Processing %d total message(s)", len(allMessages))

	// Process all messages (pending + new)
	for _, msg := range allMessages {
		if err := handleDeployment(ctx, msg); err != nil {
			logger.Printf("[ERROR] Failed to handle deployment %s: %v", msg.ID, err)
			// Still ACK the message even on error - the deployment status is already set to "failed"
			// We don't want to retry indefinitely for permanent failures (like bad data)
		}

		// ACK message after processing (success or failure)
		if err := vk.XAck(ctx, StreamKey, ConsumerGroup, msg.ID); err != nil {
			logger.Printf("[WARNING] Failed to ACK message %s: %v", msg.ID, err)
		}
	}

	return nil
}

func handleDeployment(ctx context.Context, msg valkey.StreamMessage) error {
	// Parse deployment message from stream fields
	deploymentID := msg.Fields["deployment_id"]
	playbook := msg.Fields["playbook"]
	variablesJSON := msg.Fields["variables"]

	// Parse server_ids JSON array
	serverIDsJSON := msg.Fields["server_ids"]
	var serverIDs []string
	if err := json.Unmarshal([]byte(serverIDsJSON), &serverIDs); err != nil {
		return fmt.Errorf("failed to parse server_ids: %w", err)
	}

	logger.Printf("[DEPLOYMENT] Processing: %s (%s)", deploymentID, playbook)
	logger.Printf("[DEPLOYMENT] Target servers: %v", serverIDs)

	// Update deployment status to 'running'
	if err := updateDeploymentStatus(deploymentID, "running", nil, nil); err != nil {
		return fmt.Errorf("failed to update status to running: %w", err)
	}

	// Run Ansible playbook
	output, errorOutput, err := runAnsiblePlaybook(deploymentID, playbook, serverIDs, variablesJSON)

	if err != nil {
		// Deployment failed
		logger.Printf("[ERROR] Deployment %s failed: %v", deploymentID, err)
		if updateErr := updateDeploymentStatus(deploymentID, "failed", &output, &errorOutput); updateErr != nil {
			logger.Printf("[ERROR] Failed to update status to failed: %v", updateErr)
		}
		return fmt.Errorf("ansible playbook failed: %w", err)
	}

	// Deployment succeeded
	logger.Printf("[SUCCESS] Deployment %s completed successfully", deploymentID)
	if err := updateDeploymentStatus(deploymentID, "completed", &output, nil); err != nil {
		return fmt.Errorf("failed to update status to completed: %w", err)
	}

	return nil
}

func runAnsiblePlaybook(deploymentID, playbook string, serverIDs []string, variablesJSON string) (string, string, error) {
	// Build inventory from server IDs (also creates temp SSH key files)
	inventory, tempKeyFiles, err := buildInventory(serverIDs)
	if err != nil {
		return "", "", fmt.Errorf("failed to build inventory: %w", err)
	}

	// Ensure temp SSH key files are cleaned up after playbook execution
	defer func() {
		for _, keyFile := range tempKeyFiles {
			if err := os.Remove(keyFile); err != nil {
				logger.Printf("[WARNING] Failed to cleanup temp key file %s: %v", keyFile, err)
			} else {
				logger.Printf("[CLEANUP] Removed temp key file: %s", keyFile)
			}
		}
	}()

	// Write inventory to temp file
	inventoryFile, err := os.CreateTemp("", "ansible-inventory-*.yml")
	if err != nil {
		return "", "", fmt.Errorf("failed to create temp inventory file: %w", err)
	}
	defer os.Remove(inventoryFile.Name())

	if _, err := inventoryFile.WriteString(inventory); err != nil {
		return "", "", fmt.Errorf("failed to write inventory: %w", err)
	}
	inventoryFile.Close()

	// Playbook path
	playbookPath := filepath.Join("/app/flagship/ansible/playbooks", playbook)

	// Parse variables
	var variables map[string]interface{}
	if variablesJSON != "" {
		if err := json.Unmarshal([]byte(variablesJSON), &variables); err != nil {
			return "", "", fmt.Errorf("failed to parse variables: %w", err)
		}
	}

	// Build ansible-playbook command
	args := []string{
		"-i", inventoryFile.Name(),
		playbookPath,
		// Disable SSH config file to avoid macOS-specific options like UseKeychain
		"--ssh-common-args", "-F /dev/null -o StrictHostKeyChecking=no",
	}

	// Add extra vars
	for key, value := range variables {
		args = append(args, "-e", fmt.Sprintf("%s=%v", key, value))
	}

	logger.Printf("[ANSIBLE] Running: ansible-playbook %s", strings.Join(args, " "))

	// Execute ansible-playbook
	cmd := exec.Command("ansible-playbook", args...)
	cmd.Env = os.Environ()

	var stdoutBuf, stderrBuf strings.Builder
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	startTime := time.Now()
	err = cmd.Run()
	duration := time.Since(startTime)

	stdout := stdoutBuf.String()
	stderr := stderrBuf.String()

	logger.Printf("[ANSIBLE] Completed in %s", duration)

	if err != nil {
		return stdout, stderr, fmt.Errorf("ansible-playbook exited with error: %w", err)
	}

	return stdout, stderr, nil
}

func buildInventory(serverIDs []string) (string, []string, error) {
	// Fetch server details from database
	servers, err := fetchServers(serverIDs)
	if err != nil {
		return "", nil, err
	}

	logger.Printf("[INVENTORY] Fetched %d server(s) from database for IDs: %v", len(servers), serverIDs)

	var tempKeyFiles []string

	// Build YAML inventory
	var sb strings.Builder
	sb.WriteString("all:\n")
	sb.WriteString("  hosts:\n")

	for _, server := range servers {
		sb.WriteString(fmt.Sprintf("    %s:\n", server.Hostname))
		sb.WriteString(fmt.Sprintf("      ansible_host: %s\n", server.SSHHost))
		sb.WriteString(fmt.Sprintf("      ansible_port: %d\n", server.SSHPort))
		sb.WriteString(fmt.Sprintf("      ansible_user: %s\n", server.SSHUsername))

		// Decrypt and write SSH key if available
		if server.EncryptedKeyData != "" {
			// Decrypt the SSH key
			decryptedKey, err := sshws.DecryptPrivateKey(server.EncryptedKeyData, cfg.MasterKey)
			if err != nil {
				logger.Printf("[WARNING] Failed to decrypt SSH key for %s: %v", server.Hostname, err)
				continue
			}

			// Write key to temporary file
			keyFile, err := os.CreateTemp("", "ansible_key_*")
			if err != nil {
				return "", tempKeyFiles, fmt.Errorf("failed to create temp key file: %w", err)
			}

			if _, err := keyFile.WriteString(decryptedKey); err != nil {
				keyFile.Close()
				os.Remove(keyFile.Name())
				return "", tempKeyFiles, fmt.Errorf("failed to write key file: %w", err)
			}

			// Set secure permissions (0600)
			if err := keyFile.Chmod(0600); err != nil {
				keyFile.Close()
				os.Remove(keyFile.Name())
				return "", tempKeyFiles, fmt.Errorf("failed to set key file permissions: %w", err)
			}

			keyFile.Close()
			tempKeyFiles = append(tempKeyFiles, keyFile.Name())

			sb.WriteString(fmt.Sprintf("      ansible_ssh_private_key_file: %s\n", keyFile.Name()))
			logger.Printf("[INVENTORY] Created temp SSH key file for %s: %s", server.Hostname, keyFile.Name())
		}
	}

	inventory := sb.String()
	logger.Printf("[INVENTORY] Generated inventory:\n%s", inventory)
	return inventory, tempKeyFiles, nil
}

type ServerInfo struct {
	Hostname         string
	SSHHost          string
	SSHPort          int
	SSHUsername      string
	SSHKeyPath       string // Will be set to temp file path after decryption
	EncryptedKeyData string // Encrypted private key from database
}

func fetchServers(serverIDs []string) ([]ServerInfo, error) {
	query := `
		SELECT
			COALESCE(NULLIF(s.hostname, ''), s.name) as hostname,
			s.ssh_host,
			s.ssh_port,
			s.ssh_username,
			pk.private_key_content
		FROM admiral.servers s
		LEFT JOIN admiral.server_private_keys spk ON s.id = spk.server_id AND spk.is_primary = true
		LEFT JOIN admiral.private_keys pk ON spk.private_key_id = pk.id
		WHERE s.id = ANY($1)
	`

	// Convert Go string slice to PostgreSQL array using pq.Array
	rows, err := db.Query(query, pq.Array(serverIDs))
	if err != nil {
		return nil, fmt.Errorf("failed to query servers: %w", err)
	}
	defer rows.Close()

	var servers []ServerInfo
	for rows.Next() {
		var s ServerInfo
		var encryptedKey *string // Nullable
		if err := rows.Scan(&s.Hostname, &s.SSHHost, &s.SSHPort, &s.SSHUsername, &encryptedKey); err != nil {
			return nil, fmt.Errorf("failed to scan server: %w", err)
		}
		if encryptedKey != nil {
			s.EncryptedKeyData = *encryptedKey
		}
		servers = append(servers, s)
	}

	return servers, nil
}

func updateDeploymentStatus(deploymentID, status string, output, errorOutput *string) error {
	now := time.Now()

	var query string
	var args []interface{}

	if status == "running" {
		query = `
			UPDATE admiral.deployments
			SET status = $1, started_at = $2, updated_at = $2
			WHERE id = $3
		`
		args = []interface{}{status, now, deploymentID}
	} else if status == "completed" || status == "failed" {
		query = `
			UPDATE admiral.deployments
			SET status = $1, completed_at = $2, output = $3, error_output = $4, updated_at = $2
			WHERE id = $5
		`

		outputStr := ""
		if output != nil {
			outputStr = *output
		}

		errorOutputStr := ""
		if errorOutput != nil {
			errorOutputStr = *errorOutput
		}

		args = []interface{}{status, now, outputStr, errorOutputStr, deploymentID}
	}

	_, err := db.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("failed to update deployment: %w", err)
	}

	logger.Printf("[DB] Updated deployment %s to status: %s", deploymentID, status)
	return nil
}
