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

// ProcessSnapshot represents a single process group metric snapshot from process_exporter
// Agent sends a flat array of these directly: [ProcessSnapshot, ProcessSnapshot, ...]
type ProcessSnapshot struct {
	Timestamp       time.Time `json:"timestamp"`
	Name            string    `json:"name"`              // Process name (groupname)
	NumProcs        int       `json:"num_procs"`         // Number of processes
	CPUSecondsTotal float64   `json:"cpu_seconds_total"` // Total CPU time (counter)
	MemoryBytes     int64     `json:"memory_bytes"`      // Resident memory (RSS)
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
// Phase 2: Includes exporter_name to distinguish between different metric sources
type MetricSnapshotPayload struct {
	ServerID     string          `json:"server_id"`
	ExporterName string          `json:"exporter_name"` // e.g., "node_exporter", "postgres_exporter"
	Snapshot     *MetricSnapshot `json:"snapshot"`
}

// IngestPrometheusMetrics handles incoming simplified metric snapshots from agents
// POST /metrics/prometheus?server_id=<uuid>
// Content-Type: application/json
// Body: Phase 2 grouped payload: { "node_exporter": [...], "postgres_exporter": [...] }
//
// This endpoint:
// 1. Receives grouped payload from agent (multiple exporters, each with array of snapshots)
// 2. Publishes each snapshot to Valkey Stream (one message per snapshot)
// 3. Digest workers consume and write to PostgreSQL metrics table
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

	// Parse Phase 2 grouped payload using json.RawMessage for flexibility
	// Supports: { "node_exporter": [...], "process_exporter": [...] }
	var groupedPayload map[string]json.RawMessage
	if err := c.ShouldBindJSON(&groupedPayload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid JSON format: %v", err),
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

	// Process each exporter's snapshots
	totalPublished := 0
	messageIDs := []string{}

	for exporterName, rawSnapshots := range groupedPayload {
		switch exporterName {
		case "node_exporter":
			// Parse node_exporter snapshots (array of MetricSnapshot)
			var snapshots []MetricSnapshot
			if err := json.Unmarshal(rawSnapshots, &snapshots); err != nil {
				log.Printf("ERROR: Failed to parse node_exporter payload: %v", err)
				continue
			}

			for _, snapshot := range snapshots {
				payload := MetricSnapshotPayload{
					ServerID:     serverID.String(),
					ExporterName: exporterName,
					Snapshot:     &snapshot,
				}

				payloadJSON, err := json.Marshal(payload)
				if err != nil {
					log.Printf("ERROR: Failed to marshal node_exporter snapshot: %v", err)
					continue
				}

				messageID, err := h.valkey.PublishToStream(MetricsStreamKey, map[string]string{
					"type":    "snapshot",
					"payload": string(payloadJSON),
				})
				if err != nil {
					log.Printf("ERROR: Failed to publish to stream: %v", err)
					continue
				}

				messageIDs = append(messageIDs, messageID)
				totalPublished++
			}

		case "process_exporter":
			// Parse process_exporter snapshots (flat array of ProcessSnapshot)
			var processSnapshots []ProcessSnapshot
			if err := json.Unmarshal(rawSnapshots, &processSnapshots); err != nil {
				log.Printf("ERROR: Failed to parse process_exporter payload: %v", err)
				continue
			}

			// Publish each process snapshot individually (same as node_exporter pattern)
			for _, processSnapshot := range processSnapshots {
				// Create payload structure that digest can parse
				payloadMap := map[string]any{
					"server_id":     serverID.String(),
					"exporter_name": exporterName,
					"snapshot":      processSnapshot,
				}

				payloadJSON, err := json.Marshal(payloadMap)
				if err != nil {
					log.Printf("ERROR: Failed to marshal process_exporter snapshot: %v", err)
					continue
				}

				messageID, err := h.valkey.PublishToStream(MetricsStreamKey, map[string]string{
					"type":    "snapshot",
					"payload": string(payloadJSON),
				})
				if err != nil {
					log.Printf("ERROR: Failed to publish to stream: %v", err)
					continue
				}

				messageIDs = append(messageIDs, messageID)
				totalPublished++
			}

		default:
			log.Printf("WARN: Unknown exporter type: %s", exporterName)
		}
	}

	if totalPublished == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to publish any metrics",
		})
		return
	}

	log.Printf("INFO: Published %d metric snapshot(s) to stream (server_id=%s)",
		totalPublished, serverID.String())

	c.JSON(http.StatusOK, gin.H{
		"status":          "success",
		"snapshots":       totalPublished,
		"server_id":       serverID.String(),
		"first_message_id": messageIDs[0],
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
