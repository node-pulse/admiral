package certificates

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"database/sql"
	"encoding/pem"
	"fmt"
	"math/big"
	"time"
)

// ServerCertificate represents a client certificate for an agent
type ServerCertificate struct {
	ID                  int
	ServerID            string
	CAID                int
	CertificatePEM      string
	PrivateKeyEncrypted string
	SerialNumber        string
	SubjectDN           string
	FingerprintSHA256   string
	ValidFrom           time.Time
	ValidUntil          time.Time
	Status              string // "active", "revoked", "expired"
	KeyAlgorithm        string
	KeySize             int
	CreatedAt           time.Time
	UpdatedAt           time.Time
	RevokedAt           *time.Time
}

// CertGenerator handles client certificate generation
type CertGenerator struct {
	db        *sql.DB
	masterKey string
	caManager *CAManager
}

// NewCertGenerator creates a new certificate generator instance
func NewCertGenerator(db *sql.DB, masterKey string) *CertGenerator {
	return &CertGenerator{
		db:        db,
		masterKey: masterKey,
		caManager: NewCAManager(db, masterKey),
	}
}

// GenerateClientCertificate generates a new client certificate for an agent
func (g *CertGenerator) GenerateClientCertificate(serverID string, validityDays int) (*ServerCertificate, error) {
	// Get active CA
	ca, err := g.caManager.GetActiveCA()
	if err != nil {
		return nil, fmt.Errorf("failed to get active CA: %w", err)
	}

	// Load CA private key for signing
	caPrivateKey, caCert, err := g.caManager.LoadCAPrivateKey(ca)
	if err != nil {
		return nil, fmt.Errorf("failed to load CA private key: %w", err)
	}

	// Generate client RSA key pair (2048 bits for agents)
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	// Generate serial number
	serialNumber, err := GenerateSerialNumber()
	if err != nil {
		return nil, fmt.Errorf("failed to generate serial number: %w", err)
	}

	serialBigInt := new(big.Int)
	serialBigInt.SetString(serialNumber, 16)

	// Prepare certificate template
	notBefore := time.Now()
	notAfter := notBefore.Add(time.Duration(validityDays) * 24 * time.Hour)

	template := x509.Certificate{
		SerialNumber: serialBigInt,
		Subject: pkix.Name{
			CommonName:         serverID, // Server ID in CN for easy identification
			Organization:       []string{"Node Pulse"},
			OrganizationalUnit: []string{"Agent"},
		},
		NotBefore:             notBefore,
		NotAfter:              notAfter,
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		IsCA:                  false,
	}

	// Create certificate signed by CA
	certDER, err := x509.CreateCertificate(rand.Reader, &template, caCert, &privateKey.PublicKey, caPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create certificate: %w", err)
	}

	// Encode certificate to PEM
	certPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE",
		Bytes: certDER,
	})

	// Encode private key to PEM
	privateKeyDER := x509.MarshalPKCS1PrivateKey(privateKey)
	privateKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: privateKeyDER,
	})

	// Encrypt private key
	encryptedKey, err := EncryptPrivateKey(string(privateKeyPEM), g.masterKey)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt private key: %w", err)
	}

	// Calculate SHA256 fingerprint
	fingerprint := sha256.Sum256(certDER)
	fingerprintHex := fmt.Sprintf("%x", fingerprint)

	// Parse certificate for metadata
	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, fmt.Errorf("failed to parse certificate: %w", err)
	}

	serverCert := &ServerCertificate{
		ServerID:            serverID,
		CAID:                ca.ID,
		CertificatePEM:      string(certPEM),
		PrivateKeyEncrypted: encryptedKey,
		SerialNumber:        serialNumber,
		SubjectDN:           cert.Subject.String(),
		FingerprintSHA256:   fingerprintHex,
		ValidFrom:           cert.NotBefore,
		ValidUntil:          cert.NotAfter,
		Status:              "active",
		KeyAlgorithm:        "RSA",
		KeySize:             2048,
	}

	return serverCert, nil
}

// SaveCertificate stores a certificate in the database
func (g *CertGenerator) SaveCertificate(cert *ServerCertificate) error {
	err := g.db.QueryRow(`
		INSERT INTO admiral.server_certificates (
			server_id, ca_id, certificate_pem, private_key_encrypted,
			serial_number, subject_dn, fingerprint_sha256,
			valid_from, valid_until, status, key_algorithm, key_size
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, created_at, updated_at
	`, cert.ServerID, cert.CAID, cert.CertificatePEM, cert.PrivateKeyEncrypted,
		cert.SerialNumber, cert.SubjectDN, cert.FingerprintSHA256,
		cert.ValidFrom, cert.ValidUntil, cert.Status, cert.KeyAlgorithm, cert.KeySize,
	).Scan(&cert.ID, &cert.CreatedAt, &cert.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to insert certificate: %w", err)
	}

	return nil
}

