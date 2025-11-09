package cleaner

import (
	"context"
	"fmt"
)

// CleanOldProcessSnapshots removes process snapshots older than retention policy
func (c *Cleaner) CleanOldProcessSnapshots(ctx context.Context) error {
	logInfo("Starting process snapshots retention cleanup...")

	// Read retention settings from admiral.settings
	retentionSettings, err := c.getRetentionSettings(ctx)
	if err != nil {
		return fmt.Errorf("failed to read retention settings: %w", err)
	}

	if !retentionSettings.Enabled {
		logInfo("Process snapshots retention cleanup is disabled, skipping...")
		return nil
	}

	logInfo(fmt.Sprintf("Retention policy: %d hours", retentionSettings.RetentionHours))

	// Calculate total rows to delete (for logging)
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM admiral.process_snapshots
		WHERE timestamp < NOW() - INTERVAL '%d hours'
	`, retentionSettings.RetentionHours)

	var totalRows int64
	if err := c.db.QueryRowContext(ctx, countQuery).Scan(&totalRows); err != nil {
		return fmt.Errorf("failed to count old process snapshots: %w", err)
	}

	if totalRows == 0 {
		logInfo(fmt.Sprintf("✓ No old process snapshots to clean up (retention: %dh, all snapshots are recent)", retentionSettings.RetentionHours))
		return nil
	}

	logInfo(fmt.Sprintf("⚠ Found %d process snapshots older than %d hours - starting deletion...", totalRows, retentionSettings.RetentionHours))

	if c.cfg.DryRun {
		logInfo(fmt.Sprintf("[DRY RUN] Would delete %d old process snapshot records", totalRows))
		return nil
	}

	// Delete in batches to avoid long-running transactions
	const batchSize = 10000
	deletedTotal := int64(0)

	for {
		deleteQuery := fmt.Sprintf(`
			DELETE FROM admiral.process_snapshots
			WHERE id IN (
				SELECT id FROM admiral.process_snapshots
				WHERE timestamp < NOW() - INTERVAL '%d hours'
				ORDER BY timestamp ASC
				LIMIT %d
			)
		`, retentionSettings.RetentionHours, batchSize)

		result, err := c.db.ExecContext(ctx, deleteQuery)
		if err != nil {
			return fmt.Errorf("failed to delete old process snapshots: %w", err)
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			break // No more rows to delete
		}

		deletedTotal += rowsAffected
		logInfo(fmt.Sprintf("🗑️ Deleted batch: %d rows (progress: %d/%d)", rowsAffected, deletedTotal, totalRows))

		// Check context cancellation
		select {
		case <-ctx.Done():
			return fmt.Errorf("cleanup cancelled: %w", ctx.Err())
		default:
			// Continue
		}
	}

	logInfo(fmt.Sprintf("✅ Cleanup complete - deleted %d old process snapshot records", deletedTotal))
	return nil
}
