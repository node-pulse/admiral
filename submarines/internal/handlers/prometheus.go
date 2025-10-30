package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/valkey"
	"github.com/nodepulse/admiral/submarines/internal/validation"
)

const (
	MetricsStreamKey = "nodepulse:metrics:stream"
	MaxStreamBacklog = 10000 // Reject new metrics if stream has more than this many pending
)

// MetricSnapshot represents a parsed snapshot of all essential metrics
// This matches the admiral.metrics table schema (raw values, no percentages)
// Sent by agents after parsing Prometheus metrics locally
type MetricSnapshot struct {
	Timestamp time.Time `json:"timestamp"`

	// CPU Metrics (seconds, raw values from counters)
	CPUIdleSeconds   float64 `json:"cpu_idle_seconds"`
	CPUIowaitSeconds float64 `json:"cpu_iowait_seconds"`
	CPUSystemSeconds float64 `json:"cpu_system_seconds"`
	CPUUserSeconds   float64 `json:"cpu_user_seconds"`
	CPUStealSeconds  float64 `json:"cpu_steal_seconds"`
	CPUCores         int     `json:"cpu_cores"`

	// Memory Metrics (bytes, raw values)
	MemoryTotalBytes     int64 `json:"memory_total_bytes"`
	MemoryAvailableBytes int64 `json:"memory_available_bytes"`
	MemoryFreeBytes      int64 `json:"memory_free_bytes"`
	MemoryCachedBytes    int64 `json:"memory_cached_bytes"`
	MemoryBuffersBytes   int64 `json:"memory_buffers_bytes"`
	MemoryActiveBytes    int64 `json:"memory_active_bytes"`
	MemoryInactiveBytes  int64 `json:"memory_inactive_bytes"`

	// Swap Metrics (bytes, raw values)
	SwapTotalBytes  int64 `json:"swap_total_bytes"`
	SwapFreeBytes   int64 `json:"swap_free_bytes"`
	SwapCachedBytes int64 `json:"swap_cached_bytes"`

	// Disk Metrics (bytes for root filesystem)
	DiskTotalBytes     int64 `json:"disk_total_bytes"`
	DiskFreeBytes      int64 `json:"disk_free_bytes"`
	DiskAvailableBytes int64 `json:"disk_available_bytes"`

	// Disk I/O (counters and totals)
	DiskReadsCompletedTotal  int64   `json:"disk_reads_completed_total"`
	DiskWritesCompletedTotal int64   `json:"disk_writes_completed_total"`
	DiskReadBytesTotal       int64   `json:"disk_read_bytes_total"`
	DiskWrittenBytesTotal    int64   `json:"disk_written_bytes_total"`
	DiskIOTimeSecondsTotal   float64 `json:"disk_io_time_seconds_total"`

	// Network Metrics (counters and totals)
	NetworkReceiveBytesTotal    int64 `json:"network_receive_bytes_total"`
	NetworkTransmitBytesTotal   int64 `json:"network_transmit_bytes_total"`
	NetworkReceivePacketsTotal  int64 `json:"network_receive_packets_total"`
	NetworkTransmitPacketsTotal int64 `json:"network_transmit_packets_total"`
	NetworkReceiveErrsTotal     int64 `json:"network_receive_errs_total"`
	NetworkTransmitErrsTotal    int64 `json:"network_transmit_errs_total"`
	NetworkReceiveDropTotal     int64 `json:"network_receive_drop_total"`
	NetworkTransmitDropTotal    int64 `json:"network_transmit_drop_total"`

	// System Load Average
	Load1Min  float64 `json:"load_1min"`
	Load5Min  float64 `json:"load_5min"`
	Load15Min float64 `json:"load_15min"`

	// Process Counts
	ProcessesRunning int `json:"processes_running"`
	ProcessesBlocked int `json:"processes_blocked"`
	ProcessesTotal   int `json:"processes_total"`

	// System Uptime
	UptimeSeconds int64 `json:"uptime_seconds"`
}

type PrometheusHandler struct {
	db        *database.DB
	valkey    *valkey.Client
	validator *validation.ServerIDValidator
}

func NewPrometheusHandler(db *database.DB, valkeyClient *valkey.Client, validator *validation.ServerIDValidator) *PrometheusHandler {
	return &PrometheusHandler{
		db:        db,
		valkey:    valkeyClient,
		validator: validator,
	}
}

// MetricSnapshotPayload represents the message published to Valkey Stream
// This is the simplified format sent by agents after parsing Prometheus metrics
type MetricSnapshotPayload struct {
	ServerID string          `json:"server_id"`
	Snapshot *MetricSnapshot `json:"snapshot"`
}

// IngestPrometheusMetrics handles incoming simplified metric snapshots from agents
// POST /metrics/prometheus
// Content-Type: application/json
// Body: MetricSnapshot JSON (39 fields pre-parsed by agent)
//
// This endpoint:
// 1. Receives pre-parsed metric snapshot JSON from agent
// 2. Publishes to Valkey Stream
// 3. Digest workers consume and write to PostgreSQL metrics table (single row)
func (h *PrometheusHandler) IngestPrometheusMetrics(c *gin.Context) {
	// Parse JSON body containing metric snapshot
	var snapshot MetricSnapshot
	if err := c.ShouldBindJSON(&snapshot); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid JSON format: %v", err),
		})
		return
	}

	// Get server_id from JSON body (agents include it in the snapshot)
	// For backward compatibility, also check query parameter
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

	// Validate server_id exists in database (with Valkey caching)
	// This runs REGARDLESS of mTLS state - it's an independent security layer
	exists, err := h.validator.ValidateServerID(c.Request.Context(), serverID.String())
	if err != nil {
		log.Printf("ERROR: Server ID validation failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server validation failed"})
		return
	}

	if !exists {
		log.Printf("WARN: Rejected metrics from unknown server_id: %s", serverID.String())
		c.JSON(http.StatusForbidden, gin.H{
			"error": "unknown server_id",
			"detail": "server not found in database",
		})
		return
	}

	// Check stream backpressure BEFORE processing
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

	// Create payload for Valkey Stream
	payload := MetricSnapshotPayload{
		ServerID: serverID.String(),
		Snapshot: &snapshot,
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		log.Printf("ERROR: Failed to marshal snapshot payload: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process metrics"})
		return
	}

	// Publish to Valkey Stream
	messageID, err := h.valkey.PublishToStream(MetricsStreamKey, map[string]string{
		"type":    "snapshot",
		"payload": string(payloadJSON),
	})
	if err != nil {
		log.Printf("ERROR: Failed to publish to stream: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to publish metrics"})
		return
	}

	log.Printf("INFO: Published metric snapshot to stream (message_id=%s, server_id=%s)",
		messageID, serverID.String())

	c.JSON(http.StatusOK, gin.H{
		"status":     "success",
		"message_id": messageID,
		"server_id":  serverID.String(),
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
