-- Up Migration
-- Create server_private_keys pivot table for many-to-many relationship
-- A server can have multiple SSH keys, and a key can be used by multiple servers

-- ============================================================
-- SECTION 2: Create pivot table
-- ============================================================

-- Pivot table for server and private key relationships
CREATE TABLE IF NOT EXISTS admiral.server_private_keys (
    id SERIAL PRIMARY KEY,
    server_id UUID NOT NULL, -- References admiral.servers(id), no FK for flexibility
    private_key_id INTEGER NOT NULL, -- References admiral.private_keys(id), no FK for flexibility

    -- Purpose/label for this key on this server
    purpose TEXT DEFAULT 'default', -- default, backup, deployment, monitoring, etc.

    -- Track if this is the primary key for this server
    is_primary BOOLEAN DEFAULT FALSE,

    -- Track last usage
    last_used_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure a server can't have the same key twice with same purpose
    UNIQUE(server_id, private_key_id, purpose)
);

-- ============================================================
-- SECTION 3: Indexes
-- ============================================================

-- Index for finding all keys for a server
CREATE INDEX IF NOT EXISTS idx_server_private_keys_server_id ON admiral.server_private_keys(server_id);

-- Index for finding all servers using a key
CREATE INDEX IF NOT EXISTS idx_server_private_keys_private_key_id ON admiral.server_private_keys(private_key_id);

-- Index for finding primary keys
CREATE INDEX IF NOT EXISTS idx_server_private_keys_is_primary ON admiral.server_private_keys(is_primary) WHERE is_primary = TRUE;

-- ============================================================
-- SECTION 4: Triggers
-- ============================================================

-- Add updated_at trigger
CREATE TRIGGER update_server_private_keys_updated_at
    BEFORE UPDATE ON admiral.server_private_keys
    FOR EACH ROW EXECUTE FUNCTION admiral.update_updated_at_column();

-- ============================================================
-- SECTION 5: Constraint to ensure only one primary key per server
-- ============================================================

-- Create a unique partial index to ensure only one primary key per server
CREATE UNIQUE INDEX IF NOT EXISTS idx_server_private_keys_one_primary_per_server
    ON admiral.server_private_keys(server_id)
    WHERE is_primary = TRUE;


-- Down Migration
-- Rollback server_private_keys pivot table

-- Drop the pivot table (CASCADE handles indexes and triggers)
DROP TABLE IF EXISTS admiral.server_private_keys CASCADE;
