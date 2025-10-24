-- Up Migration
-- Add SSH host key fingerprint for Trust On First Use (TOFU) verification
-- Protects against MITM attacks by verifying server identity

-- Add host key fingerprint field to servers table
ALTER TABLE admiral.servers
ADD COLUMN IF NOT EXISTS ssh_host_key_fingerprint VARCHAR(255);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_servers_ssh_host_key_fingerprint
ON admiral.servers(ssh_host_key_fingerprint);

-- Add comments to document security
COMMENT ON COLUMN admiral.servers.ssh_host_key_fingerprint IS 'SSH host key fingerprint (SHA256 base64). Stored on first connection for TOFU (Trust On First Use) verification. Prevents MITM attacks by ensuring the server identity matches on subsequent connections.';

-- Down Migration
-- Rollback SSH host key fingerprint column

DROP INDEX IF EXISTS admiral.idx_servers_ssh_host_key_fingerprint;
ALTER TABLE admiral.servers DROP COLUMN IF EXISTS ssh_host_key_fingerprint;
