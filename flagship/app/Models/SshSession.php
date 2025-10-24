<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SshSession extends Model
{
    use HasUuids;

    protected $table = 'ssh_sessions';

    protected $fillable = [
        'session_id',
        'server_id',
        'user_id',
        'better_auth_id',
        'started_at',
        'ended_at',
        'duration_seconds',
        'ip_address',
        'user_agent',
        'status',
        'disconnect_reason',
        'auth_method',
        'ssh_username',
        'ssh_host',
        'ssh_port',
        'host_key_fingerprint',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'ssh_port' => 'integer',
        'duration_seconds' => 'integer',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the server that this session belongs to
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /**
     * Check if session is currently active
     */
    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Scope for active sessions
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope for completed sessions
     */
    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    /**
     * Scope for failed sessions
     */
    public function scopeFailed($query)
    {
        return $query->where('status', 'failed');
    }

    /**
     * Scope for terminated sessions
     */
    public function scopeTerminated($query)
    {
        return $query->where('status', 'terminated');
    }

    /**
     * Scope for sessions within a date range
     */
    public function scopeInDateRange($query, $startDate, $endDate)
    {
        return $query->whereBetween('started_at', [$startDate, $endDate]);
    }

    /**
     * Get formatted duration
     */
    public function getFormattedDurationAttribute(): ?string
    {
        if (!$this->duration_seconds) {
            return null;
        }

        $seconds = $this->duration_seconds;

        if ($seconds < 60) {
            return "{$seconds}s";
        } elseif ($seconds < 3600) {
            $minutes = floor($seconds / 60);
            $secs = $seconds % 60;
            return "{$minutes}m {$secs}s";
        } else {
            $hours = floor($seconds / 3600);
            $minutes = floor(($seconds % 3600) / 60);
            return "{$hours}h {$minutes}m";
        }
    }
}
