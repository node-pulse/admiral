-- Up Migration
-- Add private_keys table for SSH key management
-- Supports Coolify-inspired SSH key management system

-- ============================================================
-- SECTION 1: Private Keys Table
-- ============================================================

-- Private keys table for SSH authentication
CREATE TABLE IF NOT EXISTS submarines.private_keys (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- User-friendly name
    description TEXT, -- Optional description
    private_key_content TEXT NOT NULL, -- Encrypted SSH private key (Rails ActiveRecord::Encryption)
    public_key TEXT NOT NULL, -- SSH public key (not encrypted, safe to expose)
    fingerprint TEXT, -- SHA256 fingerprint for identification
    team_id INTEGER, -- For multi-tenancy support (future)

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SECTION 2: Foreign Key Constraint
-- ============================================================

-- Add foreign key constraint from servers to private_keys
ALTER TABLE submarines.servers
    ADD CONSTRAINT fk_servers_private_key
    FOREIGN KEY (private_key_id)
    REFERENCES submarines.private_keys(id)
    ON DELETE RESTRICT; -- Prevent deletion of keys in use

-- ============================================================
-- SECTION 3: Indexes
-- ============================================================

-- Index for quick name lookups
CREATE INDEX IF NOT EXISTS idx_private_keys_name ON submarines.private_keys(name);

-- Index for team-based filtering (future multi-tenancy)
CREATE INDEX IF NOT EXISTS idx_private_keys_team_id ON submarines.private_keys(team_id);

-- Index for server private_key_id foreign key
CREATE INDEX IF NOT EXISTS idx_servers_private_key_id ON submarines.servers(private_key_id);

-- ============================================================
-- SECTION 4: Triggers
-- ============================================================

-- Add updated_at trigger for private_keys
CREATE TRIGGER update_private_keys_updated_at
    BEFORE UPDATE ON submarines.private_keys
    FOR EACH ROW EXECUTE FUNCTION submarines.update_updated_at_column();


-- Down Migration
-- Rollback private_keys table and related constraints

-- Drop foreign key constraint
ALTER TABLE submarines.servers DROP CONSTRAINT IF EXISTS fk_servers_private_key;

-- Drop table (CASCADE will handle dependent indexes and triggers)
DROP TABLE IF EXISTS submarines.private_keys CASCADE;

-- Drop indexes on servers table (if they exist separately)
DROP INDEX IF EXISTS submarines.idx_servers_private_key_id;
