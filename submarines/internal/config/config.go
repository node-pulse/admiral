package config

import (
	"fmt"
	"os"
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

	// Cleaner-specific (optional, only used by cleaner binary)
	FlagshipDBSchema string
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

		// Cleaner-specific
		FlagshipDBSchema: getEnv("FLAGSHIP_DB_SCHEMA", "flagship"),
		DryRun:           getEnv("DRY_RUN", "false") == "true",
		LogLevel:         getEnv("LOG_LEVEL", "info"),
	}
}

func (c *Config) GetDSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s search_path=%s",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode, "submarines",
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
