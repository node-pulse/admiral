-- Up Migration
-- Add private_keys table for SSH key management
-- Supports Coolify-inspired SSH key management system

-- ============================================================
-- SECTION 1: Private Keys Table
-- ============================================================

-- Private keys table for SSH authentication
CREATE TABLE IF NOT EXISTS admiral.private_keys (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- User-friendly name
    description TEXT, -- Optional description
    private_key_content TEXT NOT NULL, -- Encrypted SSH private key
    public_key TEXT NOT NULL, -- SSH public key (not encrypted, safe to expose)
    fingerprint TEXT, -- SHA256 fingerprint for identification
    team_id INTEGER, -- For multi-tenancy support (future)

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SECTION 2: Indexes
-- ============================================================

-- Index for quick name lookups
CREATE INDEX IF NOT EXISTS idx_private_keys_name ON admiral.private_keys(name);

-- Index for team-based filtering (future multi-tenancy)
CREATE INDEX IF NOT EXISTS idx_private_keys_team_id ON admiral.private_keys(team_id);

-- Index for server private_key_id lookup (no FK, application-level relationship)
CREATE INDEX IF NOT EXISTS idx_servers_private_key_id ON admiral.servers(private_key_id);

-- ============================================================
-- SECTION 3: Triggers
-- ============================================================

-- Add updated_at trigger for private_keys
CREATE TRIGGER update_private_keys_updated_at
    BEFORE UPDATE ON admiral.private_keys
    FOR EACH ROW EXECUTE FUNCTION admiral.update_updated_at_column();


-- Down Migration
-- Rollback private_keys table and related constraints

-- Drop table (CASCADE will handle dependent indexes and triggers)
DROP TABLE IF EXISTS admiral.private_keys CASCADE;

-- Drop indexes on servers table (if they exist separately)
DROP INDEX IF EXISTS admiral.idx_servers_private_key_id;
