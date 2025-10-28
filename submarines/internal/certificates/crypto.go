package certificates

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
)

// EncryptPrivateKey encrypts a PEM-encoded private key using AES-256-GCM
// Returns base64-encoded ciphertext with nonce prepended
func EncryptPrivateKey(keyPEM, masterKey string) (string, error) {
	if keyPEM == "" {
		return "", fmt.Errorf("key PEM is empty")
	}
	if masterKey == "" {
		return "", fmt.Errorf("master key is empty")
	}

	// Derive 32-byte key from master key
	key := deriveMasterKey(masterKey)

	// Create AES-256 cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt plaintext
	plaintext := []byte(keyPEM)
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)

	// Encode to base64
	encoded := base64.StdEncoding.EncodeToString(ciphertext)

	return encoded, nil
}

// DecryptPrivateKey decrypts a PEM-encoded private key using AES-256-GCM
// Accepts base64-encoded ciphertext with nonce prepended
func DecryptPrivateKey(encryptedData, masterKey string) (string, error) {
	if encryptedData == "" {
		return "", fmt.Errorf("encrypted data is empty")
	}
	if masterKey == "" {
		return "", fmt.Errorf("master key is empty")
	}

	// Decode base64
	ciphertext, err := base64.StdEncoding.DecodeString(encryptedData)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	// Derive 32-byte key from master key
	key := deriveMasterKey(masterKey)

	// Create AES-256 cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Extract nonce and ciphertext
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertextData := ciphertext[:nonceSize], ciphertext[nonceSize:]

	// Decrypt
	plaintext, err := gcm.Open(nil, nonce, ciphertextData, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintext), nil
}

// deriveMasterKey derives a consistent 32-byte key from the master key
// Uses SHA-256 to ensure consistent key length regardless of input
func deriveMasterKey(masterKey string) []byte {
	// Trim whitespace
	key := strings.TrimSpace(masterKey)

	// SHA-256 hash to get exactly 32 bytes
	hash := sha256.Sum256([]byte(key))
	return hash[:]
}

// GenerateRandomBytes generates cryptographically secure random bytes
func GenerateRandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return nil, fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return b, nil
}

// GenerateSerialNumber generates a random serial number for certificates
// Returns a hex-encoded string of 16 random bytes (128 bits)
func GenerateSerialNumber() (string, error) {
	bytes, err := GenerateRandomBytes(16)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", bytes), nil
}
