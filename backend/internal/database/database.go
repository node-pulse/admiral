package database

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
	"github.com/nodepulse/dashboard/backend/internal/config"
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
