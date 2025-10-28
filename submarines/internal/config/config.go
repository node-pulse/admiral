package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	// Database
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	// Valkey
	ValkeyHost     string
	ValkeyPort     string
	ValkeyPassword string

	// Server
	Port    string
	GinMode string

	// JWT
	JWTSecret string

	// Encryption
	MasterKey string

	// Cleaner-specific
	DryRun           bool
	LogLevel         string
}

 

func Load() *Config {
	return &Config{
		// Database
		DBHost:     getEnv("DB_HOST", "postgres"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", "postgres"),
		DBName:     getEnv("DB_NAME", "nodepulse"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),

		// Valkey
		ValkeyHost:     getEnv("VALKEY_HOST", "valkey"),
		ValkeyPort:     getEnv("VALKEY_PORT", "6379"),
		ValkeyPassword: getEnv("VALKEY_PASSWORD", ""),

		// Server
		Port:    getEnv("PORT", "8080"),
		GinMode: getEnv("GIN_MODE", "debug"),

		// JWT
		JWTSecret: getEnv("JWT_SECRET", "your-secret-key-change-in-production"),

		// Encryption
		MasterKey: loadMasterKey(),

		// Cleaner-specific
		DryRun:           getEnv("DRY_RUN", "false") == "true",
		LogLevel:         getEnv("LOG_LEVEL", "info"),
	}
}

func (c *Config) GetDSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode,
	)
}

func (c *Config) GetValkeyAddress() string {
	return fmt.Sprintf("%s:%s", c.ValkeyHost, c.ValkeyPort)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// loadMasterKey loads the master encryption key from file
// If required=true, exits on error. If required=false, returns empty string on error.
func loadMasterKey() string {
	masterKeyPath := getEnv("MASTER_KEY_PATH", "/secrets/master.key")

	data, err := os.ReadFile(masterKeyPath)
	if err != nil {
		return ""
	}

	key := strings.TrimSpace(string(data))

	return key
}
