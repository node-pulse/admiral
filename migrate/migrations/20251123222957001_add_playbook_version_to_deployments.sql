-- Up Migration
-- Add playbook_version column to deployments table

ALTER TABLE admiral.deployments
ADD COLUMN IF NOT EXISTS playbook_version VARCHAR(50);

COMMENT ON COLUMN admiral.deployments.playbook_version IS 'Version of the playbook at the time of deployment';

-- Down Migration
-- Uncomment below to rollback:
ALTER TABLE admiral.deployments DROP COLUMN IF EXISTS playbook_version;
