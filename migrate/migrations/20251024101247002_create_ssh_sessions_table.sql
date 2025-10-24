-- Up Migration
-- Create SSH sessions table for compliance and auditing
-- Tracks who accessed which servers, when, and for how long

CREATE TABLE IF NOT EXISTS admiral.ssh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    server_id UUID NOT NULL REFERENCES admiral.servers(id) ON DELETE CASCADE,
    user_id BIGINT, -- Foreign key to users table (Flagship/Laravel user who opened terminal)
    better_auth_id TEXT, -- Better Auth user ID (if using Better Auth instead of Laravel auth)
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    ip_address INET,
    user_agent TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed', 'failed', 'terminated'
    disconnect_reason TEXT,
    auth_method TEXT, -- 'private_key', 'password', 'unknown'
    ssh_username TEXT, -- SSH username used for connection
    ssh_host TEXT, -- SSH host connected to
    ssh_port INTEGER, -- SSH port used
    host_key_fingerprint TEXT, -- Host key fingerprint at connection time
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ssh_sessions_server ON admiral.ssh_sessions(server_id);
CREATE INDEX IF NOT EXISTS idx_ssh_sessions_user ON admiral.ssh_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ssh_sessions_started ON admiral.ssh_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssh_sessions_status ON admiral.ssh_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ssh_sessions_session_id ON admiral.ssh_sessions(session_id);

-- Add comments
COMMENT ON TABLE admiral.ssh_sessions IS 'SSH session audit log. Tracks all SSH terminal connections for compliance (PCI-DSS, SOC2, HIPAA).';
COMMENT ON COLUMN admiral.ssh_sessions.session_id IS 'WebSocket session identifier (matches handler sessionID)';
COMMENT ON COLUMN admiral.ssh_sessions.user_id IS 'Foreign key to users table (Flagship/Laravel user who initiated the connection)';
COMMENT ON COLUMN admiral.ssh_sessions.better_auth_id IS 'Better Auth user ID (if using Better Auth authentication instead of Laravel)';
COMMENT ON COLUMN admiral.ssh_sessions.duration_seconds IS 'Calculated on session end: ended_at - started_at';
COMMENT ON COLUMN admiral.ssh_sessions.status IS 'Session status: active (in progress), completed (normal close), failed (connection error), terminated (forced close)';
COMMENT ON COLUMN admiral.ssh_sessions.auth_method IS 'SSH authentication method used: private_key, password, or unknown';

-- ============================================================
-- Insert SSH Session Logging Setting
-- ============================================================

INSERT INTO admiral.settings (key, value, description, tier) VALUES
    ('ssh_session_logging_enabled', 'true', 'Enable SSH session metadata logging (login/logout events)', 'free')
ON CONFLICT (key) DO NOTHING;

-- Down Migration
-- Rollback SSH sessions table and settings

-- Remove setting
DELETE FROM admiral.settings WHERE key = 'ssh_session_logging_enabled';

-- Drop indexes
DROP INDEX IF EXISTS admiral.idx_ssh_sessions_session_id;
DROP INDEX IF EXISTS admiral.idx_ssh_sessions_status;
DROP INDEX IF EXISTS admiral.idx_ssh_sessions_started;
DROP INDEX IF EXISTS admiral.idx_ssh_sessions_user;
DROP INDEX IF EXISTS admiral.idx_ssh_sessions_server;

-- Drop table (CASCADE will handle dependent objects)
DROP TABLE IF EXISTS admiral.ssh_sessions CASCADE;
