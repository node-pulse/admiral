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

	"github.com/nodepulse/admiral/submarines/internal/config"
	"github.com/nodepulse/admiral/submarines/internal/database"
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

	// Load configuration (master key not required for deployer - SSH keys mounted directly)
	cfg = config.Load(config.LoadOptions{
		RequireMasterKey: false,
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
	ctx := context.Background()
	if err := vk.XGroupCreate(ctx, StreamKey, ConsumerGroup, "0"); err != nil {
		logger.Printf("Consumer group may already exist (this is OK): %v", err)
	}

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	logger.Printf("Consumer name: %s", ConsumerName)
	logger.Printf("Listening for deployment jobs on stream: %s", StreamKey)

	// Main processing loop
	running := true
	for running {
		select {
		case <-sigChan:
			logger.Println("Received shutdown signal, stopping gracefully...")
			running = false
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
	// Read from stream - use "0" to process ALL pending/undelivered messages
	// This ensures we process messages that were added before the consumer started
	messages, err := vk.XReadGroup(ctx, ConsumerGroup, ConsumerName, StreamKey, "0", BatchSize)
	if err != nil {
		return fmt.Errorf("failed to read from stream: %w", err)
	}

	if len(messages) == 0 {
		time.Sleep(100 * time.Millisecond)
		return nil
	}

	logger.Printf("[DEBUG] Read %d message(s) from stream", len(messages))

	for _, msg := range messages {
		if err := handleDeployment(ctx, msg); err != nil {
			logger.Printf("[ERROR] Failed to handle deployment %s: %v", msg.ID, err)
			// Don't ACK on error - message will be retried
			continue
		}

		// ACK message after successful processing
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
	// Build inventory from server IDs
	inventory, err := buildInventory(serverIDs)
	if err != nil {
		return "", "", fmt.Errorf("failed to build inventory: %w", err)
	}

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

func buildInventory(serverIDs []string) (string, error) {
	// Fetch server details from database
	servers, err := fetchServers(serverIDs)
	if err != nil {
		return "", err
	}

	// Build YAML inventory
	var sb strings.Builder
	sb.WriteString("all:\n")
	sb.WriteString("  hosts:\n")

	for _, server := range servers {
		sb.WriteString(fmt.Sprintf("    %s:\n", server.Hostname))
		sb.WriteString(fmt.Sprintf("      ansible_host: %s\n", server.SSHHost))
		sb.WriteString(fmt.Sprintf("      ansible_port: %d\n", server.SSHPort))
		sb.WriteString(fmt.Sprintf("      ansible_user: %s\n", server.SSHUsername))

		// Add SSH key if available
		if server.SSHKeyPath != "" {
			sb.WriteString(fmt.Sprintf("      ansible_ssh_private_key_file: %s\n", server.SSHKeyPath))
		}
	}

	return sb.String(), nil
}

type ServerInfo struct {
	Hostname    string
	SSHHost     string
	SSHPort     int
	SSHUsername string
	SSHKeyPath  string
}

func fetchServers(serverIDs []string) ([]ServerInfo, error) {
	query := `
		SELECT hostname, ssh_host, ssh_port, ssh_username
		FROM admiral.servers
		WHERE id = ANY($1)
	`

	// Convert string UUIDs to proper format for PostgreSQL
	rows, err := db.Query(query, serverIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to query servers: %w", err)
	}
	defer rows.Close()

	var servers []ServerInfo
	for rows.Next() {
		var s ServerInfo
		if err := rows.Scan(&s.Hostname, &s.SSHHost, &s.SSHPort, &s.SSHUsername); err != nil {
			return nil, fmt.Errorf("failed to scan server: %w", err)
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
