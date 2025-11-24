package main

import (
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"net/http"

	"github.com/nodepulse/admiral/submarines/internal/cleaner"
	"github.com/nodepulse/admiral/submarines/internal/config"
	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/handlers"
	"github.com/nodepulse/admiral/submarines/internal/health"
	"github.com/nodepulse/admiral/submarines/internal/logger"
	"github.com/nodepulse/admiral/submarines/internal/processor"
	"github.com/nodepulse/admiral/submarines/internal/retry"
	"github.com/nodepulse/admiral/submarines/internal/valkey"
)

const (
	streamKey     = handlers.MetricsStreamKey
	consumerGroup = "submarines-digest"
	dlqStreamKey  = "nodepulse:metrics:dlq" // Dead letter queue for poison messages
	batchSize     = 100                      // Process up to 100 messages per read
	idleSleep     = 5                        // seconds to sleep when no messages
	maxRetries    = 5                        // Max delivery attempts before moving to DLQ
)

var (
	// Generate unique consumer name for horizontal scaling
	consumerName = getConsumerName()
	// Structured logger
	log *slog.Logger
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
	// Initialize structured logger
	log = logger.New()
	log.Info("Starting digest worker",
		slog.String("consumer", consumerName),
		slog.Int("batch_size", batchSize),
		slog.Int("max_retries", maxRetries))

	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := database.New(cfg)
	if err != nil {
		log.Error("Failed to initialize database", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer db.Close()

	// Initialize Valkey
	valkeyClient, err := valkey.New(cfg)
	if err != nil {
		log.Error("Failed to initialize Valkey", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer valkeyClient.Close()

	// Create cancellable context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Create consumer group with retry strategy (handles Valkey not being fully ready)
	err = retry.WithExponentialBackoff(ctx, retry.DefaultConfig(), "Create consumer group", func() error {
		return valkeyClient.XGroupCreate(ctx, streamKey, consumerGroup, "0")
	})
	if err != nil {
		log.Error("Failed to create consumer group", slog.String("error", err.Error()))
		os.Exit(1)
	}

	// Create cleaner instance
	cleanerInstance := cleaner.New(db.DB, cfg)

	// Setup cleanup ticker (runs every 1 minute)
	cleanupTicker := time.NewTicker(1 * time.Minute)
	defer cleanupTicker.Stop()

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start health check HTTP server
	go startHealthServer(db, valkeyClient)

	log.Info("Digest worker ready",
		slog.String("cleanup_interval", "1 minute"),
		slog.String("stream", streamKey),
		slog.String("consumer_group", consumerGroup))

	// Run cleanup immediately on startup
	go runCleanup(ctx, cleanerInstance)

	// Main processing loop
	running := true
	for running {
		select {
		case sig := <-sigChan:
			log.Info("Received shutdown signal",
				slog.String("signal", sig.String()))
			log.Info("Cancelling context and draining current batch")
			cancel() // Cancel all in-flight operations
			running = false

		case <-cleanupTicker.C:
			// Run cleanup in background (don't block digest processing)
			go runCleanup(ctx, cleanerInstance)

		default:
			// Create context with timeout for each processing cycle
			processCtx, processCancel := context.WithTimeout(ctx, 30*time.Second)
			err := processMessages(processCtx, valkeyClient, db)
			processCancel()

			// Check if shutdown was requested
			if ctx.Err() != nil {
				log.Info("Context cancelled, stopping message processing")
				running = false
				break
			}

			if err != nil {
				log.Warn("Processing error",
					slog.String("error", err.Error()))
				time.Sleep(1 * time.Second) // Brief pause on error
			}
		}
	}

	log.Info("Digest worker stopped gracefully")
}

func processMessages(ctx context.Context, valkeyClient *valkey.Client, db *database.DB) error {
	// Health check database before processing
	if err := db.Ping(ctx); err != nil {
		log.Error("Database health check failed",
			slog.String("error", err.Error()))
		return fmt.Errorf("database unhealthy: %w", err)
	}

	// Health check Valkey before processing
	if err := valkeyClient.Ping(ctx); err != nil {
		log.Error("Valkey health check failed",
			slog.String("error", err.Error()))
		return fmt.Errorf("valkey unhealthy: %w", err)
	}

	// Check for poison messages and move to DLQ
	if err := handlePoisonMessages(ctx, valkeyClient); err != nil {
		log.Error("Failed to handle poison messages",
			slog.String("error", err.Error()))
		// Don't return error - continue processing new messages
	}

	// Try to read pending messages first (messages that were delivered but not ACKed)
	// Use "0" to read pending messages for this consumer
	messages, err := valkeyClient.XReadGroup(ctx, consumerGroup, consumerName, streamKey, "0", batchSize)
	if err != nil {
		log.Error("Failed to read pending messages from stream",
			slog.String("error", err.Error()),
			slog.String("stream", streamKey))
		return err
	}

	// If no pending messages, read new messages
	if len(messages) == 0 {
		messages, err = valkeyClient.XReadGroup(ctx, consumerGroup, consumerName, streamKey, ">", batchSize)
		if err != nil {
			log.Error("Failed to read new messages from stream",
				slog.String("error", err.Error()),
				slog.String("stream", streamKey))
			return err
		}
	}

	if len(messages) == 0 {
		// No messages, take a longer break to reduce polling
		time.Sleep(idleSleep * time.Second)
		return nil
	}

	log.Debug("Read messages from stream",
		slog.Int("count", len(messages)),
		slog.String("stream", streamKey))
	successCount := 0
	errorCount := 0
	processedIDs := make([]string, 0, len(messages))

	for _, msg := range messages {
		// Check if context cancelled (graceful shutdown)
		if ctx.Err() != nil {
			log.Info("Context cancelled, stopping batch processing")
			break
		}

		if err := processMessage(ctx, db, msg); err != nil {
			log.Error("Failed to process message",
				slog.String("message_id", msg.ID),
				slog.String("error", err.Error()))
			errorCount++
			// Don't ACK failed messages - they'll be retried
			continue
		}

		// Acknowledge successful processing
		valkeyClient.XAck(ctx, streamKey, consumerGroup, msg.ID)
		processedIDs = append(processedIDs, msg.ID)
		successCount++
	}

	// Delete processed messages from stream to free memory
	// This prevents unbounded stream growth that caused the original issue
	if len(processedIDs) > 0 {
		if err := valkeyClient.XDel(ctx, streamKey, processedIDs...); err != nil {
			log.Warn("Failed to delete processed messages from stream",
				slog.String("error", err.Error()),
				slog.Int("count", len(processedIDs)))
		}
	}

	if successCount > 0 {
		log.Info("Successfully inserted metrics to PostgreSQL",
			slog.Int("count", successCount))
	}
	if errorCount > 0 {
		log.Warn("Failed to process messages",
			slog.Int("count", errorCount))
	}

	return nil
}

func handlePoisonMessages(ctx context.Context, valkeyClient *valkey.Client) error {
	// Check pending messages for high retry counts
	pending, err := valkeyClient.XPending(ctx, streamKey, consumerGroup, 100)
	if err != nil {
		return fmt.Errorf("failed to get pending messages: %w", err)
	}

	if len(pending) == 0 {
		return nil
	}

	poisonCount := 0
	for _, msg := range pending {
		if msg.DeliveryCount >= maxRetries {
			// Fetch full message data
			fullMessages, err := valkeyClient.XRange(ctx, streamKey, msg.ID)
			if err != nil || len(fullMessages) == 0 {
				log.Warn("Failed to fetch poison message",
					slog.String("message_id", msg.ID),
					slog.String("error", err.Error()))
				continue
			}

			// Move to DLQ
			err = valkeyClient.MoveToDLQ(ctx, streamKey, dlqStreamKey, msg.ID, fullMessages[0].Fields, msg.DeliveryCount)
			if err != nil {
				log.Error("Failed to move message to DLQ",
					slog.String("message_id", msg.ID),
					slog.String("error", err.Error()))
				continue
			}

			// ACK the poison message to remove from pending
			valkeyClient.XAck(ctx, streamKey, consumerGroup, msg.ID)
			poisonCount++
		}
	}

	if poisonCount > 0 {
		log.Warn("Moved poison messages to dead letter queue",
			slog.Int("count", poisonCount),
			slog.String("dlq_stream", dlqStreamKey))
	}

	return nil
}

func processMessage(ctx context.Context, db *database.DB, msg valkey.StreamMessage) error {
	// Extract server_id and raw payload from stream message (new simplified format)
	serverID, ok := msg.Fields["server_id"]
	if !ok {
		return fmt.Errorf("missing server_id in message")
	}

	payloadJSON, ok := msg.Fields["payload"]
	if !ok {
		return fmt.Errorf("missing payload in message")
	}

	// Process with transaction - all-or-nothing approach (with context timeout)
	return processor.ProcessMessageWithTransaction(ctx, db, serverID, payloadJSON)
}

func startHealthServer(db *database.DB, valkeyClient *valkey.Client) {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", health.Handler(db, valkeyClient, "1.0.0"))

	server := &http.Server{
		Addr:    ":8081",
		Handler: mux,
	}

	log.Info("Health check server started", slog.String("addr", ":8081"))

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("Health server failed", slog.String("error", err.Error()))
	}
}

func runCleanup(ctx context.Context, c *cleaner.Cleaner) {
	log.Info("Running cleanup",
		slog.String("timestamp", time.Now().UTC().Format(time.RFC3339)))

	// Create context with timeout for this cleanup run (30s to not skip next runs)
	cleanupCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if err := c.Run(cleanupCtx); err != nil {
		log.Error("Cleanup failed",
			slog.String("error", err.Error()))
	} else {
		log.Info("Cleanup completed successfully")
	}
}
