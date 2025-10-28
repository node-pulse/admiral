package tls

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
)

// ClientCertInfo holds information extracted from Caddy's client certificate headers
type ClientCertInfo struct {
	SerialNumber string
	Subject      string
	CommonName   string
	Fingerprint  string
}

// ExtractClientCertFromHeaders extracts client certificate information from Caddy headers
// Caddy sets these headers when mTLS is configured:
// - X-Client-Cert-Serial: Certificate serial number
// - X-Client-Cert-Subject: Certificate subject DN
// - X-Client-Cert-CN: Certificate common name (server_id)
// - X-Client-Cert-Fingerprint: SHA256 fingerprint
func ExtractClientCertFromHeaders(c *gin.Context) (*ClientCertInfo, error) {
	serial := c.GetHeader("X-Client-Cert-Serial")
	subject := c.GetHeader("X-Client-Cert-Subject")
	cn := c.GetHeader("X-Client-Cert-CN")
	fingerprint := c.GetHeader("X-Client-Cert-Fingerprint")

	// At minimum, we need serial number and CN
	if serial == "" {
		return nil, fmt.Errorf("missing X-Client-Cert-Serial header")
	}
	if cn == "" {
		return nil, fmt.Errorf("missing X-Client-Cert-CN header")
	}

	return &ClientCertInfo{
		SerialNumber: strings.TrimSpace(serial),
		Subject:      strings.TrimSpace(subject),
		CommonName:   strings.TrimSpace(cn),
		Fingerprint:  strings.TrimSpace(fingerprint),
	}, nil
}

// ValidateClientCertificate validates a client certificate against the database
// Checks if the certificate exists, is not revoked, and is not expired
func ValidateClientCertificate(certInfo *ClientCertInfo, db *sql.DB) error {
	if certInfo == nil {
		return fmt.Errorf("no client certificate info provided")
	}

	// Query database for certificate by serial number
	var status string
	var serverID string
	err := db.QueryRow(`
		SELECT status, server_id
		FROM admiral.server_certificates
		WHERE serial_number = $1
	`, certInfo.SerialNumber).Scan(&status, &serverID)

	if err == sql.ErrNoRows {
		return fmt.Errorf("certificate not found in database (serial: %s)", certInfo.SerialNumber)
	}
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}

	// Check if certificate is revoked
	if status == "revoked" {
		return fmt.Errorf("certificate has been revoked")
	}

	// Check if certificate is expired (database-side check)
	if status == "expired" {
		return fmt.Errorf("certificate has expired")
	}

	// Verify that CN matches the server_id in database (security check)
	if certInfo.CommonName != serverID {
		return fmt.Errorf("certificate CN does not match server_id in database")
	}

	return nil
}

// ExtractServerID extracts the server_id from client certificate info
// The server_id is stored in the certificate's Common Name (CN)
func ExtractServerID(certInfo *ClientCertInfo) (string, error) {
	if certInfo == nil {
		return "", fmt.Errorf("no certificate info provided")
	}

	cn := strings.TrimSpace(certInfo.CommonName)
	if cn == "" {
		return "", fmt.Errorf("certificate has no Common Name")
	}

	// Basic validation: CN should look like a UUID
	// UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
	if len(cn) < 32 {
		return "", fmt.Errorf("Common Name does not appear to be a valid server ID")
	}

	return cn, nil
}

// MTLSMiddlewareStrict is a Gin middleware that validates client certificates from Caddy headers
// STRICT mode only - always rejects requests without valid certificates
// This is used in production builds (compiled with -tags mtls)
func MTLSMiddlewareStrict(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract certificate info from headers
		certInfo, err := ExtractClientCertFromHeaders(c)
		if err != nil {
			// STRICT: Reject requests without certificates
			c.JSON(401, gin.H{
				"error": "Client certificate required",
				"detail": err.Error(),
			})
			c.Abort()
			return
		}

		// Certificate is present - validate it
		if err := ValidateClientCertificate(certInfo, db); err != nil {
			c.JSON(401, gin.H{
				"error": "Invalid client certificate",
				"detail": err.Error(),
			})
			c.Abort()
			return
		}

		// Extract and store server_id in context for handlers to use
		serverID, err := ExtractServerID(certInfo)
		if err != nil {
			c.JSON(401, gin.H{
				"error": "Invalid server ID in certificate",
				"detail": err.Error(),
			})
			c.Abort()
			return
		}

		// Store certificate info in context for handlers
		c.Set("server_id", serverID)
		c.Set("client_cert_info", certInfo)
		c.Set("mtls_authenticated", true)

		c.Next()
	}
}

// GetServerIDFromContext retrieves the server_id from the Gin context
// This is set by MTLSMiddleware after successful authentication
func GetServerIDFromContext(c *gin.Context) (string, bool) {
	serverID, exists := c.Get("server_id")
	if !exists {
		return "", false
	}
	serverIDStr, ok := serverID.(string)
	return serverIDStr, ok
}

// GetClientCertInfoFromContext retrieves the full client cert info from the Gin context
func GetClientCertInfoFromContext(c *gin.Context) (*ClientCertInfo, bool) {
	certInfo, exists := c.Get("client_cert_info")
	if !exists {
		return nil, false
	}
	certInfoTyped, ok := certInfo.(*ClientCertInfo)
	return certInfoTyped, ok
}
