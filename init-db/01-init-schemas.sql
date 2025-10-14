-- Create separate schemas for each service
-- This provides logical separation and better security

-- Schema for Better Auth (Next.js authentication)
CREATE SCHEMA IF NOT EXISTS better_auth;

-- Schema for Ory Kratos (identity management)
CREATE SCHEMA IF NOT EXISTS kratos;

-- Schema for Backend API (Go-Gin)
CREATE SCHEMA IF NOT EXISTS backend;

-- Set appropriate permissions
GRANT ALL PRIVILEGES ON SCHEMA better_auth TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA kratos TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA backend TO postgres;

-- Set default search path for public schema
ALTER DATABASE nodepulse SET search_path TO public, better_auth, backend;
