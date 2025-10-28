package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nodepulse/admiral/submarines/internal/cleaner"
	"github.com/nodepulse/admiral/submarines/internal/config"
	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/handlers"
	"github.com/nodepulse/admiral/submarines/internal/parsers"
	"github.com/nodepulse/admiral/submarines/internal/valkey"
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

	// All messages are Prometheus format
	return processPrometheusMessage(db, payloadJSON)
}

func processPrometheusMessage(db *database.DB, payloadJSON string) error {
	// Deserialize Prometheus metrics payload
	var payload handlers.PrometheusMetricsPayload
	if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		return err
	}

	// Get server ID from payload (this is the server_id text field)
	serverID := payload.ServerID

	// Start transaction
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert all Prometheus metrics as samples using the server_id directly
	if err := insertPrometheusMetrics(tx, serverID, payload.Metrics); err != nil {
		return err
	}

	// Update server's last_seen_at timestamp to mark it as online
	// This allows the dashboard to show the server as "Online" when metrics are flowing
	if err := updateServerLastSeen(tx, serverID); err != nil {
		log.Printf("[WARN] Failed to update last_seen_at for server %s: %v", serverID, err)
		// Don't fail the entire transaction if this update fails
		// Metrics are more important than the online status
	}

	// Commit transaction
	return tx.Commit()
}

func insertPrometheusMetrics(tx *sql.Tx, serverID string, metrics []*parsers.PrometheusMetric) error {
	query := `
		INSERT INTO admiral.metric_samples (
			server_id,
			metric_name,
			metric_type,
			labels,
			value,
			timestamp,
			sample_count,
			sample_sum,
			exemplar,
			exemplar_value,
			exemplar_timestamp,
			help_text,
			unit
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
		)
	`

	stmt, err := tx.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, metric := range metrics {
		// Convert labels map to JSON string
		var labelsJSON string
		if len(metric.Labels) > 0 {
			labelBytes, err := json.Marshal(metric.Labels)
			if err != nil {
				return err
			}
			labelsJSON = string(labelBytes)
		} else {
			labelsJSON = "{}"
		}

		// Convert exemplar map to JSON string if present
		var exemplarJSON *string
		if len(metric.Exemplar) > 0 {
			exemplarBytes, err := json.Marshal(metric.Exemplar)
			if err != nil {
				return err
			}
			exemplarStr := string(exemplarBytes)
			exemplarJSON = &exemplarStr
		}

		// Execute insert
		_, err = stmt.Exec(
			serverID,
			metric.Name,
			metric.Type,
			labelsJSON,
			metric.Value,
			metric.Timestamp,
			metric.SampleCount,
			metric.SampleSum,
			exemplarJSON,
			metric.ExemplarValue,
			metric.ExemplarTimestamp,
			metric.HelpText,
			metric.Unit,
		)
		if err != nil {
			return err
		}
	}

	return nil
}

// updateServerLastSeen updates the server's last_seen_at timestamp
// This is used to determine if a server is "online" in the dashboard
func updateServerLastSeen(tx *sql.Tx, serverID string) error {
	query := `
		UPDATE admiral.servers
		SET last_seen_at = NOW(), updated_at = NOW()
		WHERE server_id = $1
	`

	result, err := tx.Exec(query, serverID)
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
