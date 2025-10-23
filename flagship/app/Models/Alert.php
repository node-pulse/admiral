<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Alert extends Model
{
    use HasUuids;

    protected $table = 'admiral.alerts';

    protected $fillable = [
        'server_id',
        'alert_type',
        'severity',
        'message',
        'threshold_value',
        'current_value',
        'metadata',
        'status',
        'acknowledged_at',
        'resolved_at',
    ];

    protected $casts = [
        'threshold_value' => 'decimal:2',
        'current_value' => 'decimal:2',
        'metadata' => 'array',
        'acknowledged_at' => 'datetime',
        'resolved_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
