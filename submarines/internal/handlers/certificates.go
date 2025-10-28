package handlers

import (
	"database/sql"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/nodepulse/admiral/submarines/internal/certificates"
	"github.com/nodepulse/admiral/submarines/internal/config"
)

// CertificateHandler handles certificate management operations
type CertificateHandler struct {
	caManager   *certificates.CAManager
	certGen     *certificates.CertGenerator
	db          *sql.DB
	config      *config.Config
}

// NewCertificateHandler creates a new certificate handler instance
func NewCertificateHandler(db *sql.DB, cfg *config.Config) *CertificateHandler {
	caManager := certificates.NewCAManager(db, cfg.MasterKey)
	certGen := certificates.NewCertGenerator(db, cfg.MasterKey)

	return &CertificateHandler{
		caManager:   caManager,
		certGen:     certGen,
		db:          db,
		config:      cfg,
	}
}

// GenerateCertificateRequest represents a request to generate a client certificate
type GenerateCertificateRequest struct {
	ServerID     string `json:"server_id" binding:"required"`
	ValidityDays int    `json:"validity_days,omitempty"`
}

// GenerateCertificateResponse represents the response from certificate generation
type GenerateCertificateResponse struct {
	ID              int    `json:"id"`
	ServerID        string `json:"server_id"`
	SerialNumber    string `json:"serial_number"`
	CertificatePEM  string `json:"certificate_pem"`
	PrivateKeyPEM   string `json:"private_key_pem"` // Decrypted for distribution
	CACertificatePEM string `json:"ca_certificate_pem"`
	ValidFrom       string `json:"valid_from"`
	ValidUntil      string `json:"valid_until"`
	FingerprintSHA256 string `json:"fingerprint_sha256,omitempty"`
}

// RevokeCertificateRequest represents a request to revoke a certificate
type RevokeCertificateRequest struct {
	CertificateID int    `json:"certificate_id" binding:"required"`
	Reason        string `json:"reason"`
	RevokedBy     *int   `json:"revoked_by,omitempty"`
}

// CreateCARequest represents a request to create a new CA
type CreateCARequest struct {
	Name         string `json:"name" binding:"required"`
	ValidityDays int    `json:"validity_days,omitempty"`
}

// CreateCAResponse represents the response from CA creation
type CreateCAResponse struct {
	ID             int    `json:"id"`
	Name           string `json:"name"`
	CertificatePEM string `json:"certificate_pem"`
	ValidFrom      string `json:"valid_from"`
	ValidUntil     string `json:"valid_until"`
	SubjectDN      string `json:"subject_dn"`
	SerialNumber   string `json:"serial_number"`
	IsActive       bool   `json:"is_active"`
}

// GenerateCertificate generates a new client certificate for a server
// POST /internal/certificates/generate
func (h *CertificateHandler) GenerateCertificate(c *gin.Context) {
	var req GenerateCertificateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Use configured validity days if not specified
	validityDays := req.ValidityDays
	if validityDays == 0 {
		validityDays = h.config.CertValidityDays
	}

	// Verify server exists
	var exists bool
	err := h.db.QueryRow(`
		SELECT EXISTS(SELECT 1 FROM admiral.servers WHERE server_id = $1)
	`, req.ServerID).Scan(&exists)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify server existence"})
		return
	}
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}

	// Generate certificate
	cert, err := h.certGen.GenerateClientCertificate(req.ServerID, validityDays)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Save to database
	if err := h.certGen.SaveCertificate(cert); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Get active CA certificate for distribution
	ca, err := h.caManager.GetActiveCA()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve CA certificate"})
		return
	}

	// Decrypt private key for distribution (will be re-encrypted during deployment)
	privateKeyPEM, err := certificates.DecryptPrivateKey(cert.PrivateKeyEncrypted, h.config.MasterKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to decrypt private key"})
		return
	}

	// Return certificate details
	c.JSON(http.StatusCreated, GenerateCertificateResponse{
		ID:              cert.ID,
		ServerID:        cert.ServerID,
		SerialNumber:    cert.SerialNumber,
		CertificatePEM:  cert.CertificatePEM,
		PrivateKeyPEM:   privateKeyPEM,
		CACertificatePEM: ca.CertificatePEM,
		ValidFrom:       cert.ValidFrom.Format("2006-01-02T15:04:05Z07:00"),
		ValidUntil:      cert.ValidUntil.Format("2006-01-02T15:04:05Z07:00"),
		FingerprintSHA256: cert.FingerprintSHA256,
	})
}

