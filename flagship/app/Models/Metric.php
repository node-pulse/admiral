<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Metric extends Model
{
    protected $table = 'metrics';

    public $timestamps = false;

    protected $fillable = [
        'server_id',
        'timestamp',
        'cpu_usage_percent',
        'memory_used_mb',
        'memory_total_mb',
        'memory_usage_percent',
        'disk_used_gb',
        'disk_total_gb',
        'disk_usage_percent',
        'disk_mount_point',
        'network_upload_bytes',
        'network_download_bytes',
        'uptime_days',
        'processes',
        'ipv4',
        'ipv6',
        'raw_data',
    ];

    protected $casts = [
        'timestamp' => 'datetime',
        'cpu_usage_percent' => 'decimal:2',
        'memory_used_mb' => 'integer',
        'memory_total_mb' => 'integer',
        'memory_usage_percent' => 'decimal:2',
        'disk_used_gb' => 'float',
        'disk_total_gb' => 'float',
        'disk_usage_percent' => 'float',
        'network_upload_bytes' => 'integer',
        'network_download_bytes' => 'integer',
        'uptime_days' => 'decimal:2',
        'processes' => 'array',
        'raw_data' => 'array',
        'created_at' => 'datetime',
    ];

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
