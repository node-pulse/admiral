package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nodepulse/dashboard/backend/internal/database"
	"github.com/nodepulse/dashboard/backend/internal/models"
	"github.com/nodepulse/dashboard/backend/internal/valkey"
)

const MetricsStreamKey = "nodepulse:metrics:stream"

type MetricsHandler struct {
	db     *database.DB
	valkey *valkey.Client
}

func NewMetricsHandler(db *database.DB, valkeyClient *valkey.Client) *MetricsHandler {
	return &MetricsHandler{
		db:     db,
		valkey: valkeyClient,
	}
}

// IngestMetrics handles incoming metrics from agents
// Now publishes to Valkey Stream instead of directly writing to database
func (h *MetricsHandler) IngestMetrics(c *gin.Context) {
	var report models.MetricReport
	if err := c.ShouldBindJSON(&report); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate server ID
	if _, err := uuid.Parse(report.ServerID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server_id"})
		return
	}

	// Serialize the metric report to JSON
	reportJSON, err := json.Marshal(report)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to serialize report"})
		return
	}

	// Publish to Valkey Stream for async processing
	ctx := c.Request.Context()
	streamData := map[string]string{
		"payload":   string(reportJSON),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}

	if _, err := h.valkey.XAdd(ctx, MetricsStreamKey, streamData); err != nil {
		// Log error but don't fail the request - could implement fallback here
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to queue metrics"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *MetricsHandler) upsertServer(tx *sql.Tx, serverID uuid.UUID, report *models.MetricReport) error {
	query := `
		INSERT INTO backend.servers (id, hostname, kernel, kernel_version, distro, distro_version, architecture, cpu_cores, last_seen_at, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (id) DO UPDATE SET
			hostname = EXCLUDED.hostname,
			kernel = COALESCE(EXCLUDED.kernel, servers.kernel),
			kernel_version = COALESCE(EXCLUDED.kernel_version, servers.kernel_version),
			distro = COALESCE(EXCLUDED.distro, servers.distro),
			distro_version = COALESCE(EXCLUDED.distro_version, servers.distro_version),
			architecture = COALESCE(EXCLUDED.architecture, servers.architecture),
			cpu_cores = COALESCE(EXCLUDED.cpu_cores, servers.cpu_cores),
			last_seen_at = EXCLUDED.last_seen_at,
			status = EXCLUDED.status,
			updated_at = CURRENT_TIMESTAMP
	`

	var kernel, kernelVersion, distro, distroVersion, architecture *string
	var cpuCores *int

	if report.SystemInfo != nil {
		kernel = &report.SystemInfo.Kernel
		kernelVersion = &report.SystemInfo.KernelVersion
		distro = &report.SystemInfo.Distro
		distroVersion = &report.SystemInfo.DistroVersion
		architecture = &report.SystemInfo.Architecture
		cpuCores = &report.SystemInfo.CPUCores
	}

	_, err := tx.Exec(query, serverID, report.Hostname, kernel, kernelVersion, distro, distroVersion, architecture, cpuCores, time.Now(), "active")
	return err
}

func (h *MetricsHandler) insertMetrics(tx *sql.Tx, serverID uuid.UUID, report *models.MetricReport) error {
	query := `
		INSERT INTO backend.metrics (
			server_id, timestamp,
			cpu_usage_percent,
			memory_used_mb, memory_total_mb, memory_usage_percent,
			network_upload_bytes, network_download_bytes,
			uptime_days
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`

	var cpuUsage *float64
	var memUsed, memTotal *int64
	var memUsagePercent *float64
	var netUpload, netDownload *int64
	var uptimeDays *float64

	if report.CPU != nil {
		cpuUsage = report.CPU.UsagePercent
	}
	if report.Memory != nil {
		memUsed = report.Memory.UsedMB
		memTotal = report.Memory.TotalMB
		memUsagePercent = report.Memory.UsagePercent
	}
	if report.Network != nil {
		netUpload = report.Network.UploadBytes
		netDownload = report.Network.DownloadBytes
	}
	if report.Uptime != nil {
		uptimeDays = report.Uptime.Days
	}

	_, err := tx.Exec(query, serverID, report.Timestamp, cpuUsage, memUsed, memTotal, memUsagePercent, netUpload, netDownload, uptimeDays)
	return err
}

// GetServers returns list of all servers
func (h *MetricsHandler) GetServers(c *gin.Context) {
	query := `
		SELECT id, hostname, kernel, kernel_version, distro, distro_version, architecture, cpu_cores, status, last_seen_at, created_at, updated_at
		FROM backend.servers
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
		SELECT id, server_id, timestamp, cpu_usage_percent, memory_used_mb, memory_total_mb, memory_usage_percent,
		       network_upload_bytes, network_download_bytes, uptime_days, created_at
		FROM backend.metrics
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
		if err := rows.Scan(&m.ID, &m.ServerID, &m.Timestamp, &m.CPUUsagePercent, &m.MemoryUsedMB, &m.MemoryTotalMB, &m.MemoryUsagePercent, &m.NetworkUploadBytes, &m.NetworkDownloadBytes, &m.UptimeDays, &m.CreatedAt); err != nil {
			continue
		}
		metrics = append(metrics, m)
	}

	c.JSON(http.StatusOK, metrics)
}
