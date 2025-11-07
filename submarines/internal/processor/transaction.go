package processor

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/handlers"
)

// ProcessMessageWithTransaction processes a message within a database transaction
// This ensures atomicity - either all data is saved, or none of it is (rollback)
func ProcessMessageWithTransaction(ctx context.Context, db *database.DB, serverID string, payloadJSON string) error {
	// Start transaction
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback() // Safe to call even after commit

	// Parse grouped payload: { "node_exporter": [...], "process_exporter": [...] }
	var groupedPayload map[string]json.RawMessage
	if err := json.Unmarshal([]byte(payloadJSON), &groupedPayload); err != nil {
		return fmt.Errorf("invalid JSON payload: %w", err)
	}

	// Process each exporter type within the transaction
	// If ANY exporter fails, the entire transaction rolls back
	for exporterName, rawData := range groupedPayload {
		log.Printf("[DEBUG] Processing %s for server %s", exporterName, serverID)

		switch exporterName {
		case "node_exporter":
			if err := processNodeExporter(ctx, tx, serverID, rawData); err != nil {
				return fmt.Errorf("failed to process node_exporter: %w", err)
			}

		case "process_exporter":
			if err := processProcessExporter(ctx, tx, serverID, rawData); err != nil {
				return fmt.Errorf("failed to process process_exporter: %w", err)
			}

		default:
			log.Printf("[WARN] Unknown exporter type: %s", exporterName)
		}
	}

	// Update server's last_seen_at timestamp
	if err := updateServerLastSeen(ctx, tx, serverID); err != nil {
		return fmt.Errorf("failed to update last_seen_at: %w", err)
	}

	// Commit transaction - only if everything succeeded
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// processNodeExporter handles node_exporter metrics within a transaction
func processNodeExporter(ctx context.Context, tx *sql.Tx, serverID string, rawData json.RawMessage) error {
	var snapshots []handlers.MetricSnapshot
	if err := json.Unmarshal(rawData, &snapshots); err != nil {
		return fmt.Errorf("failed to parse node_exporter data: %w", err)
	}

	// Insert each snapshot
	for _, snapshot := range snapshots {
		if err := insertMetricSnapshot(ctx, tx, serverID, &snapshot); err != nil {
			return fmt.Errorf("failed to insert node_exporter snapshot: %w", err)
		}
	}

	return nil
}

// processProcessExporter handles process_exporter metrics within a transaction
func processProcessExporter(ctx context.Context, tx *sql.Tx, serverID string, rawData json.RawMessage) error {
	var processSnapshots []handlers.ProcessSnapshot
	if err := json.Unmarshal(rawData, &processSnapshots); err != nil {
		return fmt.Errorf("failed to parse process_exporter data: %w", err)
	}

	if len(processSnapshots) == 0 {
		return nil
	}

	log.Printf("[DEBUG] Batch inserting %d process snapshots", len(processSnapshots))
	return insertProcessSnapshotsBatch(ctx, tx, serverID, processSnapshots)
}

// insertMetricSnapshot inserts a single node_exporter snapshot within a transaction
func insertMetricSnapshot(ctx context.Context, tx *sql.Tx, serverID string, snapshot *handlers.MetricSnapshot) error {
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

	_, err := tx.ExecContext(ctx, query,
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

// insertProcessSnapshotsBatch performs bulk insert of process snapshots within a transaction
func insertProcessSnapshotsBatch(ctx context.Context, tx *sql.Tx, serverID string, snapshots []handlers.ProcessSnapshot) error {
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
	_, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to batch insert %d process snapshots: %w", len(snapshots), err)
	}

	return nil
}

// updateServerLastSeen updates the server's last_seen_at timestamp within a transaction
func updateServerLastSeen(ctx context.Context, tx *sql.Tx, serverID string) error {
	query := `
		UPDATE admiral.servers
		SET last_seen_at = NOW(), updated_at = NOW()
		WHERE server_id = $1
	`

	result, err := tx.ExecContext(ctx, query, serverID)
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
