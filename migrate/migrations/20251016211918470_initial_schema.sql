-- Up Migration
-- Initial database schema for NodePulse Dashboard
-- Creates schemas and tables for Submarines service

-- ============================================================
-- SECTION 1: Create Schemas
-- ============================================================

-- Schema for Admiral (Unified schema for Submarines and Flagship)
-- All application tables for Go-Gin backend and Laravel dashboard
CREATE SCHEMA IF NOT EXISTS admiral AUTHORIZATION admiral;

-- ============================================================
-- SECTION 2: Admiral Schema Tables
-- ============================================================

-- Servers/Agents table
CREATE TABLE IF NOT EXISTS admiral.servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id TEXT UNIQUE NOT NULL, -- Agent-provided identifier (UUID or custom string)
    hostname TEXT NOT NULL,
    name TEXT, -- Friendly name for the server
    description TEXT, -- Optional description

    -- System Information (from agent)
    kernel TEXT,
    kernel_version TEXT,
    distro TEXT,
    distro_version TEXT,
    architecture TEXT,
    cpu_cores INTEGER,

    -- SSH Configuration
    ssh_host TEXT, -- IP or domain for SSH connection
    ssh_port INTEGER DEFAULT 22, -- SSH port
    ssh_username TEXT DEFAULT 'root', -- SSH username
    private_key_id INTEGER, -- Foreign key to admiral.private_keys
    is_reachable BOOLEAN DEFAULT FALSE, -- SSH connection status
    last_validated_at TIMESTAMP WITH TIME ZONE, -- Last SSH connection test

    -- Network Information (auto-populated from agent metrics)
    ipv4 TEXT, -- IPv4 address reported by agent
    ipv6 TEXT, -- IPv6 address reported by agent

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

-- ============================================================
-- Prometheus-First Metrics Schema
-- Designed to natively support Prometheus metric format with labels
-- ============================================================

-- Metric samples table (Prometheus-style time-series)
-- This is the core table storing all metric samples with labels
-- Supports all 4 Prometheus metric types: counter, gauge, histogram, summary
-- NOTE: No foreign key on server_id - allows metrics retention even after server deletion
CREATE TABLE IF NOT EXISTS admiral.metric_samples (
    id BIGSERIAL PRIMARY KEY,
    server_id TEXT NOT NULL, -- Agent's server_id (matches servers.server_id), no foreign key for performance

    -- Metric identification
    metric_name TEXT NOT NULL, -- e.g., "node_cpu_seconds_total", "node_memory_MemTotal_bytes"
    metric_type TEXT NOT NULL, -- counter, gauge, histogram, summary

    -- Labels (Prometheus labels as JSONB for flexibility)
    -- e.g., {"cpu": "0", "mode": "idle"} or {"device": "sda", "mountpoint": "/"}
    -- For histograms: {"le": "0.5"} where le = "less than or equal"
    -- For summaries: {"quantile": "0.99"}
    labels JSONB DEFAULT '{}'::jsonb,

    -- Value and timestamp
    value DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Histogram/Summary aggregations (for _sum and _count suffixed metrics)
    -- These are NULL for regular counter/gauge metrics
    -- For histograms/summaries: stores the cumulative count and sum
    sample_count BIGINT, -- Total number of observations (for _count metrics)
    sample_sum DOUBLE PRECISION, -- Sum of all observed values (for _sum metrics)

    -- Exemplars (optional, for histogram buckets)
    -- Links metrics to traces/logs
    -- e.g., {"trace_id": "abc123", "span_id": "def456"}
    exemplar JSONB,
    exemplar_value DOUBLE PRECISION, -- The exemplar's observed value
    exemplar_timestamp TIMESTAMP WITH TIME ZONE, -- When the exemplar was observed

    -- Metadata
    help_text TEXT, -- Metric description from # HELP
    unit TEXT, -- Metric unit (bytes, seconds, etc.)

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create composite index for efficient time-series queries
CREATE INDEX IF NOT EXISTS idx_metric_samples_lookup
    ON admiral.metric_samples(server_id, metric_name, timestamp DESC);

-- Create index for label queries (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_metric_samples_labels
    ON admiral.metric_samples USING GIN(labels);

-- Create index for metric name queries
CREATE INDEX IF NOT EXISTS idx_metric_samples_metric_name
    ON admiral.metric_samples(metric_name);

-- Alerts table
CREATE TABLE IF NOT EXISTS admiral.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES admiral.servers(id) ON DELETE CASCADE,

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
CREATE TABLE IF NOT EXISTS admiral.alert_rules (
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
CREATE INDEX IF NOT EXISTS idx_servers_server_id ON admiral.servers(server_id);
CREATE INDEX IF NOT EXISTS idx_servers_status ON admiral.servers(status);
CREATE INDEX IF NOT EXISTS idx_servers_last_seen ON admiral.servers(last_seen_at);

-- Prometheus metric_samples indexes (already created above near table definition)
-- idx_metric_samples_lookup: (server_id, metric_name, timestamp DESC)
-- idx_metric_samples_labels: GIN(labels)
-- idx_metric_samples_metric_name: (metric_name)

-- Alert indexes
CREATE INDEX IF NOT EXISTS idx_alerts_server_id ON admiral.alerts(server_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON admiral.alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON admiral.alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON admiral.alert_rules(enabled);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_servers_tags ON admiral.servers USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_servers_metadata ON admiral.servers USING GIN(metadata);

-- ============================================================
-- SECTION 4: Functions and Triggers
-- ============================================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION admiral.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_servers_updated_at
    BEFORE UPDATE ON admiral.servers
    FOR EACH ROW EXECUTE FUNCTION admiral.update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at
    BEFORE UPDATE ON admiral.alerts
    FOR EACH ROW EXECUTE FUNCTION admiral.update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at
    BEFORE UPDATE ON admiral.alert_rules
    FOR EACH ROW EXECUTE FUNCTION admiral.update_updated_at_column();

-- ============================================================
-- SECTION 5: Default Data
-- ============================================================

-- Insert default alert rules
INSERT INTO admiral.alert_rules (name, description, metric_type, condition, threshold, severity) VALUES
    ('High CPU Usage', 'Alert when CPU usage exceeds 80%', 'cpu_usage', 'gt', 80.0, 'warning'),
    ('Critical CPU Usage', 'Alert when CPU usage exceeds 95%', 'cpu_usage', 'gt', 95.0, 'critical'),
    ('High Memory Usage', 'Alert when memory usage exceeds 85%', 'memory_usage', 'gt', 85.0, 'warning'),
    ('Critical Memory Usage', 'Alert when memory usage exceeds 95%', 'memory_usage', 'gt', 95.0, 'critical')
ON CONFLICT (name) DO NOTHING;


-- Down Migration
-- Rollback initial schema migration

-- Drop schemas with CASCADE (automatically drops all objects within)
DROP SCHEMA IF EXISTS admiral CASCADE;