// GetActiveCertificate retrieves the active certificate for a server
func (g *CertGenerator) GetActiveCertificate(serverID string) (*ServerCertificate, error) {
	cert := &ServerCertificate{}
	var revokedAt sql.NullTime

	err := g.db.QueryRow(`
		SELECT id, server_id, ca_id, certificate_pem, private_key_encrypted,
		       serial_number, subject_dn, fingerprint_sha256,
		       valid_from, valid_until, status, key_algorithm, key_size,
		       created_at, updated_at, revoked_at
		FROM admiral.server_certificates
		WHERE server_id = $1 AND status = 'active'
		ORDER BY created_at DESC
		LIMIT 1
	`, serverID).Scan(
		&cert.ID, &cert.ServerID, &cert.CAID, &cert.CertificatePEM, &cert.PrivateKeyEncrypted,
		&cert.SerialNumber, &cert.SubjectDN, &cert.FingerprintSHA256,
		&cert.ValidFrom, &cert.ValidUntil, &cert.Status, &cert.KeyAlgorithm, &cert.KeySize,
		&cert.CreatedAt, &cert.UpdatedAt, &revokedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("no active certificate found for server %s", serverID)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query certificate: %w", err)
	}

	if revokedAt.Valid {
		cert.RevokedAt = &revokedAt.Time
	}

	return cert, nil
}

// GetCertificateByID retrieves a certificate by its ID
func (g *CertGenerator) GetCertificateByID(certID int) (*ServerCertificate, error) {
	cert := &ServerCertificate{}
	var revokedAt sql.NullTime

	err := g.db.QueryRow(`
		SELECT id, server_id, ca_id, certificate_pem, private_key_encrypted,
		       serial_number, subject_dn, fingerprint_sha256,
		       valid_from, valid_until, status, key_algorithm, key_size,
		       created_at, updated_at, revoked_at
		FROM admiral.server_certificates
		WHERE id = $1
	`, certID).Scan(
		&cert.ID, &cert.ServerID, &cert.CAID, &cert.CertificatePEM, &cert.PrivateKeyEncrypted,
		&cert.SerialNumber, &cert.SubjectDN, &cert.FingerprintSHA256,
		&cert.ValidFrom, &cert.ValidUntil, &cert.Status, &cert.KeyAlgorithm, &cert.KeySize,
		&cert.CreatedAt, &cert.UpdatedAt, &revokedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("certificate not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query certificate: %w", err)
	}

	if revokedAt.Valid {
		cert.RevokedAt = &revokedAt.Time
	}

	return cert, nil
}

// GetCertificateBySerialNumber retrieves a certificate by its serial number
func (g *CertGenerator) GetCertificateBySerialNumber(serialNumber string) (*ServerCertificate, error) {
	cert := &ServerCertificate{}
	var revokedAt sql.NullTime

	err := g.db.QueryRow(`
		SELECT id, server_id, ca_id, certificate_pem, private_key_encrypted,
		       serial_number, subject_dn, fingerprint_sha256,
		       valid_from, valid_until, status, key_algorithm, key_size,
		       created_at, updated_at, revoked_at
		FROM admiral.server_certificates
		WHERE serial_number = $1
	`, serialNumber).Scan(
		&cert.ID, &cert.ServerID, &cert.CAID, &cert.CertificatePEM, &cert.PrivateKeyEncrypted,
		&cert.SerialNumber, &cert.SubjectDN, &cert.FingerprintSHA256,
		&cert.ValidFrom, &cert.ValidUntil, &cert.Status, &cert.KeyAlgorithm, &cert.KeySize,
		&cert.CreatedAt, &cert.UpdatedAt, &revokedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("certificate not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query certificate: %w", err)
	}

	if revokedAt.Valid {
		cert.RevokedAt = &revokedAt.Time
	}

	return cert, nil
}

// ListCertificates returns all certificates for a server
func (g *CertGenerator) ListCertificates(serverID string) ([]*ServerCertificate, error) {
	rows, err := g.db.Query(`
		SELECT id, server_id, ca_id, serial_number, subject_dn,
		       valid_from, valid_until, status, created_at
		FROM admiral.server_certificates
		WHERE server_id = $1
		ORDER BY created_at DESC
	`, serverID)
	if err != nil {
		return nil, fmt.Errorf("failed to query certificates: %w", err)
	}
	defer rows.Close()

	var certs []*ServerCertificate
	for rows.Next() {
		cert := &ServerCertificate{}
		err := rows.Scan(
			&cert.ID, &cert.ServerID, &cert.CAID, &cert.SerialNumber, &cert.SubjectDN,
			&cert.ValidFrom, &cert.ValidUntil, &cert.Status, &cert.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan certificate row: %w", err)
		}
		certs = append(certs, cert)
	}

	return certs, nil
}

