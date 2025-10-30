-- Up Migration
-- Add deployment tracking tables for Ansible agent deployments

CREATE TABLE IF NOT EXISTS admiral.deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Deployment configuration
    playbook VARCHAR(100) NOT NULL,  -- deploy-agent, update-agent, remove-agent, etc.
    server_filter JSONB,              -- Server selection criteria
    variables JSONB,                  -- Ansible extra vars

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed, cancelled
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Results
    total_servers INTEGER NOT NULL DEFAULT 0,
    successful_servers INTEGER NOT NULL DEFAULT 0,
    failed_servers INTEGER NOT NULL DEFAULT 0,
    skipped_servers INTEGER NOT NULL DEFAULT 0,

    -- Output
    output TEXT,                      -- Ansible stdout
    error_output TEXT,                -- Ansible stderr

    -- Metadata
    created_by UUID,                  -- User ID (if auth is implemented)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_deployments_status ON admiral.deployments(status);
CREATE INDEX idx_deployments_created_at ON admiral.deployments(created_at DESC);
CREATE INDEX idx_deployments_playbook ON admiral.deployments(playbook);

COMMENT ON TABLE admiral.deployments IS 'Tracks Ansible deployment jobs for agent installation';
COMMENT ON COLUMN admiral.deployments.playbook IS 'Name of the Ansible playbook executed';
COMMENT ON COLUMN admiral.deployments.server_filter IS 'JSON filter criteria used to select servers';
COMMENT ON COLUMN admiral.deployments.variables IS 'Extra variables passed to Ansible playbook';


CREATE TABLE IF NOT EXISTS admiral.deployment_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL, -- References admiral.deployments(id), no FK for flexibility
    server_id UUID NOT NULL, -- References admiral.servers(id), no FK for flexibility

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, running, success, failed, skipped
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Results
    changed BOOLEAN DEFAULT FALSE,
    output TEXT,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(deployment_id, server_id)
);

CREATE INDEX idx_deployment_servers_deployment ON admiral.deployment_servers(deployment_id);
CREATE INDEX idx_deployment_servers_server ON admiral.deployment_servers(server_id);
CREATE INDEX idx_deployment_servers_status ON admiral.deployment_servers(status);

COMMENT ON TABLE admiral.deployment_servers IS 'Pivot table tracking per-server deployment status';
COMMENT ON COLUMN admiral.deployment_servers.changed IS 'Whether Ansible made changes to this server';


-- Down Migration
-- Uncomment below to rollback:
-- DROP TABLE IF EXISTS admiral.deployment_servers;
-- DROP TABLE IF EXISTS admiral.deployments;
