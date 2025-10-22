package main

import (
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/nodepulse/dashboard/backend/internal/config"
	"github.com/nodepulse/dashboard/backend/internal/database"
	"github.com/nodepulse/dashboard/backend/internal/handlers"
	"github.com/nodepulse/dashboard/backend/internal/valkey"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Set Gin mode
	gin.SetMode(cfg.GinMode)

	// Initialize database
	db, err := database.New(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize Valkey
	valkeyClient, err := valkey.New(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize Valkey: %v", err)
	}
	defer valkeyClient.Close()

	// Initialize router
	router := gin.Default()

	// Configure CORS - more restrictive for ingest
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"}, // Allow agents from anywhere
		AllowMethods:     []string{"POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
	}))

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "node-pulse-ingest",
		})
	})

	// Initialize handlers
	metricsHandler := handlers.NewMetricsHandler(db, valkeyClient)

	// Ingest routes (for agents only)
	router.POST("/metrics", metricsHandler.IngestMetrics)
	// Future: NPI v1 endpoint
	// router.POST("/v1/ingest", metricsHandler.IngestNPI)

	// Start server
	addr := ":" + cfg.Port
	log.Printf("Starting ingest service on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
