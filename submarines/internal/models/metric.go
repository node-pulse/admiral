package models

import (
	"time"
)

// MetricSnapshot represents a parsed snapshot of all essential metrics
// This matches the admiral.metrics table schema (raw values, no percentages)
// NOTE: This is only used for deserialization - agents do the actual parsing
type Metric struct {
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
