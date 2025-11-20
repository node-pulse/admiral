-- Up Migration
-- Add locale column to users table for multi-language support

-- Add locale column to admiral.users
ALTER TABLE admiral.users
ADD COLUMN IF NOT EXISTS locale VARCHAR(10) NOT NULL DEFAULT 'en';

-- Add index for locale queries (optional, for analytics)
CREATE INDEX IF NOT EXISTS idx_users_locale ON admiral.users(locale);

-- Add comment for documentation
COMMENT ON COLUMN admiral.users.locale IS 'User preferred language locale (e.g., en, zh_CN)';


-- Down Migration
-- Remove locale column from users table

-- Remove index
DROP INDEX IF EXISTS admiral.idx_users_locale;

-- Remove column
ALTER TABLE admiral.users DROP COLUMN IF EXISTS locale;
