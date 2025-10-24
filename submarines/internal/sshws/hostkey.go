package sshws

import (
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"net"

	"golang.org/x/crypto/ssh"
)

// HostKeyVerifier handles Trust On First Use (TOFU) host key verification
type HostKeyVerifier struct {
	db       *sql.DB
	serverID string
}

// NewHostKeyVerifier creates a new host key verifier for TOFU
func NewHostKeyVerifier(db *sql.DB, serverID string) *HostKeyVerifier {
	return &HostKeyVerifier{
		db:       db,
		serverID: serverID,
	}
}

// VerifyHostKey implements ssh.HostKeyCallback for TOFU verification
// On first connection: Store the host key fingerprint
// On subsequent connections: Verify the host key matches the stored fingerprint
func (hkv *HostKeyVerifier) VerifyHostKey(hostname string, remote net.Addr, key ssh.PublicKey) error {
	// Calculate fingerprint (SHA256 base64 encoded)
	fingerprint := calculateFingerprint(key)
	log.Printf("[Host Key] Server %s presented fingerprint: %s", hkv.serverID, fingerprint)

	// Fetch stored fingerprint from database
	var storedFingerprint sql.NullString
	query := `SELECT ssh_host_key_fingerprint FROM admiral.servers WHERE id = $1`
	err := hkv.db.QueryRow(query, hkv.serverID).Scan(&storedFingerprint)
	if err != nil {
		return fmt.Errorf("failed to fetch stored host key: %w", err)
	}

	// Case 1: First connection (no fingerprint stored) - Trust On First Use
	if !storedFingerprint.Valid || storedFingerprint.String == "" {
		log.Printf("[Host Key] TOFU: First connection to server %s, storing fingerprint", hkv.serverID)
		err = hkv.storeFingerprint(fingerprint)
		if err != nil {
			return fmt.Errorf("failed to store host key fingerprint: %w", err)
		}
		return nil
	}

	// Case 2: Subsequent connection - Verify fingerprint matches
	if storedFingerprint.String != fingerprint {
		log.Printf("[Host Key] WARNING: Host key mismatch for server %s!", hkv.serverID)
		log.Printf("[Host Key] Expected: %s", storedFingerprint.String)
		log.Printf("[Host Key] Received: %s", fingerprint)
		return fmt.Errorf("host key verification failed: fingerprint mismatch (possible MITM attack or server rebuild)")
	}

	log.Printf("[Host Key] ✓ Host key verified for server %s", hkv.serverID)
	return nil
}

// storeFingerprint saves the host key fingerprint to the database
func (hkv *HostKeyVerifier) storeFingerprint(fingerprint string) error {
	query := `UPDATE admiral.servers SET ssh_host_key_fingerprint = $1 WHERE id = $2`
	_, err := hkv.db.Exec(query, fingerprint, hkv.serverID)
	return err
}

// calculateFingerprint calculates SHA256 fingerprint in base64 format
// Format matches OpenSSH's default fingerprint format
func calculateFingerprint(key ssh.PublicKey) string {
	hash := sha256.Sum256(key.Marshal())
	return "SHA256:" + base64.StdEncoding.EncodeToString(hash[:])
}

// GetHostKeyCallback returns an ssh.HostKeyCallback for TOFU verification
func (hkv *HostKeyVerifier) GetHostKeyCallback() ssh.HostKeyCallback {
	return hkv.VerifyHostKey
}
