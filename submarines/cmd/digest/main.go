package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/nodepulse/admiral/submarines/internal/cleaner"
	"github.com/nodepulse/admiral/submarines/internal/config"
	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/handlers"
	"github.com/nodepulse/admiral/submarines/internal/valkey"
)

const (
	streamKey     = handlers.MetricsStreamKey
	consumerGroup = "submarines-digest"
	batchSize     = 100 // Process up to 100 messages per read
	idleSleep     = 5   // seconds to sleep when no messages
)

var (
	// Generate unique consumer name for horizontal scaling
	consumerName = getConsumerName()
)

func getConsumerName() string {
	// Use hostname (Docker container ID in containerized environments)
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		// Fallback to random hex ID if hostname unavailable
		b := make([]byte, 4)
		rand.Read(b)
		hostname = fmt.Sprintf("%x", b)
	}
	return fmt.Sprintf("digest-%s", hostname)
}

// No longer need allowedMetrics filter - we parse and extract only essential metrics
// The parser in parsers.ParsePrometheusMetricsToSnapshot() handles metric selection

func main() {
	log.Println("Starting digest worker...")

	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := database.New(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize Valkey
	valkeyClient, err := valkey.New(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize Valkey: %v", err)
	}
	defer valkeyClient.Close()

	// Create consumer group (idempotent)
	ctx := context.Background()
	valkeyClient.XGroupCreate(ctx, streamKey, consumerGroup, "0")

	// Create cleaner instance
	cleanerInstance := cleaner.New(db.DB, cfg)

	// Setup cleanup ticker (runs every 1 minute)
	cleanupTicker := time.NewTicker(1 * time.Minute)
	defer cleanupTicker.Stop()

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	log.Println("Digest worker ready (with cleanup every 1 minute)")

	// Run cleanup immediately on startup
	go runCleanup(ctx, cleanerInstance)

	// Main processing loop
	running := true
	for running {
		select {
		case <-sigChan:
			log.Println("Shutting down...")
			running = false
		case <-cleanupTicker.C:
			// Run cleanup in background (don't block digest processing)
			go runCleanup(ctx, cleanerInstance)
		default:
			if err := processMessages(ctx, valkeyClient, db); err != nil {
				time.Sleep(1 * time.Second) // Brief pause on error
			}
		}
	}

	log.Println("Digest worker stopped")
}

func processMessages(ctx context.Context, valkeyClient *valkey.Client, db *database.DB) error {
	// Try to read pending messages first (messages that were delivered but not ACKed)
	// Use "0" to read pending messages for this consumer
	messages, err := valkeyClient.XReadGroup(ctx, consumerGroup, consumerName, streamKey, "0", batchSize)
	if err != nil {
		log.Printf("[ERROR] Failed to read pending messages from stream: %v", err)
		return err
	}

	// If no pending messages, read new messages
	if len(messages) == 0 {
		messages, err = valkeyClient.XReadGroup(ctx, consumerGroup, consumerName, streamKey, ">", batchSize)
		if err != nil {
			log.Printf("[ERROR] Failed to read new messages from stream: %v", err)
			return err
		}
	}

	if len(messages) == 0 {
		// No messages, take a longer break to reduce polling
		// log.Printf("[DEBUG] No messages available, sleeping for %d seconds", idleSleep)
		time.Sleep(idleSleep * time.Second)
		return nil
	}

	log.Printf("[DEBUG] Read %d message(s) from stream", len(messages))
	successCount := 0
	errorCount := 0
	for _, msg := range messages {
		if err := processMessage(db, msg); err != nil {
			log.Printf("[ERROR] Failed to process message %s: %v", msg.ID, err)
			errorCount++
			// Don't ACK failed messages - they'll be retried
			continue
		}

		// Acknowledge successful processing
		valkeyClient.XAck(ctx, streamKey, consumerGroup, msg.ID)
		successCount++
	}

	if successCount > 0 {
		log.Printf("[SUCCESS] Inserted %d metric(s) to PostgreSQL", successCount)
	}
	if errorCount > 0 {
		log.Printf("[WARN] Failed to process %d message(s)", errorCount)
	}

	return nil
}

func processMessage(db *database.DB, msg valkey.StreamMessage) error {
	// Extract server_id and raw payload from stream message (new simplified format)
	serverID, ok := msg.Fields["server_id"]
	if !ok {
		return fmt.Errorf("missing server_id in message")
	}

	payloadJSON, ok := msg.Fields["payload"]
	if !ok {
		return fmt.Errorf("missing payload in message")
	}

	// Parse and process the raw payload
	return processRawPayload(db, serverID, payloadJSON)
}

func processRawPayload(db *database.DB, serverID string, payloadJSON string) error {
	// Parse grouped payload: { "node_exporter": [...], "process_exporter": [...] }
	var groupedPayload map[string]json.RawMessage
	if err := json.Unmarshal([]byte(payloadJSON), &groupedPayload); err != nil {
		return fmt.Errorf("invalid JSON payload: %w", err)
	}

	// Process each exporter type (NO TRANSACTION - process individually)
	for exporterName, rawData := range groupedPayload {
		log.Printf("[DEBUG] Processing %s for server %s", exporterName, serverID)

		switch exporterName {
		case "node_exporter":
			// Parse node_exporter snapshots
			var snapshots []handlers.MetricSnapshot
			if err := json.Unmarshal(rawData, &snapshots); err != nil {
				log.Printf("[ERROR] Failed to parse node_exporter data: %v", err)
				continue // Skip this exporter, don't fail entire message
			}

			// Insert each snapshot
			for _, snapshot := range snapshots {
				if err := insertMetricSnapshotDirect(db, serverID, &snapshot); err != nil {
					log.Printf("[ERROR] Failed to insert node_exporter snapshot: %v", err)
					// Continue processing other snapshots
				}
			}

		case "process_exporter":
			// Parse process_exporter snapshots
			var processSnapshots []handlers.ProcessSnapshot
			if err := json.Unmarshal(rawData, &processSnapshots); err != nil {
				log.Printf("[ERROR] Failed to parse process_exporter data: %v", err)
				continue
			}

			log.Printf("[DEBUG] Batch inserting %d process snapshots", len(processSnapshots))
			if err := insertProcessSnapshotsBatchDirect(db, serverID, processSnapshots); err != nil {
				log.Printf("[ERROR] Failed to insert process snapshots: %v", err)
				// Continue processing other exporters
			}

		default:
			log.Printf("[WARN] Unknown exporter type: %s", exporterName)
		}
	}

	// Update server's last_seen_at timestamp
	if err := updateServerLastSeenDirect(db, serverID); err != nil {
		log.Printf("[WARN] Failed to update last_seen_at for server %s: %v", serverID, err)
	}

	return nil
}

// insertMetricSnapshotDirect inserts without transaction (for simplified batch processing)
func insertMetricSnapshotDirect(db *database.DB, serverID string, snapshot *handlers.MetricSnapshot) error {
	query := `
		INSERT INTO admiral.metrics (
			server_id,
			timestamp,
			cpu_idle_seconds,
			cpu_iowait_seconds,
			cpu_system_seconds,
			cpu_user_seconds,
			cpu_steal_seconds,
			cpu_cores,
			memory_total_bytes,
			memory_available_bytes,
			memory_free_bytes,
			memory_cached_bytes,
			memory_buffers_bytes,
			memory_active_bytes,
			memory_inactive_bytes,
			swap_total_bytes,
			swap_free_bytes,
			swap_cached_bytes,
			disk_total_bytes,
			disk_free_bytes,
			disk_available_bytes,
			disk_reads_completed_total,
			disk_writes_completed_total,
			disk_read_bytes_total,
			disk_written_bytes_total,
			disk_io_time_seconds_total,
			network_receive_bytes_total,
			network_transmit_bytes_total,
			network_receive_packets_total,
			network_transmit_packets_total,
			network_receive_errs_total,
			network_transmit_errs_total,
			network_receive_drop_total,
			network_transmit_drop_total,
			load_1min,
			load_5min,
			load_15min,
			processes_running,
			processes_blocked,
			processes_total,
			uptime_seconds
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
			$11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
			$21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
			$31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41
		)
	`

	_, err := db.DB.Exec(query,
		serverID,
		snapshot.Timestamp,
		snapshot.CPUIdleSeconds,
		snapshot.CPUIowaitSeconds,
		snapshot.CPUSystemSeconds,
		snapshot.CPUUserSeconds,
		snapshot.CPUStealSeconds,
		snapshot.CPUCores,
		snapshot.MemoryTotalBytes,
		snapshot.MemoryAvailableBytes,
		snapshot.MemoryFreeBytes,
		snapshot.MemoryCachedBytes,
		snapshot.MemoryBuffersBytes,
		snapshot.MemoryActiveBytes,
		snapshot.MemoryInactiveBytes,
		snapshot.SwapTotalBytes,
		snapshot.SwapFreeBytes,
		snapshot.SwapCachedBytes,
		snapshot.DiskTotalBytes,
		snapshot.DiskFreeBytes,
		snapshot.DiskAvailableBytes,
		snapshot.DiskReadsCompletedTotal,
		snapshot.DiskWritesCompletedTotal,
		snapshot.DiskReadBytesTotal,
		snapshot.DiskWrittenBytesTotal,
		snapshot.DiskIOTimeSecondsTotal,
		snapshot.NetworkReceiveBytesTotal,
		snapshot.NetworkTransmitBytesTotal,
		snapshot.NetworkReceivePacketsTotal,
		snapshot.NetworkTransmitPacketsTotal,
		snapshot.NetworkReceiveErrsTotal,
		snapshot.NetworkTransmitErrsTotal,
		snapshot.NetworkReceiveDropTotal,
		snapshot.NetworkTransmitDropTotal,
		snapshot.Load1Min,
		snapshot.Load5Min,
		snapshot.Load15Min,
		snapshot.ProcessesRunning,
		snapshot.ProcessesBlocked,
		snapshot.ProcessesTotal,
		snapshot.UptimeSeconds,
	)

	return err
}


// updateServerLastSeenDirect updates without transaction (for simplified batch processing)
func updateServerLastSeenDirect(db *database.DB, serverID string) error {
	query := `
		UPDATE admiral.servers
		SET last_seen_at = NOW(), updated_at = NOW()
		WHERE server_id = $1
	`

	result, err := db.DB.Exec(query, serverID)
	if err != nil {
		return fmt.Errorf("failed to update last_seen_at: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		log.Printf("[WARN] Server %s not found in database, last_seen_at not updated", serverID)
	}

	return nil
}

// insertProcessSnapshotsBatchDirect performs bulk insert without transaction
func insertProcessSnapshotsBatchDirect(db *database.DB, serverID string, snapshots []handlers.ProcessSnapshot) error {
	if len(snapshots) == 0 {
		return nil
	}

	// Build bulk INSERT query with multiple VALUES
	query := `
		INSERT INTO admiral.process_snapshots (
			server_id,
			timestamp,
			process_name,
			num_procs,
			cpu_seconds_total,
			memory_bytes
		) VALUES
	`

	// Build VALUES clauses and args array
	values := []string{}
	args := []any{}

	for i, snapshot := range snapshots {
		// Each row has 6 parameters
		paramOffset := i * 6
		values = append(values, fmt.Sprintf("($%d, $%d, $%d, $%d, $%d, $%d)",
			paramOffset+1, paramOffset+2, paramOffset+3,
			paramOffset+4, paramOffset+5, paramOffset+6))

		args = append(args,
			serverID,
			snapshot.Timestamp,
			snapshot.Name,
			snapshot.NumProcs,
			snapshot.CPUSecondsTotal,
			snapshot.MemoryBytes,
		)
	}

	// Concatenate VALUES clauses
	query += strings.Join(values, ", ")

	// Execute bulk insert
	_, err := db.DB.Exec(query, args...)
	if err != nil {
		return fmt.Errorf("failed to batch insert %d process snapshots: %w", len(snapshots), err)
	}

	return nil
}

func runCleanup(ctx context.Context, c *cleaner.Cleaner) {
	log.Printf("[CLEANUP] Running cleanup at %s", time.Now().UTC().Format(time.RFC3339))

	// Create context with timeout for this cleanup run (30s to not skip next runs)
	cleanupCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if err := c.Run(cleanupCtx); err != nil {
		log.Printf("[CLEANUP] ❌ Failed: %v", err)
	} else {
		log.Printf("[CLEANUP] ✓ Completed successfully")
	}
}
