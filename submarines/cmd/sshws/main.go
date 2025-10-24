package main

import (
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/nodepulse/dashboard/backend/internal/config"
	"github.com/nodepulse/dashboard/backend/internal/database"
	"github.com/nodepulse/dashboard/backend/internal/sshws"
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

	// Initialize router
	router := gin.Default()

	// Configure CORS - allow WebSocket connections
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"}, // Configure based on your needs
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "Upgrade", "Connection"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		AllowWebSockets:  true,
	}))

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "node-pulse-sshws",
		})
	})

	// Initialize SSH WebSocket handler
	sshWSHandler := sshws.NewHandler(db.DB, cfg.MasterKey)

	// SSH WebSocket route
	router.GET("/ssh/:server_id", sshWSHandler.HandleWebSocket)

	// Start server
	addr := ":6001"
	log.Printf("Starting SSH WebSocket service on %s", addr)
	log.Printf("WebSocket endpoint: ws://<host>:6001/ssh/<server_id>")
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
