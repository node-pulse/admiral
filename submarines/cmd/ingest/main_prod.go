//go:build prod
// +build prod

package main

import (
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/nodepulse/admiral/submarines/internal/config"
	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/handlers"
	"github.com/nodepulse/admiral/submarines/internal/valkey"
	"github.com/nodepulse/admiral/submarines/internal/validation"
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
			"mtls":    "enabled", // Production mode
		})
	})

	// Initialize server ID validator (with Valkey caching)
	// This validator runs REGARDLESS of mTLS state - it's an independent security layer
	serverIDValidator := validation.NewServerIDValidator(db.DB, valkeyClient.GetClient(), cfg.ServerIDCacheTTL)

	// Initialize handlers (with server ID validation)
	prometheusHandler := handlers.NewPrometheusHandler(db, valkeyClient, serverIDValidator)
	certificateHandler := handlers.NewCertificateHandler(db.DB, cfg)

	// Ingest routes (for agents only)
	// mTLS is handled at Caddy layer (optional, enabled via dashboard)
	// Server ID validation happens in handler regardless of mTLS
	// Legacy JSON format endpoint removed - agents now send simplified snapshots to /metrics/prometheus
	router.POST("/metrics/prometheus", prometheusHandler.IngestPrometheusMetrics) // Prometheus text format
	router.GET("/metrics/prometheus/health", prometheusHandler.HealthCheck)                       // Prometheus endpoint health (no mTLS)

	// Internal API routes (for Flagship/deployer only, not exposed publicly)
	internal := router.Group("/internal")
	{
		// Certificate management
		internal.POST("/certificates/generate", certificateHandler.GenerateCertificate)
		internal.POST("/certificates/revoke", certificateHandler.RevokeCertificate)
		internal.GET("/certificates/:server_id", certificateHandler.GetCertificate)
		internal.GET("/certificates/expiring", certificateHandler.ListExpiringCertificates)

		// CA management
		internal.POST("/ca/create", certificateHandler.CreateCA)
	}

	// Start server
	const port = "8080"
	addr := ":" + port
	log.Printf("Starting ingest service on %s (mTLS: ENABLED - Production Mode - STRICT enforcement)", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
