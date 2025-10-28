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
	cfg = config.Load()

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
	pendingMessages, err := vk.XReadGroup(ctx, ConsumerGroup, ConsumerName, StreamKey, "0", BatchSize)
	if err != nil {
		return fmt.Errorf("failed to read pending messages: %w", err)
	}
	if len(pendingMessages) > 0 {
		allMessages = append(allMessages, pendingMessages...)
	}

	// Phase 2: Read new messages using ">"
	// Only read new messages if we haven't hit the batch limit with pending messages
	if len(allMessages) < int(BatchSize) {
		remainingCapacity := BatchSize - int64(len(allMessages))
		newMessages, err := vk.XReadGroup(ctx, ConsumerGroup, ConsumerName, StreamKey, ">", remainingCapacity)
		if err != nil {
			return fmt.Errorf("failed to read new messages: %w", err)
		}
		if len(newMessages) > 0 {
			allMessages = append(allMessages, newMessages...)
		}
	}

	// If no messages found in either phase, sleep briefly
	if len(allMessages) == 0 {
		time.Sleep(100 * time.Millisecond)
		return nil
	}

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

	// Update deployment status to 'running' and set total_servers count
	if err := updateDeploymentStatus(deploymentID, "running", nil, nil, len(serverIDs)); err != nil {
		return fmt.Errorf("failed to update status to running: %w", err)
	}

	// Create deployment_servers records
	if err := createDeploymentServers(deploymentID, serverIDs); err != nil {
		logger.Printf("[WARNING] Failed to create deployment_servers records: %v", err)
		// Continue anyway - this is not fatal
	}

	// Build server ID to hostname mapping for result tracking
	servers, err := fetchServers(serverIDs)
	if err != nil {
		logger.Printf("[WARNING] Failed to fetch servers for hostname mapping: %v", err)
	}
	hostnameToServerID := make(map[string]string)
	for _, s := range servers {
		hostnameToServerID[s.Hostname] = s.AgentServerID
	}

	// Run Ansible playbook
	output, errorOutput, err := runAnsiblePlaybook(ctx, playbook, serverIDs, variablesJSON)

	// Parse Ansible JSON output to get per-host results
	if output != "" {
		if parseErr := parseAnsibleResults(deploymentID, output, hostnameToServerID); parseErr != nil {
			logger.Printf("[WARNING] Failed to parse Ansible results: %v", parseErr)
		}

		// Update aggregate counts in deployments table
		if updateErr := updateDeploymentAggregates(deploymentID); updateErr != nil {
			logger.Printf("[WARNING] Failed to update deployment aggregates: %v", updateErr)
		}
	}

	if err != nil {
		// Deployment failed
		logger.Printf("[ERROR] Deployment %s failed: %v", deploymentID, err)
		if updateErr := updateDeploymentStatus(deploymentID, "failed", &output, &errorOutput, 0); updateErr != nil {
			logger.Printf("[ERROR] Failed to update status to failed: %v", updateErr)
		}
		return fmt.Errorf("ansible playbook failed: %w", err)
	}

	// Deployment succeeded
	logger.Printf("[SUCCESS] Deployment %s completed successfully", deploymentID)
	if err := updateDeploymentStatus(deploymentID, "completed", &output, nil, 0); err != nil {
		return fmt.Errorf("failed to update status to completed: %w", err)
	}

	return nil
}

func runAnsiblePlaybook(ctx context.Context, playbook string, serverIDs []string, variablesJSON string) (string, string, error) {
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

	// Playbook path - support both flat and subdirectory structure
	// Playbook format: "nodepulse/deploy-agent.yml" or "custom/my-playbook.yml"
	playbookPath := filepath.Join("/app/flagship/ansible/playbooks", playbook)

	// Parse variables
	var variables map[string]any
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

	// Execute ansible-playbook with context for cancellation support
	cmd := exec.CommandContext(ctx, "ansible-playbook", args...)
	// Use JSON callback for machine-readable output
	cmd.Env = append(os.Environ(),
		"ANSIBLE_CONFIG=/app/flagship/ansible/ansible.cfg",
		"ANSIBLE_STDOUT_CALLBACK=json",
	)

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
		sb.WriteString(fmt.Sprintf("      agent_server_id: %s\n", server.AgentServerID))

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
	return inventory, tempKeyFiles, nil
}

type ServerInfo struct {
	Hostname         string
	SSHHost          string
	SSHPort          int
	SSHUsername      string
	SSHKeyPath       string // Will be set to temp file path after decryption
	EncryptedKeyData string // Encrypted private key from database
	AgentServerID    string // The server_id value used by the agent
}

