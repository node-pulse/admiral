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

	// Kratos
	KratosPublicURL string
	KratosAdminURL  string

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

		// Kratos
		KratosPublicURL: getEnv("KRATOS_PUBLIC_URL", "http://kratos:4433"),
		KratosAdminURL:  getEnv("KRATOS_ADMIN_URL", "http://kratos:4434"),

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
// Requires /secrets/master.key to be mounted (no fallbacks)
func loadMasterKey() string {
	masterKeyPath := getEnv("MASTER_KEY_PATH", "/secrets/master.key")

	data, err := os.ReadFile(masterKeyPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: Master encryption key not found at %s\n", masterKeyPath)
		fmt.Fprintf(os.Stderr, "Please ensure:\n")
		fmt.Fprintf(os.Stderr, "  1. The secrets directory is mounted: ./secrets:/secrets:ro\n")
		fmt.Fprintf(os.Stderr, "  2. The master.key file exists in the secrets directory\n")
		fmt.Fprintf(os.Stderr, "  3. Run deploy.sh to generate the key if needed\n")
		fmt.Fprintf(os.Stderr, "Error details: %v\n", err)
		os.Exit(1)
	}

	key := strings.TrimSpace(string(data))
	if key == "" {
		fmt.Fprintf(os.Stderr, "ERROR: Master encryption key file is empty at %s\n", masterKeyPath)
		os.Exit(1)
	}

	return key
}
