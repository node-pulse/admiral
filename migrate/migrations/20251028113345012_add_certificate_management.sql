-- Up Migration
-- Add certificate management tables for mTLS
-- Self-signed CA only (industry standard for internal mTLS)

-- ============================================================
-- SECTION 1: Certificate Authorities Table
-- ============================================================

-- Certificate Authorities (CA) for signing client certificates
-- Only self-signed CAs are supported
CREATE TABLE IF NOT EXISTS admiral.certificate_authorities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- User-friendly name (e.g., "Node Pulse Production CA")

    -- Certificate data
    certificate_pem TEXT NOT NULL, -- CA public certificate (PEM format)
    private_key_encrypted TEXT NOT NULL, -- Encrypted CA private key

    -- Validity period
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT true NOT NULL, -- Only one active CA at a time

    -- Metadata
    description TEXT,
    issuer_dn TEXT, -- Distinguished Name of issuer
    subject_dn TEXT, -- Distinguished Name of subject
    serial_number TEXT, -- CA certificate serial number
    key_algorithm TEXT, -- e.g., "RSA", "ECDSA"
    key_size INTEGER, -- e.g., 2048, 4096

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SECTION 2: Server Certificates Table
-- ============================================================

-- Client certificates for agent mTLS authentication
CREATE TABLE IF NOT EXISTS admiral.server_certificates (
    id SERIAL PRIMARY KEY,

    -- Relationships
    server_id TEXT NOT NULL, -- FK to servers.server_id (UUID)
    ca_id INTEGER NOT NULL, -- FK to certificate_authorities.id

    -- Certificate data
    certificate_pem TEXT NOT NULL, -- Client certificate (PEM format)
    private_key_encrypted TEXT NOT NULL, -- Encrypted client private key

    -- Certificate identity
    serial_number TEXT NOT NULL UNIQUE, -- Unique certificate serial number
    subject_dn TEXT NOT NULL, -- Distinguished Name (CN=<server_id>, O=Node Pulse, OU=Agent)
    fingerprint_sha256 TEXT, -- SHA256 fingerprint for quick lookup

    -- Validity period
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),

    -- Metadata
    key_algorithm TEXT, -- e.g., "RSA", "ECDSA"
    key_size INTEGER, -- e.g., 2048, 4096

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- SECTION 3: Certificate Revocations Table (CRL)
-- ============================================================

-- Certificate Revocation List for revoked certificates
CREATE TABLE IF NOT EXISTS admiral.certificate_revocations (
    id SERIAL PRIMARY KEY,

    -- Relationships
    server_certificate_id INTEGER NOT NULL, -- FK to server_certificates.id

    -- Revocation details
    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason TEXT, -- Reason for revocation (e.g., "key_compromise", "superseded", "cessation_of_operation")
    revoked_by INTEGER, -- FK to users.id (who revoked it)

    -- Metadata
    notes TEXT -- Additional notes
);

-- ============================================================
-- SECTION 4: Foreign Key Constraints
-- ============================================================

-- NOTE: No foreign key constraints per project requirements
-- Relationships are managed at the application level only
-- This avoids cascade complexities and keeps things flexible

-- ============================================================
-- SECTION 5: Indexes
-- ============================================================

-- Certificate Authorities indexes
CREATE INDEX IF NOT EXISTS idx_certificate_authorities_active
    ON admiral.certificate_authorities(is_active) WHERE is_active = true;

-- Server Certificates indexes
CREATE INDEX IF NOT EXISTS idx_server_certificates_server_id
    ON admiral.server_certificates(server_id);

CREATE INDEX IF NOT EXISTS idx_server_certificates_ca_id
    ON admiral.server_certificates(ca_id);

CREATE INDEX IF NOT EXISTS idx_server_certificates_serial
    ON admiral.server_certificates(serial_number);

CREATE INDEX IF NOT EXISTS idx_server_certificates_fingerprint
    ON admiral.server_certificates(fingerprint_sha256);

CREATE INDEX IF NOT EXISTS idx_server_certificates_status
    ON admiral.server_certificates(status);

CREATE INDEX IF NOT EXISTS idx_server_certificates_valid_until
    ON admiral.server_certificates(valid_until);

-- Composite index for quick lookup of active certificates for a server
CREATE INDEX IF NOT EXISTS idx_server_certificates_server_active
    ON admiral.server_certificates(server_id, status)
    WHERE status = 'active';

-- Certificate Revocations indexes
CREATE INDEX IF NOT EXISTS idx_certificate_revocations_cert_id
    ON admiral.certificate_revocations(server_certificate_id);

CREATE INDEX IF NOT EXISTS idx_certificate_revocations_revoked_at
    ON admiral.certificate_revocations(revoked_at);

-- ============================================================
-- SECTION 6: Triggers
-- ============================================================

-- Add updated_at trigger for certificate_authorities
CREATE TRIGGER update_certificate_authorities_updated_at
    BEFORE UPDATE ON admiral.certificate_authorities
    FOR EACH ROW EXECUTE FUNCTION admiral.update_updated_at_column();

-- Add updated_at trigger for server_certificates
CREATE TRIGGER update_server_certificates_updated_at
    BEFORE UPDATE ON admiral.server_certificates
    FOR EACH ROW EXECUTE FUNCTION admiral.update_updated_at_column();

-- ============================================================
-- SECTION 7: Helper Function for Certificate Expiration Check
-- ============================================================

-- Function to automatically mark expired certificates
CREATE OR REPLACE FUNCTION admiral.mark_expired_certificates()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE admiral.server_certificates
    SET status = 'expired'
    WHERE status = 'active'
    AND valid_until < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SECTION 8: Comments for Documentation
-- ============================================================

COMMENT ON TABLE admiral.certificate_authorities IS 'Self-signed Certificate Authorities for mTLS agent authentication';
COMMENT ON TABLE admiral.server_certificates IS 'Client certificates for agent mTLS authentication';
COMMENT ON TABLE admiral.certificate_revocations IS 'Certificate Revocation List (CRL) for revoked certificates';

COMMENT ON COLUMN admiral.certificate_authorities.private_key_encrypted IS 'Encrypted with MASTER_KEY - used for signing client certificates';
COMMENT ON COLUMN admiral.server_certificates.private_key_encrypted IS 'Encrypted with MASTER_KEY - used by agent for mTLS';
COMMENT ON COLUMN admiral.server_certificates.fingerprint_sha256 IS 'SHA256 fingerprint for quick certificate validation';


-- Down Migration
-- Rollback certificate management tables and related constraints

-- NOTE: No foreign key constraints to drop (managed at application level)

-- Drop function
DROP FUNCTION IF EXISTS admiral.mark_expired_certificates();

-- Drop tables (CASCADE will handle dependent indexes and triggers)
DROP TABLE IF EXISTS admiral.certificate_revocations CASCADE;
DROP TABLE IF EXISTS admiral.server_certificates CASCADE;
DROP TABLE IF EXISTS admiral.certificate_authorities CASCADE;