func fetchServers(serverIDs []string) ([]ServerInfo, error) {
	query := `
		SELECT
			COALESCE(NULLIF(s.hostname, ''), s.name) as hostname,
			s.ssh_host,
			s.ssh_port,
			s.ssh_username,
			pk.private_key_content,
			s.server_id
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
		if err := rows.Scan(&s.Hostname, &s.SSHHost, &s.SSHPort, &s.SSHUsername, &encryptedKey, &s.AgentServerID); err != nil {
			return nil, fmt.Errorf("failed to scan server: %w", err)
		}
		if encryptedKey != nil {
			s.EncryptedKeyData = *encryptedKey
		}
		servers = append(servers, s)
	}

	return servers, nil
}

func updateDeploymentStatus(deploymentID, status string, output, errorOutput *string, totalServers int) error {
	now := time.Now()

	var query string
	var args []any

	switch status {
	case "running":
		query = `
			UPDATE admiral.deployments
			SET status = $1, started_at = $2, total_servers = $3, updated_at = $2
			WHERE id = $4
		`
		args = []any{status, now, totalServers, deploymentID}
	case "completed", "failed":
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

		args = []any{status, now, outputStr, errorOutputStr, deploymentID}
	}

	_, err := db.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("failed to update deployment: %w", err)
	}

	logger.Printf("[DB] Updated deployment %s to status: %s", deploymentID, status)
	return nil
}

// AnsiblePlayRecap represents the stats for a single host from Ansible JSON output
type AnsiblePlayRecap struct {
	Ok          int `json:"ok"`
	Changed     int `json:"changed"`
	Unreachable int `json:"unreachable"`
	Failed      int `json:"failures"`
	Skipped     int `json:"skipped"`
	Rescued     int `json:"rescued"`
	Ignored     int `json:"ignored"`
}

// AnsibleJSONOutput represents the JSON output structure from Ansible
type AnsibleJSONOutput struct {
	Stats map[string]AnsiblePlayRecap `json:"stats"`
}

func parseAnsibleResults(deploymentID string, jsonOutput string, hostnameToServerID map[string]string) error {
	var result AnsibleJSONOutput
	if err := json.Unmarshal([]byte(jsonOutput), &result); err != nil {
		return fmt.Errorf("failed to unmarshal Ansible JSON: %w", err)
	}

	logger.Printf("[ANSIBLE] Parsing results for %d hosts", len(result.Stats))

	for hostname, stats := range result.Stats {
		// Determine status based on stats
		var status string
		var changed bool

		if stats.Unreachable > 0 {
			status = "failed"
		} else if stats.Failed > 0 {
			status = "failed"
		} else if stats.Skipped > 0 && stats.Ok == 0 {
			status = "skipped"
		} else {
			status = "success"
		}

		changed = stats.Changed > 0

		// Get server ID from hostname mapping
		serverID, ok := hostnameToServerID[hostname]
		if !ok {
			logger.Printf("[WARNING] Hostname %s not found in server mapping", hostname)
			continue
		}

		// Update deployment_servers record
		if err := updateDeploymentServer(deploymentID, serverID, status, changed); err != nil {
			logger.Printf("[ERROR] Failed to update deployment_server for %s: %v", hostname, err)
		} else {
			logger.Printf("[DB] Updated deployment_server: %s -> %s (changed: %v)", hostname, status, changed)
		}
	}

	return nil
}

func updateDeploymentServer(deploymentID, serverID, status string, changed bool) error {
	now := time.Now()

	query := `
		UPDATE admiral.deployment_servers
		SET status = $1, changed = $2, completed_at = $3, updated_at = $3
		WHERE deployment_id = $4 AND server_id = $5
	`

	_, err := db.Exec(query, status, changed, now, deploymentID, serverID)
	if err != nil {
		return fmt.Errorf("failed to update deployment_server: %w", err)
	}

	return nil
}

func updateDeploymentAggregates(deploymentID string) error {
	// Calculate aggregate counts from deployment_servers table
	query := `
		UPDATE admiral.deployments
		SET
			successful_servers = (
				SELECT COUNT(*) FROM admiral.deployment_servers
				WHERE deployment_id = $1 AND status = 'success'
			),
			failed_servers = (
				SELECT COUNT(*) FROM admiral.deployment_servers
				WHERE deployment_id = $1 AND status = 'failed'
			),
			skipped_servers = (
				SELECT COUNT(*) FROM admiral.deployment_servers
				WHERE deployment_id = $1 AND status = 'skipped'
			),
			updated_at = NOW()
		WHERE id = $1
	`

	_, err := db.Exec(query, deploymentID)
	if err != nil {
		return fmt.Errorf("failed to update deployment aggregates: %w", err)
	}

	logger.Printf("[DB] Updated aggregate counts for deployment %s", deploymentID)
	return nil
}

func createDeploymentServers(deploymentID string, serverIDs []string) error {
	if len(serverIDs) == 0 {
		return nil
	}

	// Build bulk insert query
	query := `
		INSERT INTO admiral.deployment_servers (deployment_id, server_id, status, created_at, updated_at)
		VALUES
	`

	now := time.Now()
	values := []string{}
	args := []any{}
	argIndex := 1

	for _, serverID := range serverIDs {
		values = append(values, fmt.Sprintf("($%d, $%d, $%d, $%d, $%d)", argIndex, argIndex+1, argIndex+2, argIndex+3, argIndex+4))
		args = append(args, deploymentID, serverID, "pending", now, now)
		argIndex += 5
	}

	query += strings.Join(values, ", ")

	_, err := db.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("failed to insert deployment_servers: %w", err)
	}

	logger.Printf("[DB] Created %d deployment_servers records for deployment %s", len(serverIDs), deploymentID)
	return nil
}
