package cleaner

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/nodepulse/dashboard/backend/internal/models"
)

// CleanOldMetrics removes metrics older than retention policy
func (c *Cleaner) CleanOldMetrics(ctx context.Context) error {
	logInfo("Starting metrics retention cleanup...")

	// Read retention settings from flagship.settings
	retentionSettings, err := c.getRetentionSettings(ctx)
	if err != nil {
		return fmt.Errorf("failed to read retention settings: %w", err)
	}

	if !retentionSettings.Enabled {
		logInfo("Metrics retention cleanup is disabled, skipping...")
		return nil
	}

	logInfo(fmt.Sprintf("Retention policy: %d hours", retentionSettings.RetentionHours))

	// Calculate total rows to delete (for logging)
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM %s.metrics
		WHERE timestamp < NOW() - INTERVAL '%d hours'
	`, c.cfg.DBSchema, retentionSettings.RetentionHours)

	var totalRows int64
	if err := c.db.QueryRowContext(ctx, countQuery).Scan(&totalRows); err != nil {
		return fmt.Errorf("failed to count old metrics: %w", err)
	}

	if totalRows == 0 {
		logInfo("No metrics to clean up")
		return nil
	}

	logInfo(fmt.Sprintf("Found %d metrics older than %d hours", totalRows, retentionSettings.RetentionHours))

	if c.cfg.DryRun {
		logInfo(fmt.Sprintf("[DRY RUN] Would delete %d old metric records", totalRows))
		return nil
	}

	// Delete in batches to avoid long-running transactions
	const batchSize = 10000
	deletedTotal := int64(0)

	for {
		deleteQuery := fmt.Sprintf(`
			DELETE FROM %s.metrics
			WHERE id IN (
				SELECT id FROM %s.metrics
				WHERE timestamp < NOW() - INTERVAL '%d hours'
				ORDER BY timestamp ASC
				LIMIT %d
			)
		`, c.cfg.DBSchema, c.cfg.DBSchema, retentionSettings.RetentionHours, batchSize)

		result, err := c.db.ExecContext(ctx, deleteQuery)
		if err != nil {
			return fmt.Errorf("failed to delete old metrics: %w", err)
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			break // No more rows to delete
		}

		deletedTotal += rowsAffected
		logInfo(fmt.Sprintf("Deleted batch: %d rows (total: %d/%d)", rowsAffected, deletedTotal, totalRows))

		// Check context cancellation
		select {
		case <-ctx.Done():
			return fmt.Errorf("cleanup cancelled: %w", ctx.Err())
		default:
			// Continue
		}
	}

	logInfo(fmt.Sprintf("Deleted %d old metric records", deletedTotal))
	return nil
}

// getRetentionSettings reads retention policy from flagship.settings
func (c *Cleaner) getRetentionSettings(ctx context.Context) (*models.RetentionSettings, error) {
	// Default values (Free tier)
	settings := &models.RetentionSettings{
		RetentionHours: 24,
		Enabled:        true,
	}

	// Read from flagship.settings
	query := fmt.Sprintf(`
		SELECT key, value
		FROM %s.settings
		WHERE key IN ('retention_hours', 'retention_enabled')
	`, c.cfg.FlagshipDBSchema)

	rows, err := c.db.QueryContext(ctx, query)
	if err != nil {
		// If flagship.settings table doesn't exist yet, use defaults
		if err == sql.ErrNoRows {
			logInfo("flagship.settings table not found, using defaults")
			return settings, nil
		}
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var value models.JSONValue
		if err := rows.Scan(&key, &value); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}

		switch key {
		case "retention_hours":
			if hours, err := value.Int(); err == nil {
				settings.RetentionHours = hours
			}
		case "retention_enabled":
			if enabled, err := value.Bool(); err == nil {
				settings.Enabled = enabled
			}
		}
	}

	return settings, nil
}