// RevokeCertificate revokes a certificate and creates a revocation record
func (g *CertGenerator) RevokeCertificate(certID int, reason string, revokedBy *int) error {
	tx, err := g.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Update certificate status
	now := time.Now()
	result, err := tx.Exec(`
		UPDATE admiral.server_certificates
		SET status = 'revoked', revoked_at = $1
		WHERE id = $2 AND status = 'active'
	`, now, certID)
	if err != nil {
		return fmt.Errorf("failed to revoke certificate: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("certificate not found or already revoked")
	}

	// Create revocation record
	_, err = tx.Exec(`
		INSERT INTO admiral.certificate_revocations (
			server_certificate_id, revoked_at, reason, revoked_by
		) VALUES ($1, $2, $3, $4)
	`, certID, now, reason, revokedBy)
	if err != nil {
		return fmt.Errorf("failed to create revocation record: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// RenewCertificate generates a new certificate for a server (keeping the same server_id)
// The old certificate is NOT revoked - it will expire naturally
func (g *CertGenerator) RenewCertificate(serverID string, validityDays int) (*ServerCertificate, error) {
	// Mark old certificate as superseded (optional - we could leave it active until expiry)
	_, err := g.db.Exec(`
		UPDATE admiral.server_certificates
		SET status = 'expired'
		WHERE server_id = $1 AND status = 'active'
	`, serverID)
	if err != nil {
		return nil, fmt.Errorf("failed to mark old certificate as expired: %w", err)
	}

	// Generate new certificate
	newCert, err := g.GenerateClientCertificate(serverID, validityDays)
	if err != nil {
		return nil, fmt.Errorf("failed to generate new certificate: %w", err)
	}

	// Save new certificate
	if err := g.SaveCertificate(newCert); err != nil {
		return nil, fmt.Errorf("failed to save new certificate: %w", err)
	}

	return newCert, nil
}

// ValidateCertificate checks if a certificate is valid (not expired, not revoked)
func (g *CertGenerator) ValidateCertificate(serialNumber string) error {
	cert, err := g.GetCertificateBySerialNumber(serialNumber)
	if err != nil {
		return fmt.Errorf("certificate not found: %w", err)
	}

	// Check if revoked
	if cert.Status == "revoked" {
		return fmt.Errorf("certificate is revoked")
	}

	// Check if expired
	if time.Now().After(cert.ValidUntil) {
		return fmt.Errorf("certificate has expired")
	}

	if time.Now().Before(cert.ValidFrom) {
		return fmt.Errorf("certificate is not yet valid")
	}

	return nil
}

// DecryptCertificatePrivateKey decrypts the private key of a certificate
func (g *CertGenerator) DecryptCertificatePrivateKey(cert *ServerCertificate) (string, error) {
	privateKeyPEM, err := DecryptPrivateKey(cert.PrivateKeyEncrypted, g.masterKey)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt private key: %w", err)
	}
	return privateKeyPEM, nil
}

// MarkExpiredCertificates marks all expired certificates in the database
// Returns the number of certificates marked as expired
func (g *CertGenerator) MarkExpiredCertificates() (int, error) {
	result, err := g.db.Exec(`
		UPDATE admiral.server_certificates
		SET status = 'expired'
		WHERE status = 'active' AND valid_until < $1
	`, time.Now())
	if err != nil {
		return 0, fmt.Errorf("failed to mark expired certificates: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	return int(rowsAffected), nil
}

// GetExpiringCertificates returns certificates expiring within the specified number of days
func (g *CertGenerator) GetExpiringCertificates(days int) ([]*ServerCertificate, error) {
	expiryThreshold := time.Now().Add(time.Duration(days) * 24 * time.Hour)

	rows, err := g.db.Query(`
		SELECT id, server_id, ca_id, serial_number, subject_dn,
		       valid_from, valid_until, status, created_at
		FROM admiral.server_certificates
		WHERE status = 'active'
		  AND valid_until <= $1
		  AND valid_until > $2
		ORDER BY valid_until ASC
	`, expiryThreshold, time.Now())
	if err != nil {
		return nil, fmt.Errorf("failed to query expiring certificates: %w", err)
	}
	defer rows.Close()

	var certs []*ServerCertificate
	for rows.Next() {
		cert := &ServerCertificate{}
		err := rows.Scan(
			&cert.ID, &cert.ServerID, &cert.CAID, &cert.SerialNumber, &cert.SubjectDN,
			&cert.ValidFrom, &cert.ValidUntil, &cert.Status, &cert.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan certificate row: %w", err)
		}
		certs = append(certs, cert)
	}

	return certs, nil
}
