-- Up Migration
-- Add Admiral settings table for application configuration
-- This table stores system-wide settings managed by Flagship admin UI

-- ============================================================
-- Create Admiral Settings Table
-- ============================================================

CREATE TABLE IF NOT EXISTS admiral.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE admiral.settings IS 'System-wide configuration settings managed by Flagship admin';
COMMENT ON COLUMN admiral.settings.key IS 'Unique setting identifier (e.g., retention_hours, tier, license_key)';
COMMENT ON COLUMN admiral.settings.value IS 'Setting value stored as JSONB for flexibility (strings, numbers, arrays, objects)';
COMMENT ON COLUMN admiral.settings.tier IS 'Which tier can modify this setting (free, pro, enterprise)';

-- ============================================================
-- Add Trigger for updated_at
-- ============================================================

CREATE TRIGGER update_admiral_settings_updated_at
    BEFORE UPDATE ON admiral.settings
    FOR EACH ROW EXECUTE FUNCTION admiral.update_updated_at_column();

-- ============================================================
-- Insert Default Settings
-- ============================================================

INSERT INTO admiral.settings (key, value, description, tier) VALUES
    -- Tier and licensing
    ('tier', '"free"', 'Current subscription tier (free, pro, enterprise)', 'free'),
    ('license_key', 'null', 'Pro/Enterprise license key for validation', 'pro'),
    ('license_expires_at', 'null', 'License expiration timestamp', 'pro'),

    -- Data retention (Free tier)
    ('retention_hours', '24', 'Metrics retention period in hours (24, 48, or 72 for free tier)', 'free'),
    ('retention_enabled', 'true', 'Enable automatic metrics cleanup', 'free'),

    -- Pro features (disabled by default)
    ('timescaledb_enabled', 'false', 'Use TimescaleDB hypertables and compression', 'pro'),
    ('s3_archival_enabled', 'false', 'Enable S3 compliance archival', 'pro'),
    ('s3_bucket', 'null', 'S3 bucket name for archival', 'pro'),
    ('s3_region', 'null', 'S3 region', 'pro'),
    ('continuous_aggregates_enabled', 'false', 'Enable pre-computed rollups (hourly/daily)', 'pro'),

    -- Alerting
    ('alerting_enabled', 'true', 'Enable alerting system', 'free'),
    ('webhook_notifications_enabled', 'false', 'Enable webhook notifications (Pro feature)', 'pro'),

    -- System metadata
    ('instance_id', 'null', 'Unique instance identifier for licensing', 'free'),
    ('admin_email', 'null', 'Admin email for notifications', 'free')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Create Index
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_admiral_settings_tier ON admiral.settings(tier);

-- Down Migration
-- Drop Admiral settings table

DROP TABLE IF EXISTS admiral.settings CASCADE;
