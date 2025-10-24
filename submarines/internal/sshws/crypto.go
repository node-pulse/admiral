package sshws

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

// LaravelPayload represents Laravel's encrypted payload structure
type LaravelPayload struct {
	IV    string `json:"iv"`
	Value string `json:"value"`
	MAC   string `json:"mac"`
}

// DecryptPrivateKey decrypts a Laravel-encrypted private key using the master key
func DecryptPrivateKey(encryptedData, masterKey string) (string, error) {
	if encryptedData == "" {
		return "", fmt.Errorf("encrypted data is empty")
	}

	// Decode base64 payload
	payloadData, err := base64.StdEncoding.DecodeString(encryptedData)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	// Parse Laravel JSON payload
	var laravelPayload LaravelPayload
	if err := json.Unmarshal(payloadData, &laravelPayload); err != nil {
		return "", fmt.Errorf("failed to parse Laravel payload: %w", err)
	}

	// Prepare AES-256-CBC key (32 bytes)
	key := prepareMasterKey(masterKey)

	// Decode IV and encrypted value
	iv, err := base64.StdEncoding.DecodeString(laravelPayload.IV)
	if err != nil {
		return "", fmt.Errorf("failed to decode IV: %w", err)
	}

	ciphertext, err := base64.StdEncoding.DecodeString(laravelPayload.Value)
	if err != nil {
		return "", fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	// Create AES cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Decrypt using CBC mode
	if len(ciphertext)%aes.BlockSize != 0 {
		return "", fmt.Errorf("ciphertext is not a multiple of block size")
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(ciphertext))
	mode.CryptBlocks(plaintext, ciphertext)

	// Remove PKCS7 padding
	plaintext, err = removePKCS7Padding(plaintext)
	if err != nil {
		return "", fmt.Errorf("failed to remove padding: %w", err)
	}

	return string(plaintext), nil
}

// prepareMasterKey ensures the master key is exactly 32 bytes for AES-256
func prepareMasterKey(masterKey string) []byte {
	key := []byte(strings.TrimSpace(masterKey))

	// If key is exactly 32 bytes, use it
	if len(key) == 32 {
		return key
	}

	// If key is 64 characters (hex string), take first 32 bytes
	if len(key) == 64 {
		return key[:32]
	}

	// Pad or truncate to 32 bytes
	result := make([]byte, 32)
	copy(result, key)
	return result
}

// removePKCS7Padding removes PKCS7 padding from decrypted data
func removePKCS7Padding(data []byte) ([]byte, error) {
	length := len(data)
	if length == 0 {
		return nil, fmt.Errorf("data is empty")
	}

	padding := int(data[length-1])
	if padding > length || padding > aes.BlockSize {
		return nil, fmt.Errorf("invalid padding size")
	}

	// Verify all padding bytes are correct
	for i := 0; i < padding; i++ {
		if data[length-1-i] != byte(padding) {
			return nil, fmt.Errorf("invalid padding")
		}
	}

	return data[:length-padding], nil
}
