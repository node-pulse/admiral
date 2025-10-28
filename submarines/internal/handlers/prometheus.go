package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/parsers"
	"github.com/nodepulse/admiral/submarines/internal/valkey"
)

type PrometheusHandler struct {
	db     *database.DB
	valkey *valkey.Client
}

func NewPrometheusHandler(db *database.DB, valkeyClient *valkey.Client) *PrometheusHandler {
	return &PrometheusHandler{
		db:     db,
		valkey: valkeyClient,
	}
}

// PrometheusMetricsPayload represents the message published to Valkey Stream
type PrometheusMetricsPayload struct {
	ServerID string                     `json:"server_id"`
	Metrics  []*parsers.PrometheusMetric `json:"metrics"`
}

// IngestPrometheusMetrics handles incoming Prometheus text format metrics
// POST /metrics/prometheus
// Content-Type: text/plain; version=0.0.4
// Query param: server_id=<uuid>
//
// This endpoint:
// 1. Parses Prometheus text format
// 2. Publishes to Valkey Stream
// 3. Digest workers consume and write to PostgreSQL metric_samples table
func (h *PrometheusHandler) IngestPrometheusMetrics(c *gin.Context) {
	// Get server_id from query parameter
	serverIDStr := c.Query("server_id")
	if serverIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "server_id query parameter is required"})
		return
	}

	// Validate server_id is a valid UUID
	serverID, err := uuid.Parse(serverIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid server_id format: %v", err),
		})
		return
	}

	// Check stream backpressure BEFORE parsing
	// If stream is backed up, reject new data immediately
	streamLen, err := h.valkey.StreamLength(MetricsStreamKey)
	if err != nil {
		log.Printf("ERROR: Failed to check stream length: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check stream status"})
		return
	}

	if streamLen > MaxStreamBacklog {
		log.Printf("WARN: Stream backlogged (%d pending), rejecting new metrics", streamLen)
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":   "metrics stream is backlogged",
			"pending": streamLen,
			"retry":   "retry after a few seconds",
		})
		return
	}

	// Parse Prometheus text format
	metrics, err := parsers.ParsePrometheusText(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("failed to parse Prometheus metrics: %v", err),
		})
		return
	}

	if len(metrics) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no metrics found in request body"})
		return
	}

	// Create payload for Valkey Stream
	payload := PrometheusMetricsPayload{
		ServerID: serverID.String(),
		Metrics:  metrics,
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		log.Printf("ERROR: Failed to marshal Prometheus payload: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process metrics"})
		return
	}

	// Publish to Valkey Stream
	messageID, err := h.valkey.PublishToStream(MetricsStreamKey, map[string]string{
		"type":    "prometheus",
		"payload": string(payloadJSON),
	})
	if err != nil {
		log.Printf("ERROR: Failed to publish to stream: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to publish metrics"})
		return
	}

	log.Printf("INFO: Published %d Prometheus metrics to stream (message_id=%s, server_id=%s)",
		len(metrics), messageID, serverID.String())

	c.JSON(http.StatusOK, gin.H{
		"status":          "success",
		"metrics_received": len(metrics),
		"message_id":      messageID,
		"server_id":       serverID.String(),
	})
}

// Health check endpoint for Prometheus metrics ingestion
func (h *PrometheusHandler) HealthCheck(c *gin.Context) {
	// Check Valkey stream health
	streamLen, err := h.valkey.StreamLength(MetricsStreamKey)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "unhealthy",
			"error":  "valkey stream unavailable",
		})
		return
	}

	status := "healthy"
	if streamLen > MaxStreamBacklog {
		status = "degraded"
	}

	c.JSON(http.StatusOK, gin.H{
		"status":         status,
		"stream_pending": streamLen,
		"max_backlog":    MaxStreamBacklog,
		"format":         "prometheus",
	})
}
