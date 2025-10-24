-- Up Migration
-- Create SSH session recordings table for full terminal playback
-- Required for PCI-DSS, SOC2, HIPAA compliance in some industries

CREATE TABLE IF NOT EXISTS admiral.ssh_session_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES admiral.ssh_sessions(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL, -- Order of events within session
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    event_type VARCHAR(20) NOT NULL, -- 'input', 'output', 'resize', 'disconnect'
    data TEXT NOT NULL, -- Terminal data (base64 encoded for binary safety)
    data_size INTEGER, -- Size in bytes before encoding
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for playback and queries
CREATE INDEX IF NOT EXISTS idx_ssh_recordings_session ON admiral.ssh_session_recordings(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_ssh_recordings_timestamp ON admiral.ssh_session_recordings(timestamp);
CREATE INDEX IF NOT EXISTS idx_ssh_recordings_event_type ON admiral.ssh_session_recordings(event_type);

-- Add comments
COMMENT ON TABLE admiral.ssh_session_recordings IS 'Full SSH session recordings for compliance and troubleshooting. Contains all terminal I/O. WARNING: May contain sensitive data (passwords, keys).';
COMMENT ON COLUMN admiral.ssh_session_recordings.sequence IS 'Sequential order of events (1, 2, 3...). Used for replay.';
COMMENT ON COLUMN admiral.ssh_session_recordings.event_type IS 'Type of event: input (user typed), output (server response), resize (terminal size change), disconnect (session end)';
COMMENT ON COLUMN admiral.ssh_session_recordings.data IS 'Base64-encoded terminal data for binary safety';
COMMENT ON COLUMN admiral.ssh_session_recordings.data_size IS 'Original data size before base64 encoding';

-- ============================================================
-- Insert SSH Session Recording Setting
-- ============================================================

INSERT INTO admiral.settings (key, value, description, tier) VALUES
    ('ssh_session_recording_enabled', 'false', 'Enable full SSH session recording (keystrokes and output) - Privacy risk!', 'enterprise')
ON CONFLICT (key) DO NOTHING;

-- Down Migration
-- Rollback SSH session recordings table and settings

-- Remove setting
DELETE FROM admiral.settings WHERE key = 'ssh_session_recording_enabled';

-- Drop indexes
DROP INDEX IF EXISTS admiral.idx_ssh_recordings_event_type;
DROP INDEX IF EXISTS admiral.idx_ssh_recordings_timestamp;
DROP INDEX IF EXISTS admiral.idx_ssh_recordings_session;

-- Drop table (CASCADE will handle dependent objects)
DROP TABLE IF EXISTS admiral.ssh_session_recordings CASCADE;
