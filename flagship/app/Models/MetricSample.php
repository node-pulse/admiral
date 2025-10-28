<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * MetricSample - Prometheus-native metrics storage
 *
 * This model represents metrics stored in the new Prometheus-first schema.
 * Each row represents a single metric sample with labels stored as JSONB.
 *
 * Example metrics:
 * - node_cpu_seconds_total{cpu="0",mode="idle"}
 * - node_memory_MemTotal_bytes
 * - node_filesystem_size_bytes{device="/dev/sda1",mountpoint="/"}
 */
class MetricSample extends Model
{
    protected $table = 'metric_samples';

    public $timestamps = false;

    protected $fillable = [
        'server_id',
        'metric_name',
        'metric_type',
        'labels',
        'value',
        'timestamp',
        'sample_count',
        'sample_sum',
        'exemplar',
        'exemplar_value',
        'exemplar_timestamp',
        'help_text',
        'unit',
    ];

    protected $casts = [
        'labels' => 'array',
        'exemplar' => 'array',
        'timestamp' => 'datetime',
        'exemplar_timestamp' => 'datetime',
        'value' => 'float',
        'sample_count' => 'integer',
        'sample_sum' => 'float',
        'exemplar_value' => 'float',
        'created_at' => 'datetime',
    ];

    /**
     * Get the server that owns this metric sample
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'server_id', 'server_id');
    }

    /**
     * Scope: Filter by metric name
     */
    public function scopeMetricName($query, string $metricName)
    {
        return $query->where('metric_name', $metricName);
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
     * Scope: Filter by label (JSONB query)
     * Example: ->whereLabel('cpu', '0')
     */
    public function scopeWhereLabel($query, string $key, $value)
    {
        return $query->whereRaw("labels->>'?' = ?", [$key, $value]);
    }

    /**
     * Scope: Get latest metric for each server
     */
    public function scopeLatest($query)
    {
        return $query->orderBy('timestamp', 'desc');
    }

    /**
     * Scope: Exclude specific labels (e.g., exclude tmpfs filesystems)
     * Example: ->excludeLabel('fstype', 'tmpfs')
     */
    public function scopeExcludeLabel($query, string $key, $value)
    {
        return $query->whereRaw("labels->>'?' != ?", [$key, $value]);
    }
}
