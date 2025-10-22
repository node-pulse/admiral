-- Up Migration
-- Initial database schema for NodePulse Dashboard
-- Creates schemas and tables for Submarines service

-- ============================================================
-- SECTION 1: Create Schemas
-- ============================================================

-- Schema for Better Auth (Next.js authentication)
CREATE SCHEMA IF NOT EXISTS better_auth AUTHORIZATION admiral;

-- Schema for Ory Kratos (identity management)
CREATE SCHEMA IF NOT EXISTS kratos AUTHORIZATION admiral;

-- Schema for Submarines (Go-Gin - Agent Ingestion & Metrics API)
CREATE SCHEMA IF NOT EXISTS submarines AUTHORIZATION admiral;

-- Schema for Flagship (Rails - Admin Dashboard)
CREATE SCHEMA IF NOT EXISTS flagship AUTHORIZATION admiral;

-- ============================================================
-- SECTION 2: Submarines Schema Tables
-- ============================================================

-- Servers/Agents table
CREATE TABLE IF NOT EXISTS submarines.servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id TEXT UNIQUE NOT NULL, -- Agent-provided identifier (UUID or custom string)
    hostname TEXT NOT NULL,

    -- System Information (from agent)
    kernel TEXT,
    kernel_version TEXT,
    distro TEXT,
    distro_version TEXT,
    architecture TEXT,
    cpu_cores INTEGER,

    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Status
    status TEXT DEFAULT 'active', -- active, inactive, error
    last_seen_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Metrics table (time-series data)
CREATE TABLE IF NOT EXISTS submarines.metrics (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES submarines.servers(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

    -- CPU metrics
    cpu_usage_percent NUMERIC(5,2),

    -- Memory metrics
    memory_used_mb BIGINT,
    memory_total_mb BIGINT,
    memory_usage_percent NUMERIC(5,2),

    -- Disk metrics
    disk_used_gb DOUBLE PRECISION,
    disk_total_gb DOUBLE PRECISION,
    disk_usage_percent DOUBLE PRECISION,
    disk_mount_point TEXT,

    -- Network metrics (delta since last collection)
    network_upload_bytes BIGINT,
    network_download_bytes BIGINT,

    -- Uptime
    uptime_days NUMERIC(10,2),

    -- Processes data
    processes JSONB,

    -- IP addresses
    ipv4 TEXT,
    ipv6 TEXT,

    -- Raw data for future extensibility
    raw_data JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Alerts table
CREATE TABLE IF NOT EXISTS submarines.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES submarines.servers(id) ON DELETE CASCADE,

    -- Alert details
    alert_type TEXT NOT NULL, -- cpu, memory, disk, network, uptime
    severity TEXT NOT NULL, -- info, warning, critical
    message TEXT NOT NULL,

    -- Alert data
    threshold_value NUMERIC(10,2),
    current_value NUMERIC(10,2),
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Status
    status TEXT DEFAULT 'active', -- active, acknowledged, resolved
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Alert rules table
CREATE TABLE IF NOT EXISTS submarines.alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,

    -- Rule configuration
    metric_type TEXT NOT NULL, -- cpu_usage, memory_usage, etc.
    condition TEXT NOT NULL, -- gt (>), lt (<), eq (=), gte (>=), lte (<=)
    threshold NUMERIC(10,2) NOT NULL,
    duration_seconds INTEGER DEFAULT 60, -- Alert if condition persists for this duration

    -- Alert settings
    severity TEXT NOT NULL, -- info, warning, critical
    enabled BOOLEAN DEFAULT TRUE,

    -- Target servers (empty = all servers)
    server_ids JSONB DEFAULT '[]'::jsonb,
    server_tags JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SECTION 3: Indexes
-- ============================================================

-- B-tree indexes for common queries
CREATE INDEX IF NOT EXISTS idx_servers_server_id ON submarines.servers(server_id);
CREATE INDEX IF NOT EXISTS idx_servers_status ON submarines.servers(status);
CREATE INDEX IF NOT EXISTS idx_servers_last_seen ON submarines.servers(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_metrics_server_id ON submarines.metrics(server_id);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON submarines.metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_server_timestamp ON submarines.metrics(server_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_server_id ON submarines.alerts(server_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON submarines.alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON submarines.alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON submarines.alert_rules(enabled);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_servers_tags ON submarines.servers USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_servers_metadata ON submarines.servers USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_metrics_processes ON submarines.metrics USING GIN(processes);

-- ============================================================
-- SECTION 4: Functions and Triggers
-- ============================================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION submarines.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_servers_updated_at
    BEFORE UPDATE ON submarines.servers
    FOR EACH ROW EXECUTE FUNCTION submarines.update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at
    BEFORE UPDATE ON submarines.alerts
    FOR EACH ROW EXECUTE FUNCTION submarines.update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at
    BEFORE UPDATE ON submarines.alert_rules
    FOR EACH ROW EXECUTE FUNCTION submarines.update_updated_at_column();

-- ============================================================
-- SECTION 5: Default Data
-- ============================================================

-- Insert default alert rules
INSERT INTO submarines.alert_rules (name, description, metric_type, condition, threshold, severity) VALUES
    ('High CPU Usage', 'Alert when CPU usage exceeds 80%', 'cpu_usage', 'gt', 80.0, 'warning'),
    ('Critical CPU Usage', 'Alert when CPU usage exceeds 95%', 'cpu_usage', 'gt', 95.0, 'critical'),
    ('High Memory Usage', 'Alert when memory usage exceeds 85%', 'memory_usage', 'gt', 85.0, 'warning'),
    ('Critical Memory Usage', 'Alert when memory usage exceeds 95%', 'memory_usage', 'gt', 95.0, 'critical')
ON CONFLICT (name) DO NOTHING;


-- Down Migration
-- Rollback initial schema migration

-- Drop schemas with CASCADE (automatically drops all objects within)
-- This is safer and simpler than dropping individual objects
DROP SCHEMA IF EXISTS submarines CASCADE;
DROP SCHEMA IF EXISTS flagship CASCADE;
DROP SCHEMA IF EXISTS better_auth CASCADE;
-- Note: We don't drop kratos schema as it's managed by Ory Kratos migrations
