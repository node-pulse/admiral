<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Metric - Simplified metrics storage with dedicated columns
 *
 * This model represents server metrics with raw counter values.
 * Each row contains all metrics for a single scrape interval.
 *
 * Philosophy:
 * - Store raw values (not percentages) for maximum flexibility
 * - No relationships (query directly by server_id)
 * - No foreign keys (application-level integrity)
 *
 * Metric types stored:
 * - CPU: Raw seconds (idle, user, system, iowait, steal)
 * - Memory: Raw bytes (total, available, free, cached, buffers, active, inactive)
 * - Swap: Raw bytes (total, free, cached)
 * - Disk: Raw bytes (total, free, available)
 * - Disk I/O: Counters (reads, writes, bytes, io_time)
 * - Network: Counters (rx/tx bytes, packets, errors, drops)
 * - System: Gauges (load averages, processes, uptime)
 */
class Metric extends Model
{
    protected $table = 'metrics';

    public $timestamps = false;

    protected $fillable = [
        'server_id',
        'timestamp',
        // CPU metrics
        'cpu_idle_seconds',
        'cpu_iowait_seconds',
        'cpu_system_seconds',
        'cpu_user_seconds',
        'cpu_steal_seconds',
        'cpu_cores',
        // Memory metrics
        'memory_total_bytes',
        'memory_available_bytes',
        'memory_free_bytes',
        'memory_cached_bytes',
        'memory_buffers_bytes',
        'memory_active_bytes',
        'memory_inactive_bytes',
        // Swap metrics
        'swap_total_bytes',
        'swap_free_bytes',
        'swap_cached_bytes',
        // Disk metrics
        'disk_total_bytes',
        'disk_free_bytes',
        'disk_available_bytes',
        // Disk I/O metrics
        'disk_reads_completed_total',
        'disk_writes_completed_total',
        'disk_read_bytes_total',
        'disk_written_bytes_total',
        'disk_io_time_seconds_total',
        // Network metrics
        'network_receive_bytes_total',
        'network_transmit_bytes_total',
        'network_receive_packets_total',
        'network_transmit_packets_total',
        'network_receive_errs_total',
        'network_transmit_errs_total',
        'network_receive_drop_total',
        'network_transmit_drop_total',
        // System metrics
        'load_1min',
        'load_5min',
        'load_15min',
        'processes_running',
        'processes_blocked',
        'processes_total',
        'uptime_seconds',
    ];

    protected $casts = [
        'timestamp' => 'datetime',
        'created_at' => 'datetime',
        // CPU
        'cpu_idle_seconds' => 'float',
        'cpu_iowait_seconds' => 'float',
        'cpu_system_seconds' => 'float',
        'cpu_user_seconds' => 'float',
        'cpu_steal_seconds' => 'float',
        'cpu_cores' => 'integer',
        // Memory
        'memory_total_bytes' => 'integer',
        'memory_available_bytes' => 'integer',
        'memory_free_bytes' => 'integer',
        'memory_cached_bytes' => 'integer',
        'memory_buffers_bytes' => 'integer',
        'memory_active_bytes' => 'integer',
        'memory_inactive_bytes' => 'integer',
        // Swap
        'swap_total_bytes' => 'integer',
        'swap_free_bytes' => 'integer',
        'swap_cached_bytes' => 'integer',
        // Disk
        'disk_total_bytes' => 'integer',
        'disk_free_bytes' => 'integer',
        'disk_available_bytes' => 'integer',
        // Disk I/O
        'disk_reads_completed_total' => 'integer',
        'disk_writes_completed_total' => 'integer',
        'disk_read_bytes_total' => 'integer',
        'disk_written_bytes_total' => 'integer',
        'disk_io_time_seconds_total' => 'float',
        // Network
        'network_receive_bytes_total' => 'integer',
        'network_transmit_bytes_total' => 'integer',
        'network_receive_packets_total' => 'integer',
        'network_transmit_packets_total' => 'integer',
        'network_receive_errs_total' => 'integer',
        'network_transmit_errs_total' => 'integer',
        'network_receive_drop_total' => 'integer',
        'network_transmit_drop_total' => 'integer',
        // System
        'load_1min' => 'float',
        'load_5min' => 'float',
        'load_15min' => 'float',
        'processes_running' => 'integer',
        'processes_blocked' => 'integer',
        'processes_total' => 'integer',
        'uptime_seconds' => 'integer',
    ];

    /**
     * Scope: Filter by server ID
     */
    public function scopeForServer($query, string $serverId)
    {
        return $query->where('server_id', $serverId);
    }

    /**
     * Scope: Filter by time range
     */
    public function scopeTimeRange($query, $startTime, $endTime = null)
    {
        $query->where('timestamp', '>=', $startTime);
        if ($endTime) {
            $query->where('timestamp', '<=', $endTime);
        }
        return $query;
    }

    /**
     * Scope: Get latest metrics
     */
    public function scopeLatest($query)
    {
        return $query->orderBy('timestamp', 'desc');
    }

    /**
     * Scope: Get recent metrics (last N entries)
     */
    public function scopeRecent($query, int $limit = 100)
    {
        return $query->orderBy('timestamp', 'desc')->limit($limit);
    }

    /**
     * Calculate CPU usage percentage from raw seconds
     */
    public function getCpuUsagePercentAttribute(): ?float
    {
        $total = $this->cpu_idle_seconds + $this->cpu_user_seconds +
                 $this->cpu_system_seconds + $this->cpu_iowait_seconds +
                 $this->cpu_steal_seconds;

        if ($total == 0) {
            return null;
        }

        return round(100 - ($this->cpu_idle_seconds / $total * 100), 2);
    }

    /**
     * Calculate memory usage percentage
     */
    public function getMemoryUsagePercentAttribute(): ?float
    {
        if (!$this->memory_total_bytes || $this->memory_total_bytes == 0) {
            return null;
        }

        $used = $this->memory_total_bytes - $this->memory_available_bytes;
        return round(($used / $this->memory_total_bytes) * 100, 2);
    }

    /**
     * Calculate disk usage percentage
     */
    public function getDiskUsagePercentAttribute(): ?float
    {
        if (!$this->disk_total_bytes || $this->disk_total_bytes == 0) {
            return null;
        }

        $used = $this->disk_total_bytes - $this->disk_available_bytes;
        return round(($used / $this->disk_total_bytes) * 100, 2);
    }

    /**
     * Calculate swap usage percentage
     */
    public function getSwapUsagePercentAttribute(): ?float
    {
        if (!$this->swap_total_bytes || $this->swap_total_bytes == 0) {
            return null;
        }

        $used = $this->swap_total_bytes - $this->swap_free_bytes;
        return round(($used / $this->swap_total_bytes) * 100, 2);
    }

    /**
     * Get memory used in bytes (calculated)
     */
    public function getMemoryUsedBytesAttribute(): ?int
    {
        if (!$this->memory_total_bytes || !$this->memory_available_bytes) {
            return null;
        }

        return $this->memory_total_bytes - $this->memory_available_bytes;
    }

    /**
     * Get disk used in bytes (calculated)
     */
    public function getDiskUsedBytesAttribute(): ?int
    {
        if (!$this->disk_total_bytes || !$this->disk_available_bytes) {
            return null;
        }

        return $this->disk_total_bytes - $this->disk_available_bytes;
    }

    /**
     * Get swap used in bytes (calculated)
     */
    public function getSwapUsedBytesAttribute(): ?int
    {
        if (!$this->swap_total_bytes || !$this->swap_free_bytes) {
            return null;
        }

        return $this->swap_total_bytes - $this->swap_free_bytes;
    }
}
