package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
	"github.com/nodepulse/admiral/submarines/internal/config"
)

type DB struct {
	*sql.DB
}

func New(cfg *config.Config) (*DB, error) {
	db, err := sql.Open("postgres", cfg.GetDSN())
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Connected to PostgreSQL successfully")

	return &DB{db}, nil
}

func (db *DB) Close() error {
	return db.DB.Close()
}

// Ping checks if the database connection is alive
func (db *DB) Ping(ctx context.Context) error {
	return db.DB.PingContext(ctx)
}

// HealthCheck performs a more thorough health check (not just connection, but query execution)
func (db *DB) HealthCheck(ctx context.Context) error {
	// Simple query to verify database is responsive
	var result int
	err := db.DB.QueryRowContext(ctx, "SELECT 1").Scan(&result)
	if err != nil {
		return fmt.Errorf("database health check failed: %w", err)
	}
	if result != 1 {
		return fmt.Errorf("database health check returned unexpected value: %d", result)
	}
	return nil
}
