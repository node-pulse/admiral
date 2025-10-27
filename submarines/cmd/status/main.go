package main

import (
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/nodepulse/admiral/submarines/internal/config"
	"github.com/nodepulse/admiral/submarines/internal/database"
)

func main() {
	// Load configuration
	cfg := config.Load(config.LoadOptions{
		RequireMasterKey: true,
	})

	// Set Gin mode
	gin.SetMode(cfg.GinMode)

	// Initialize database (read-only)
	db, err := database.New(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize router
	router := gin.Default()

	// Configure CORS - open for public access
	router.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"}, // Public access
		AllowMethods: []string{"GET", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept"},
	}))

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "nodepulse-status",
		})
	})

	// Public status page routes (read-only, no auth required)
	router.GET("/status/:share_id", func(c *gin.Context) {
		// TODO: Implement public status page
		// - Look up share_id in database
		// - Return server status, uptime, and basic metrics
		// - No sensitive information
		c.JSON(200, gin.H{
			"message": "Status page - coming soon",
			"share_id": c.Param("share_id"),
		})
	})

	router.GET("/badge/:share_id/uptime", func(c *gin.Context) {
		// TODO: Generate SVG badge for uptime
		c.JSON(200, gin.H{
			"message": "Uptime badge - coming soon",
		})
	})

	router.GET("/badge/:share_id/status", func(c *gin.Context) {
		// TODO: Generate SVG badge for status (up/down)
		c.JSON(200, gin.H{
			"message": "Status badge - coming soon",
		})
	})

	// Start server
	addr := ":" + cfg.Port
	log.Printf("Starting status (public status pages) service on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
