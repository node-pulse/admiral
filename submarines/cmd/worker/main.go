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
	"github.com/nodepulse/dashboard/backend/internal/config"
	"github.com/nodepulse/dashboard/backend/internal/database"
	"github.com/nodepulse/dashboard/backend/internal/handlers"
	"github.com/nodepulse/dashboard/backend/internal/models"
	"github.com/nodepulse/dashboard/backend/internal/valkey"
)

const (
	streamKey     = handlers.MetricsStreamKey
	consumerGroup = "nodepulse-workers"
	consumerName  = "worker-1" // TODO: Generate unique consumer ID
	batchSize     = 10
	blockTimeout  = 5000 // milliseconds
)

func main() {
	log.Println("Starting NodePulse metrics worker...")

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
	if err := valkeyClient.XGroupCreate(ctx, streamKey, consumerGroup, "0"); err != nil {
		log.Printf("Consumer group creation note: %v (may already exist)", err)
	}

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	log.Printf("Worker started. Consuming from stream: %s", streamKey)

	// Main processing loop
	running := true
	for running {
		select {
		case <-sigChan:
			log.Println("Shutdown signal received, stopping worker...")
			running = false
		default:
			if err := processMessages(ctx, valkeyClient, db); err != nil {
				log.Printf("Error processing messages: %v", err)
				time.Sleep(1 * time.Second) // Brief pause on error
			}
		}
	}

	log.Println("Worker stopped gracefully")
}

func processMessages(ctx context.Context, valkeyClient *valkey.Client, db *database.DB) error {
	// Read messages from stream
	messages, err := valkeyClient.XReadGroup(ctx, consumerGroup, consumerName, streamKey, ">", batchSize)
	if err != nil {
		return err
	}

	if len(messages) == 0 {
		// No messages, sleep briefly
		time.Sleep(100 * time.Millisecond)
		return nil
	}

	log.Printf("Processing %d messages", len(messages))

	for _, msg := range messages {
		if err := processMessage(ctx, db, msg); err != nil {
			log.Printf("Failed to process message %s: %v", msg.ID, err)
			// Don't ACK failed messages - they'll be retried
			continue
		}

		// Acknowledge successful processing
		if err := valkeyClient.XAck(ctx, streamKey, consumerGroup, msg.ID); err != nil {
			log.Printf("Failed to ACK message %s: %v", msg.ID, err)
		}
	}

	return nil
}

func processMessage(ctx context.Context, db *database.DB, msg valkey.StreamMessage) error {
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

	// Upsert server
	if err := upsertServer(tx, serverID, &report); err != nil {
		return err
	}

	// Insert metrics
	if err := insertMetrics(tx, serverID, &report); err != nil {
		return err
	}

	// Commit transaction
	return tx.Commit()
}

func upsertServer(tx *sql.Tx, serverID uuid.UUID, report *models.MetricReport) error {
	query := `
		INSERT INTO backend.servers (id, hostname, kernel, kernel_version, distro, distro_version, architecture, cpu_cores, last_seen_at, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (id) DO UPDATE SET
			hostname = EXCLUDED.hostname,
			kernel = COALESCE(EXCLUDED.kernel, servers.kernel),
			kernel_version = COALESCE(EXCLUDED.kernel_version, servers.kernel_version),
			distro = COALESCE(EXCLUDED.distro, servers.distro),
			distro_version = COALESCE(EXCLUDED.distro_version, servers.distro_version),
			architecture = COALESCE(EXCLUDED.architecture, servers.architecture),
			cpu_cores = COALESCE(EXCLUDED.cpu_cores, servers.cpu_cores),
			last_seen_at = EXCLUDED.last_seen_at,
			status = EXCLUDED.status,
			updated_at = CURRENT_TIMESTAMP
	`

	var kernel, kernelVersion, distro, distroVersion, architecture *string
	var cpuCores *int

	if report.SystemInfo != nil {
		kernel = &report.SystemInfo.Kernel
		kernelVersion = &report.SystemInfo.KernelVersion
		distro = &report.SystemInfo.Distro
		distroVersion = &report.SystemInfo.DistroVersion
		architecture = &report.SystemInfo.Architecture
		cpuCores = &report.SystemInfo.CPUCores
	}

	_, err := tx.Exec(query, serverID, report.Hostname, kernel, kernelVersion, distro, distroVersion, architecture, cpuCores, time.Now(), "active")
	return err
}

func insertMetrics(tx *sql.Tx, serverID uuid.UUID, report *models.MetricReport) error {
	query := `
		INSERT INTO backend.metrics (
			server_id, timestamp,
			cpu_usage_percent,
			memory_used_mb, memory_total_mb, memory_usage_percent,
			network_upload_bytes, network_download_bytes,
			uptime_days
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`

	var cpuUsage *float64
	var memUsed, memTotal *int64
	var memUsagePercent *float64
	var netUpload, netDownload *int64
	var uptimeDays *float64

	if report.CPU != nil {
		cpuUsage = report.CPU.UsagePercent
	}
	if report.Memory != nil {
		memUsed = report.Memory.UsedMB
		memTotal = report.Memory.TotalMB
		memUsagePercent = report.Memory.UsagePercent
	}
	if report.Network != nil {
		netUpload = report.Network.UploadBytes
		netDownload = report.Network.DownloadBytes
	}
	if report.Uptime != nil {
		uptimeDays = report.Uptime.Days
	}

	_, err := tx.Exec(query, serverID, report.Timestamp, cpuUsage, memUsed, memTotal, memUsagePercent, netUpload, netDownload, uptimeDays)
	return err
}
