package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/nodepulse/dashboard/backend/internal/cleaner"
	"github.com/nodepulse/dashboard/backend/internal/config"
	"github.com/nodepulse/dashboard/backend/internal/database"
	"github.com/nodepulse/dashboard/backend/internal/handlers"
	"github.com/nodepulse/dashboard/backend/internal/models"
	"github.com/nodepulse/dashboard/backend/internal/valkey"
)

const (
	streamKey     = handlers.MetricsStreamKey
	consumerGroup = "submarines-digest"
	consumerName  = "digest-1"
	batchSize     = 10
	idleSleep     = 5 // seconds to sleep when no messages
)

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
	// Read messages from stream
	messages, err := valkeyClient.XReadGroup(ctx, consumerGroup, consumerName, streamKey, ">", batchSize)
	if err != nil {
		log.Printf("[ERROR] Failed to read from stream: %v", err)
		return err
	}

	if len(messages) == 0 {
		// No messages, take a longer break to reduce polling
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
	// Extract payload from stream message
	payloadJSON, ok := msg.Fields["payload"]
	if !ok {
		return nil // Skip malformed messages
	}

	// Deserialize metric report
	var report models.MetricReport
	if err := json.Unmarshal([]byte(payloadJSON), &report); err != nil {
		return err
	}

	// Parse server ID
	serverID, err := uuid.Parse(report.ServerID)
	if err != nil {
		return err
	}

	// Start transaction
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert metrics only
	if err := insertMetrics(tx, serverID, &report); err != nil {
		return err
	}

	// Commit transaction
	return tx.Commit()
}

func insertMetrics(tx *sql.Tx, serverID uuid.UUID, report *models.MetricReport) error {
	query := `
		INSERT INTO admiral.metrics (
			server_id,
			timestamp,
			cpu_usage_percent,
			memory_used_mb,
			memory_total_mb,
			memory_usage_percent,
			disk_used_gb,
			disk_total_gb,
			disk_usage_percent,
			disk_mount_point,
			network_upload_bytes,
			network_download_bytes,
			uptime_days,
			processes,
			ipv4,
			ipv6
		) VALUES (
			$1,
			$2,
			$3,
			$4,
			$5,
			$6,
			$7,
			$8,
			$9,
			$10,
			$11,
			$12,
			$13,
			$14,
			$15,
			$16
		)
	`

	var cpuUsage *float64
	var memUsed, memTotal *int64
	var memUsagePercent *float64
	var diskUsedGB, diskTotalGB, diskUsagePercent *float64
	var diskMountPoint *string
	var netUpload, netDownload *int64
	var uptimeDays *float64
	var processesJSON []byte

	if report.CPU != nil {
		cpuUsage = report.CPU.UsagePercent
	}
	if report.Memory != nil {
		memUsed = report.Memory.UsedMB
		memTotal = report.Memory.TotalMB
		memUsagePercent = report.Memory.UsagePercent
	}
	if report.Disk != nil {
		diskUsedGB = report.Disk.UsedGB
		diskTotalGB = report.Disk.TotalGB
		diskUsagePercent = report.Disk.UsagePercent
		diskMountPoint = report.Disk.MountPoint
	}
	if report.Network != nil {
		netUpload = report.Network.UploadBytes
		netDownload = report.Network.DownloadBytes
	}
	if report.Uptime != nil {
		uptimeDays = report.Uptime.Days
	}
	if report.Processes != nil {
		var err error
		processesJSON, err = json.Marshal(report.Processes)
		if err != nil {
			return err
		}
	}

	_, err := tx.Exec(query, serverID, report.Timestamp, cpuUsage, memUsed, memTotal, memUsagePercent, diskUsedGB, diskTotalGB, diskUsagePercent, diskMountPoint, netUpload, netDownload, uptimeDays, processesJSON, report.IPv4, report.IPv6)
	return err
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
