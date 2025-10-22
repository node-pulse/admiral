package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nodepulse/dashboard/backend/internal/cleaner"
	"github.com/nodepulse/dashboard/backend/internal/config"
	"github.com/nodepulse/dashboard/backend/internal/database"
)

func main() {
	log.Println("NodePulse Submarines Cleaner")
	log.Println("=============================")

	// Load configuration
	cfg := config.Load()

	// Validate required configuration
	if cfg.DBHost == "" || cfg.DBName == "" {
		log.Fatal("Database configuration is required (DB_HOST, DB_NAME)")
	}

	// Log configuration (without sensitive data)
	log.Printf("Database: %s:%s/%s (schema: %s)", cfg.DBHost, cfg.DBPort, cfg.DBName, cfg.DBSchema)
	log.Printf("Flagship schema: %s", cfg.FlagshipDBSchema)
	log.Printf("Log level: %s", cfg.LogLevel)
	if cfg.DryRun {
		log.Println("DRY RUN MODE: No data will be deleted")
	}

	// Connect to database
	db, err := database.New(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Connected to PostgreSQL")

	// Setup context with timeout (max 10 minutes for cleanup)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		sig := <-sigChan
		log.Printf("Received signal: %v, canceling operations...", sig)
		cancel()
	}()

	// Create cleaner instance
	c := cleaner.New(db.DB, cfg)

	// Run all cleanup jobs
	log.Println("")
	if err := c.Run(ctx); err != nil {
		log.Printf("Cleanup failed: %v", err)
		os.Exit(1)
	}

	log.Println("")
	log.Println("Cleanup completed successfully")
}
