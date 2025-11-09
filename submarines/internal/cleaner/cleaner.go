package cleaner

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/nodepulse/admiral/submarines/internal/config"
)

// Cleaner orchestrates all data cleanup jobs
type Cleaner struct {
	db  *sql.DB
	cfg *config.Config
}

// New creates a new Cleaner instance
func New(db *sql.DB, cfg *config.Config) *Cleaner {
	return &Cleaner{
		db:  db,
		cfg: cfg,
	}
}

// Run executes all cleanup jobs
func (c *Cleaner) Run(ctx context.Context) error {
	logInfo("Starting cleanup jobs...")
	start := time.Now()

	// Job 1: Metrics retention cleanup
	if err := c.CleanOldMetrics(ctx); err != nil {
		return fmt.Errorf("metrics cleanup failed: %w", err)
	}

	// Job 2: Process snapshots retention cleanup
	if err := c.CleanOldProcessSnapshots(ctx); err != nil {
		return fmt.Errorf("process snapshots cleanup failed: %w", err)
	}

	// Future jobs can be added here:
	// - c.CleanOrphanedServers(ctx)
	// - c.CleanResolvedAlerts(ctx)
	// - c.CompactValkeyStreams(ctx)

	duration := time.Since(start)
	logInfo(fmt.Sprintf("All cleanup jobs completed in %v", duration))
	return nil
}

// logInfo logs info-level messages
func logInfo(msg string) {
	log.Printf("[INFO] %s", msg)
}
