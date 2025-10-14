package models

import (
	"time"

	"github.com/google/uuid"
)

type Server struct {
	ID             uuid.UUID              `json:"id"`
	Hostname       string                 `json:"hostname"`
	Kernel         *string                `json:"kernel,omitempty"`
	KernelVersion  *string                `json:"kernel_version,omitempty"`
	Distro         *string                `json:"distro,omitempty"`
	DistroVersion  *string                `json:"distro_version,omitempty"`
	Architecture   *string                `json:"architecture,omitempty"`
	CPUCores       *int                   `json:"cpu_cores,omitempty"`
	Tags           []string               `json:"tags"`
	Metadata       map[string]interface{} `json:"metadata"`
	Status         string                 `json:"status"`
	LastSeenAt     *time.Time             `json:"last_seen_at,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`
}

type SystemInfo struct {
	Hostname      string `json:"hostname"`
	Kernel        string `json:"kernel"`
	KernelVersion string `json:"kernel_version"`
	Distro        string `json:"distro"`
	DistroVersion string `json:"distro_version"`
	Architecture  string `json:"architecture"`
	CPUCores      int    `json:"cpu_cores"`
}

type CPUMetrics struct {
	UsagePercent *float64 `json:"usage_percent"`
}

type MemoryMetrics struct {
	UsedMB        *int64   `json:"used_mb"`
	TotalMB       *int64   `json:"total_mb"`
	UsagePercent  *float64 `json:"usage_percent"`
}

type NetworkMetrics struct {
	UploadBytes   *int64 `json:"upload_bytes"`
	DownloadBytes *int64 `json:"download_bytes"`
}

type UptimeMetrics struct {
	Days *float64 `json:"days"`
}

type MetricReport struct {
	Timestamp  time.Time       `json:"timestamp"`
	ServerID   string          `json:"server_id"`
	Hostname   string          `json:"hostname"`
	SystemInfo *SystemInfo     `json:"system_info,omitempty"`
	CPU        *CPUMetrics     `json:"cpu"`
	Memory     *MemoryMetrics  `json:"memory"`
	Network    *NetworkMetrics `json:"network"`
	Uptime     *UptimeMetrics  `json:"uptime"`
}

type Metric struct {
	ID                   int64      `json:"id"`
	ServerID             uuid.UUID  `json:"server_id"`
	Timestamp            time.Time  `json:"timestamp"`
	CPUUsagePercent      *float64   `json:"cpu_usage_percent,omitempty"`
	MemoryUsedMB         *int64     `json:"memory_used_mb,omitempty"`
	MemoryTotalMB        *int64     `json:"memory_total_mb,omitempty"`
	MemoryUsagePercent   *float64   `json:"memory_usage_percent,omitempty"`
	NetworkUploadBytes   *int64     `json:"network_upload_bytes,omitempty"`
	NetworkDownloadBytes *int64     `json:"network_download_bytes,omitempty"`
	UptimeDays           *float64   `json:"uptime_days,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
}
