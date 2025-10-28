package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nodepulse/admiral/submarines/internal/database"
	"github.com/nodepulse/admiral/submarines/internal/models"
	"github.com/nodepulse/admiral/submarines/internal/valkey"
	"github.com/nodepulse/admiral/submarines/internal/validation"
)

const (
	MetricsStreamKey = "nodepulse:metrics:stream"
	MaxStreamBacklog = 10000 // Reject new metrics if stream has more than this many pending
	// NO MAXLEN/auto-trimming - we don't want to lose data!
	// Messages are removed only after digest workers successfully process and ACK them
)

type MetricsHandler struct {
	db        *database.DB
	valkey    *valkey.Client
	validator *validation.ServerIDValidator
}

func NewMetricsHandler(db *database.DB, valkeyClient *valkey.Client, validator *validation.ServerIDValidator) *MetricsHandler {
	return &MetricsHandler{
		db:        db,
		valkey:    valkeyClient,
		validator: validator,
	}
}

// IngestMetrics handles incoming metrics from agents
// Now publishes to Valkey Stream instead of directly writing to database
// Expects an array of metric reports (even if just one)
func (h *MetricsHandler) IngestMetrics(c *gin.Context) {
	// Read request body
	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}

	// Parse JSON as array of metric reports
	var reports []models.MetricReport
	if err := json.Unmarshal(bodyBytes, &reports); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "invalid JSON format - expected array of metric reports",
			"detail": err.Error(),
		})
		return
	}

	// Validate we have at least one report
	if len(reports) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no metric reports provided"})
		return
	}

	// Check stream backpressure before accepting new metrics
	ctx := c.Request.Context()
	if err := h.valkey.CheckStreamBackpressure(ctx, MetricsStreamKey, MaxStreamBacklog); err != nil {
		log.Printf("[BACKPRESSURE] %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "metrics ingestion temporarily unavailable",
			"detail": "system is processing backlog, please retry in a few moments",
		})
		return
	}

	// Process each report
	successCount := 0

	for _, report := range reports {
		// Validate server ID format
		if _, err := uuid.Parse(report.ServerID); err != nil {
			continue // Skip invalid reports but process the rest
		}

		// Validate server_id exists in database (with Valkey caching)
		// This runs REGARDLESS of mTLS state - it's an independent security layer
		exists, err := h.validator.ValidateServerID(ctx, report.ServerID)
		if err != nil {
			log.Printf("ERROR: Server ID validation failed for %s: %v", report.ServerID, err)
			continue // Skip this report on validation error
		}

		if !exists {
			log.Printf("WARN: Rejected metrics from unknown server_id: %s", report.ServerID)
			continue // Skip metrics from unknown servers
		}

		// Serialize the metric report to JSON
		reportJSON, err := json.Marshal(report)
		if err != nil {
			continue
		}

		// Publish to Valkey Stream for async processing
		streamData := map[string]string{
			"payload":   string(reportJSON),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		}

		if _, err := h.valkey.XAdd(ctx, MetricsStreamKey, streamData); err != nil {
			continue
		}

		successCount++
	}

	if successCount == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to queue any metrics"})
		return
	}

	log.Printf("Queued %d metric(s) to Valkey", successCount)

	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"received":  len(reports),
		"processed": successCount,
	})
}

// GetServers returns list of all servers
func (h *MetricsHandler) GetServers(c *gin.Context) {
	query := `
		SELECT id, hostname, kernel, kernel_version, distro, distro_version, architecture, cpu_cores, status, last_seen_at, created_at, updated_at
		FROM admiral.servers
		ORDER BY hostname ASC
	`

	rows, err := h.db.Query(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query servers"})
		return
	}
	defer rows.Close()

	servers := []models.Server{}
	for rows.Next() {
		var s models.Server
		if err := rows.Scan(&s.ID, &s.Hostname, &s.Kernel, &s.KernelVersion, &s.Distro, &s.DistroVersion, &s.Architecture, &s.CPUCores, &s.Status, &s.LastSeenAt, &s.CreatedAt, &s.UpdatedAt); err != nil {
			continue
		}
		servers = append(servers, s)
	}

	c.JSON(http.StatusOK, servers)
}

// GetServerMetrics returns metrics for a specific server
func (h *MetricsHandler) GetServerMetrics(c *gin.Context) {
	serverID := c.Param("id")

	query := `
		SELECT *
		FROM admiral.metrics
		WHERE server_id = $1
		ORDER BY timestamp DESC
		LIMIT 100
	`

	rows, err := h.db.Query(query, serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query metrics"})
		return
	}
	defer rows.Close()

	metrics := []models.Metric{}
	for rows.Next() {
		var m models.Metric
		var rawData []byte // raw_data column exists in DB but not needed in model
		if err := rows.Scan(&m.ID, &m.ServerID, &m.Timestamp, &m.CPUUsagePercent, &m.MemoryUsedMB, &m.MemoryTotalMB, &m.MemoryUsagePercent, &m.DiskUsedGB, &m.DiskTotalGB, &m.DiskUsagePercent, &m.DiskMountPoint, &m.NetworkUploadBytes, &m.NetworkDownloadBytes, &m.UptimeDays, &m.Processes, &m.IPv4, &m.IPv6, &rawData, &m.CreatedAt); err != nil {
			continue
		}
		metrics = append(metrics, m)
	}

	c.JSON(http.StatusOK, metrics)
}
