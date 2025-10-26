-- Up Migration
-- Add Laravel Flagship tables to the admiral schema
-- Includes: users, authentication, sessions, cache, and job queue tables

-- ============================================================
-- SECTION 1: User Authentication Tables
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS admiral.users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    password VARCHAR(255) NOT NULL,
    remember_token VARCHAR(100),

    -- Role-based access control
    role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),

    -- Two-factor authentication columns
    two_factor_secret TEXT,
    two_factor_recovery_codes TEXT,
    two_factor_confirmed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add index for role queries
CREATE INDEX IF NOT EXISTS idx_users_role ON admiral.users(role);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS admiral.password_reset_tokens (
    email VARCHAR(255) PRIMARY KEY,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE
);

-- Sessions table
CREATE TABLE IF NOT EXISTS admiral.sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id BIGINT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    payload TEXT NOT NULL,
    last_activity INTEGER NOT NULL
);

-- ============================================================
-- SECTION 2: Cache Tables
-- ============================================================

-- Cache table
CREATE TABLE IF NOT EXISTS admiral.cache (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    expiration INTEGER NOT NULL
);

-- Cache locks table
CREATE TABLE IF NOT EXISTS admiral.cache_locks (
    key VARCHAR(255) PRIMARY KEY,
    owner VARCHAR(255) NOT NULL,
    expiration INTEGER NOT NULL
);

-- ============================================================
-- SECTION 3: Job Queue Tables
-- ============================================================

-- Jobs table
CREATE TABLE IF NOT EXISTS admiral.jobs (
    id BIGSERIAL PRIMARY KEY,
    queue VARCHAR(255) NOT NULL,
    payload TEXT NOT NULL,
    attempts SMALLINT NOT NULL,
    reserved_at INTEGER,
    available_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- Job batches table
CREATE TABLE IF NOT EXISTS admiral.job_batches (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    total_jobs INTEGER NOT NULL,
    pending_jobs INTEGER NOT NULL,
    failed_jobs INTEGER NOT NULL,
    failed_job_ids TEXT NOT NULL,
    options TEXT,
    cancelled_at INTEGER,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
);

-- Failed jobs table
CREATE TABLE IF NOT EXISTS admiral.failed_jobs (
    id BIGSERIAL PRIMARY KEY,
    uuid VARCHAR(255) UNIQUE NOT NULL,
    connection TEXT NOT NULL,
    queue TEXT NOT NULL,
    payload TEXT NOT NULL,
    exception TEXT NOT NULL,
    failed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SECTION 4: Indexes
-- ============================================================

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON admiral.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON admiral.sessions(last_activity);

-- Jobs indexes
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON admiral.jobs(queue);

-- ============================================================
-- SECTION 5: Triggers
-- ============================================================

-- Add updated_at trigger for users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON admiral.users
    FOR EACH ROW EXECUTE FUNCTION admiral.update_updated_at_column();


-- Down Migration
-- Rollback Laravel Flagship tables

-- Drop tables in reverse order (respecting dependencies)
DROP TABLE IF EXISTS admiral.failed_jobs;
DROP TABLE IF EXISTS admiral.job_batches;
DROP TABLE IF EXISTS admiral.jobs;
DROP TABLE IF EXISTS admiral.cache_locks;
DROP TABLE IF EXISTS admiral.cache;
DROP TABLE IF EXISTS admiral.sessions;
DROP TABLE IF EXISTS admiral.password_reset_tokens;
DROP TABLE IF EXISTS admiral.users;