// RevokeCertificate revokes a client certificate
// POST /internal/certificates/revoke
func (h *CertificateHandler) RevokeCertificate(c *gin.Context) {
	var req RevokeCertificateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Revoke certificate
	if err := h.certGen.RevokeCertificate(req.CertificateID, req.Reason, req.RevokedBy); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "certificate revoked successfully",
		"certificate_id": req.CertificateID,
	})
}

// CreateCA creates a new self-signed Certificate Authority
// POST /internal/ca/create
func (h *CertificateHandler) CreateCA(c *gin.Context) {
	var req CreateCARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Default to 10 years for CA
	validityDays := req.ValidityDays
	if validityDays == 0 {
		validityDays = 3650
	}

	// Generate self-signed CA
	ca, err := h.caManager.GenerateSelfSignedCA(req.Name, validityDays)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Set as active and save
	ca.IsActive = true
	if err := h.caManager.SaveCA(ca); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, CreateCAResponse{
		ID:             ca.ID,
		Name:           ca.Name,
		CertificatePEM: ca.CertificatePEM,
		ValidFrom:      ca.ValidFrom.Format("2006-01-02T15:04:05Z07:00"),
		ValidUntil:     ca.ValidUntil.Format("2006-01-02T15:04:05Z07:00"),
		SubjectDN:      ca.SubjectDN,
		SerialNumber:   ca.SerialNumber,
		IsActive:       ca.IsActive,
	})
}

// GetCertificate retrieves certificate details for a server
// GET /internal/certificates/:server_id
func (h *CertificateHandler) GetCertificate(c *gin.Context) {
	serverID := c.Param("server_id")
	if serverID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "server_id is required"})
		return
	}

	// Get active certificate
	cert, err := h.certGen.GetActiveCertificate(serverID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "no active certificate found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Get CA certificate
	ca, err := h.caManager.GetActiveCA()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve CA certificate"})
		return
	}

	// Decrypt private key for distribution
	privateKeyPEM, err := certificates.DecryptPrivateKey(cert.PrivateKeyEncrypted, h.config.MasterKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to decrypt private key"})
		return
	}

	c.JSON(http.StatusOK, GenerateCertificateResponse{
		ID:              cert.ID,
		ServerID:        cert.ServerID,
		SerialNumber:    cert.SerialNumber,
		CertificatePEM:  cert.CertificatePEM,
		PrivateKeyPEM:   privateKeyPEM,
		CACertificatePEM: ca.CertificatePEM,
		ValidFrom:       cert.ValidFrom.Format("2006-01-02T15:04:05Z07:00"),
		ValidUntil:      cert.ValidUntil.Format("2006-01-02T15:04:05Z07:00"),
		FingerprintSHA256: cert.FingerprintSHA256,
	})
}

// ListExpiringCertificates lists certificates expiring within specified days
// GET /internal/certificates/expiring?days=30
func (h *CertificateHandler) ListExpiringCertificates(c *gin.Context) {
	daysParam := c.DefaultQuery("days", "30")

	var days int
	if _, err := fmt.Sscanf(daysParam, "%d", &days); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid days parameter"})
		return
	}

	certs, err := h.certGen.GetExpiringCertificates(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type certInfo struct {
		ID            int    `json:"id"`
		ServerID      string `json:"server_id"`
		SerialNumber  string `json:"serial_number"`
		ValidUntil    string `json:"valid_until"`
		DaysRemaining int    `json:"days_remaining"`
	}

	var response []certInfo
	for _, cert := range certs {
		daysRemaining := int(cert.ValidUntil.Sub(cert.ValidFrom).Hours() / 24)
		response = append(response, certInfo{
			ID:            cert.ID,
			ServerID:      cert.ServerID,
			SerialNumber:  cert.SerialNumber,
			ValidUntil:    cert.ValidUntil.Format("2006-01-02T15:04:05Z07:00"),
			DaysRemaining: daysRemaining,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"certificates": response,
		"count":        len(response),
	})
}
