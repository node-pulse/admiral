-- Up Migration
-- Add status column to users table for account enable/disable functionality

ALTER TABLE admiral.users
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'disabled'));

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_users_status ON admiral.users(status);

-- Down Migration
-- Remove status column from users table

DROP INDEX IF EXISTS admiral.idx_users_status;
ALTER TABLE admiral.users DROP COLUMN IF EXISTS status;
