-- Migration: Create process_snapshots table for per-process monitoring
-- Date: 2025-10-30
-- Description: Store process-level metrics from process_exporter
--              Enables "Top 10 Processes" feature in dashboard

-- Create process_snapshots table
CREATE TABLE IF NOT EXISTS admiral.process_snapshots (
    id BIGSERIAL PRIMARY KEY,
    server_id TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Process identification
    process_name TEXT NOT NULL,           -- Command name (e.g., "nginx", "postgres")

    -- Process metrics
    num_procs INTEGER NOT NULL,            -- Number of processes with this name
    cpu_seconds_total DOUBLE PRECISION,    -- Total CPU time consumed (counter)
    memory_bytes BIGINT,                   -- Resident memory (RSS) in bytes

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
-- Primary lookup: get all processes for a server within a time range
CREATE INDEX IF NOT EXISTS idx_process_snapshots_lookup
    ON admiral.process_snapshots(server_id, timestamp DESC);

-- Secondary lookup: get specific process history
CREATE INDEX IF NOT EXISTS idx_process_snapshots_server_name
    ON admiral.process_snapshots(server_id, process_name, timestamp DESC);

-- Composite index for top N queries (order by CPU/memory)
CREATE INDEX IF NOT EXISTS idx_process_snapshots_server_time
    ON admiral.process_snapshots(server_id, timestamp DESC, cpu_seconds_total DESC, memory_bytes DESC);

-- Comment on table
COMMENT ON TABLE admiral.process_snapshots IS 'Per-process metrics from process_exporter - used for Top 10 Processes feature';

-- Comment on columns
COMMENT ON COLUMN admiral.process_snapshots.server_id IS 'Reference to servers table (no FK for performance)';
COMMENT ON COLUMN admiral.process_snapshots.timestamp IS 'Timestamp when metrics were collected';
COMMENT ON COLUMN admiral.process_snapshots.process_name IS 'Process group name from process_exporter (groupname label)';
COMMENT ON COLUMN admiral.process_snapshots.num_procs IS 'Number of processes in this group at this timestamp';
COMMENT ON COLUMN admiral.process_snapshots.cpu_seconds_total IS 'Total CPU time consumed (counter - use LAG to calculate rate)';
COMMENT ON COLUMN admiral.process_snapshots.memory_bytes IS 'Resident Set Size (RSS) memory in bytes';
