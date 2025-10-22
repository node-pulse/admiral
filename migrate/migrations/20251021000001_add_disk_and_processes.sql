-- Up Migration
-- Add disk and processes metrics to the schema
-- Extends the metrics table to match the full agent JSON payload

-- ============================================================
-- SECTION 1: Add Disk Metrics to metrics table
-- ============================================================

ALTER TABLE submarines.metrics
    ADD COLUMN IF NOT EXISTS disk_used_gb DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS disk_total_gb DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS disk_usage_percent DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS disk_mount_point VARCHAR(255);

-- ============================================================
-- SECTION 2: Add Processes Data to metrics table
-- ============================================================

-- Store processes data as JSONB for flexibility
-- This allows us to store arrays of top CPU and memory processes
ALTER TABLE submarines.metrics
    ADD COLUMN IF NOT EXISTS processes JSONB;

-- Add GIN index for processes JSONB column for efficient querying
CREATE INDEX IF NOT EXISTS idx_metrics_processes ON submarines.metrics USING GIN(processes);

-- ============================================================
-- SECTION 3: Add Comment Documentation
-- ============================================================

COMMENT ON COLUMN submarines.metrics.disk_used_gb IS 'Disk space used in gigabytes';
COMMENT ON COLUMN submarines.metrics.disk_total_gb IS 'Total disk space in gigabytes';
COMMENT ON COLUMN submarines.metrics.disk_usage_percent IS 'Disk usage percentage (0-100)';
COMMENT ON COLUMN submarines.metrics.disk_mount_point IS 'Disk mount point (e.g., /, /home)';
COMMENT ON COLUMN submarines.metrics.processes IS 'Process information including top_cpu and top_memory arrays';


-- Down Migration
-- Rollback disk and processes metrics addition

ALTER TABLE submarines.metrics
    DROP COLUMN IF EXISTS disk_used_gb,
    DROP COLUMN IF EXISTS disk_total_gb,
    DROP COLUMN IF EXISTS disk_usage_percent,
    DROP COLUMN IF EXISTS disk_mount_point,
    DROP COLUMN IF EXISTS processes;

DROP INDEX IF EXISTS submarines.idx_metrics_processes;
