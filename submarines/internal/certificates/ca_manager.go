package certificates

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"database/sql"
	"encoding/pem"
	"fmt"
	"math/big"
	"time"
)

// CA represents a self-signed Certificate Authority
// External CAs are not supported - all CAs are self-signed
type CA struct {
	ID                  int
	Name                string
	CertificatePEM      string
	PrivateKeyEncrypted string
	ValidFrom           time.Time
	ValidUntil          time.Time
	IsActive            bool
	IssuerDN            string
	SubjectDN           string
	SerialNumber        string
	KeyAlgorithm        string
	KeySize             int
}

// CAManager handles Certificate Authority operations
type CAManager struct {
	db        *sql.DB
	masterKey string
}

// NewCAManager creates a new CA manager instance
func NewCAManager(db *sql.DB, masterKey string) *CAManager {
	return &CAManager{
		db:        db,
		masterKey: masterKey,
	}
}

// GenerateSelfSignedCA generates a new self-signed Certificate Authority
func (m *CAManager) GenerateSelfSignedCA(name string, validityDays int) (*CA, error) {
	// Generate RSA key pair (4096 bits for CA)
	privateKey, err := rsa.GenerateKey(rand.Reader, 4096)
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
			CommonName:   name,
			Organization: []string{"Node Pulse"},
			Country:      []string{"US"},
		},
		NotBefore:             notBefore,
		NotAfter:              notAfter,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            0, // Can only sign end-entity certificates
	}

	// Create self-signed certificate
	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
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
	encryptedKey, err := EncryptPrivateKey(string(privateKeyPEM), m.masterKey)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt private key: %w", err)
	}

	// Parse certificate to extract metadata
	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, fmt.Errorf("failed to parse certificate: %w", err)
	}

	ca := &CA{
		Name:                name,
		CertificatePEM:      string(certPEM),
		PrivateKeyEncrypted: encryptedKey,
		ValidFrom:           cert.NotBefore,
		ValidUntil:          cert.NotAfter,
		IsActive:            false, // Will be set to true when inserted
		IssuerDN:            cert.Issuer.String(),
		SubjectDN:           cert.Subject.String(),
		SerialNumber:        serialNumber,
		KeyAlgorithm:        "RSA",
		KeySize:             4096,
	}

	return ca, nil
}

// SaveCA stores a CA in the database
func (m *CAManager) SaveCA(ca *CA) error {
	// Deactivate all existing CAs if this one should be active
	if ca.IsActive {
		_, err := m.db.Exec(`
			UPDATE admiral.certificate_authorities
			SET is_active = false
			WHERE is_active = true
		`)
		if err != nil {
			return fmt.Errorf("failed to deactivate existing CAs: %w", err)
		}
	}

	// Insert new CA
	err := m.db.QueryRow(`
		INSERT INTO admiral.certificate_authorities (
			name, certificate_pem, private_key_encrypted,
			valid_from, valid_until, is_active, issuer_dn, subject_dn,
			serial_number, key_algorithm, key_size
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id
	`, ca.Name, ca.CertificatePEM, ca.PrivateKeyEncrypted,
		ca.ValidFrom, ca.ValidUntil, ca.IsActive, ca.IssuerDN, ca.SubjectDN,
		ca.SerialNumber, ca.KeyAlgorithm, ca.KeySize,
	).Scan(&ca.ID)

	if err != nil {
		return fmt.Errorf("failed to insert CA: %w", err)
	}

	return nil
}

// GetActiveCA retrieves the currently active CA
func (m *CAManager) GetActiveCA() (*CA, error) {
	ca := &CA{}
	err := m.db.QueryRow(`
		SELECT id, name, certificate_pem, private_key_encrypted,
		       valid_from, valid_until, is_active, issuer_dn, subject_dn,
		       serial_number, key_algorithm, key_size
		FROM admiral.certificate_authorities
		WHERE is_active = true
		LIMIT 1
	`).Scan(
		&ca.ID, &ca.Name, &ca.CertificatePEM, &ca.PrivateKeyEncrypted,
		&ca.ValidFrom, &ca.ValidUntil, &ca.IsActive, &ca.IssuerDN, &ca.SubjectDN,
		&ca.SerialNumber, &ca.KeyAlgorithm, &ca.KeySize,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("no active CA found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query active CA: %w", err)
	}

	return ca, nil
}

// GetCAByID retrieves a CA by its ID
func (m *CAManager) GetCAByID(id int) (*CA, error) {
	ca := &CA{}
	err := m.db.QueryRow(`
		SELECT id, name, certificate_pem, private_key_encrypted,
		       valid_from, valid_until, is_active, issuer_dn, subject_dn,
		       serial_number, key_algorithm, key_size
		FROM admiral.certificate_authorities
		WHERE id = $1
	`, id).Scan(
		&ca.ID, &ca.Name, &ca.CertificatePEM, &ca.PrivateKeyEncrypted,
		&ca.ValidFrom, &ca.ValidUntil, &ca.IsActive, &ca.IssuerDN, &ca.SubjectDN,
		&ca.SerialNumber, &ca.KeyAlgorithm, &ca.KeySize,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("CA not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query CA: %w", err)
	}

	return ca, nil
}

// LoadCAPrivateKey decrypts and loads the CA private key
// Returns the private key and certificate for signing operations
func (m *CAManager) LoadCAPrivateKey(ca *CA) (*rsa.PrivateKey, *x509.Certificate, error) {
	// Decrypt private key
	privateKeyPEM, err := DecryptPrivateKey(ca.PrivateKeyEncrypted, m.masterKey)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to decrypt private key: %w", err)
	}

	// Parse private key
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return nil, nil, fmt.Errorf("failed to parse PEM block for private key")
	}

	privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	// Parse certificate
	certBlock, _ := pem.Decode([]byte(ca.CertificatePEM))
	if certBlock == nil {
		return nil, nil, fmt.Errorf("failed to parse PEM block for certificate")
	}

	cert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse certificate: %w", err)
	}

	return privateKey, cert, nil
}

// ListCAs returns all CAs in the database
func (m *CAManager) ListCAs() ([]*CA, error) {
	rows, err := m.db.Query(`
		SELECT id, name, certificate_pem, valid_from, valid_until,
		       is_active, subject_dn, serial_number
		FROM admiral.certificate_authorities
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query CAs: %w", err)
	}
	defer rows.Close()

	var cas []*CA
	for rows.Next() {
		ca := &CA{}
		err := rows.Scan(
			&ca.ID, &ca.Name, &ca.CertificatePEM,
			&ca.ValidFrom, &ca.ValidUntil, &ca.IsActive,
			&ca.SubjectDN, &ca.SerialNumber,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan CA row: %w", err)
		}
		cas = append(cas, ca)
	}

	return cas, nil
}

// SetActiveCA sets a CA as the active one (deactivates all others)
func (m *CAManager) SetActiveCA(caID int) error {
	tx, err := m.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Deactivate all CAs
	_, err = tx.Exec(`UPDATE admiral.certificate_authorities SET is_active = false`)
	if err != nil {
		return fmt.Errorf("failed to deactivate CAs: %w", err)
	}

	// Activate the specified CA
	result, err := tx.Exec(`
		UPDATE admiral.certificate_authorities
		SET is_active = true
		WHERE id = $1
	`, caID)
	if err != nil {
		return fmt.Errorf("failed to activate CA: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("CA not found")
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}
