-- Up Migration
-- Initial database schema for NodePulse Dashboard
-- Creates schemas and tables for Speedboats service

-- ============================================================
-- SECTION 1: Create Schemas
-- ============================================================

-- Schema for Better Auth (Next.js authentication)
CREATE SCHEMA IF NOT EXISTS better_auth;

-- Schema for Ory Kratos (identity management)
CREATE SCHEMA IF NOT EXISTS kratos;

-- Schema for Speedboats (Go-Gin - Agent Ingestion & Metrics API)
CREATE SCHEMA IF NOT EXISTS speedboats;

-- Schema for Flagship (Rails - Admin Dashboard)
CREATE SCHEMA IF NOT EXISTS flagship_ror;

-- Set appropriate permissions
GRANT ALL PRIVILEGES ON SCHEMA better_auth TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA kratos TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA speedboats TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA flagship_ror TO postgres;

-- Set default search path for database
ALTER DATABASE node_pulse_admiral SET search_path TO public, better_auth, speedboats, flagship_ror;

-- ============================================================
-- SECTION 2: Speedboats Schema Tables
-- ============================================================

SET search_path TO speedboats;

-- Servers/Agents table
CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,

    -- System Information (from agent)
    kernel VARCHAR(100),
    kernel_version VARCHAR(255),
    distro VARCHAR(100),
    distro_version VARCHAR(255),
    architecture VARCHAR(50),
    cpu_cores INTEGER,

    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, error
    last_seen_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Metrics table (time-series data)
CREATE TABLE IF NOT EXISTS metrics (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

    -- CPU metrics
    cpu_usage_percent NUMERIC(5,2),

    -- Memory metrics
    memory_used_mb BIGINT,
    memory_total_mb BIGINT,
    memory_usage_percent NUMERIC(5,2),

    -- Network metrics (delta since last collection)
    network_upload_bytes BIGINT,
    network_download_bytes BIGINT,

    -- Uptime
    uptime_days NUMERIC(10,2),

    -- Raw data for future extensibility
    raw_data JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,

    -- Alert details
    alert_type VARCHAR(50) NOT NULL, -- cpu, memory, disk, network, uptime
    severity VARCHAR(20) NOT NULL, -- info, warning, critical
    message TEXT NOT NULL,

    -- Alert data
    threshold_value NUMERIC(10,2),
    current_value NUMERIC(10,2),
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Status
    status VARCHAR(20) DEFAULT 'active', -- active, acknowledged, resolved
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Alert rules table
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Rule configuration
    metric_type VARCHAR(50) NOT NULL, -- cpu_usage, memory_usage, etc.
    condition VARCHAR(20) NOT NULL, -- gt (>), lt (<), eq (=), gte (>=), lte (<=)
    threshold NUMERIC(10,2) NOT NULL,
    duration_seconds INTEGER DEFAULT 60, -- Alert if condition persists for this duration

    -- Alert settings
    severity VARCHAR(20) NOT NULL, -- info, warning, critical
    enabled BOOLEAN DEFAULT TRUE,

    -- Target servers (empty = all servers)
    server_ids JSONB DEFAULT '[]'::jsonb,
    server_tags JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Buffered metrics table (from agent buffer on failure)
CREATE TABLE IF NOT EXISTS buffered_metrics (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    buffer_file VARCHAR(255),
    metrics JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- SECTION 3: Indexes
-- ============================================================

-- B-tree indexes for common queries
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_servers_last_seen ON servers(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_metrics_server_id ON metrics(server_id);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_server_timestamp ON metrics(server_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_server_id ON alerts(server_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_buffered_metrics_server_id ON buffered_metrics(server_id);
CREATE INDEX IF NOT EXISTS idx_buffered_metrics_processed ON buffered_metrics(processed);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_servers_tags ON servers USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_servers_metadata ON servers USING GIN(metadata);

-- ============================================================
-- SECTION 4: Functions and Triggers
-- ============================================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON servers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SECTION 5: Default Data
-- ============================================================

-- Insert default alert rules
INSERT INTO alert_rules (name, description, metric_type, condition, threshold, severity) VALUES
    ('High CPU Usage', 'Alert when CPU usage exceeds 80%', 'cpu_usage', 'gt', 80.0, 'warning'),
    ('Critical CPU Usage', 'Alert when CPU usage exceeds 95%', 'cpu_usage', 'gt', 95.0, 'critical'),
    ('High Memory Usage', 'Alert when memory usage exceeds 85%', 'memory_usage', 'gt', 85.0, 'warning'),
    ('Critical Memory Usage', 'Alert when memory usage exceeds 95%', 'memory_usage', 'gt', 95.0, 'critical')
ON CONFLICT DO NOTHING;

-- Reset search path
RESET search_path;


-- Down Migration
-- Rollback initial schema migration

SET search_path TO speedboats;

-- Drop triggers
DROP TRIGGER IF EXISTS update_alert_rules_updated_at ON alert_rules;
DROP TRIGGER IF EXISTS update_alerts_updated_at ON alerts;
DROP TRIGGER IF EXISTS update_servers_updated_at ON servers;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables (in reverse order of dependencies)
DROP TABLE IF EXISTS buffered_metrics;
DROP TABLE IF EXISTS alert_rules;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS metrics;
DROP TABLE IF EXISTS servers;

RESET search_path;

-- Drop schemas (Kratos manages its own schema, so we skip it)
DROP SCHEMA IF EXISTS flagship_ror CASCADE;
DROP SCHEMA IF EXISTS speedboats CASCADE;
DROP SCHEMA IF EXISTS better_auth CASCADE;
-- Note: We don't drop kratos schema as it's managed by Ory Kratos migrations
