<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Server extends Model
{
    use HasUuids;

    protected $table = 'servers';

    protected $fillable = [
        'server_id',
        'hostname',
        'name',
        'description',
        'kernel',
        'kernel_version',
        'distro',
        'distro_version',
        'architecture',
        'cpu_cores',
        'ssh_host',
        'ssh_port',
        'ssh_username',
        'is_reachable',
        'last_validated_at',
        'tags',
        'metadata',
        'status',
        'last_seen_at',
    ];

    protected $casts = [
        'tags' => 'array',
        'metadata' => 'array',
        'cpu_cores' => 'integer',
        'ssh_port' => 'integer',
        'is_reachable' => 'boolean',
        'last_validated_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function alerts(): HasMany
    {
        return $this->hasMany(Alert::class);
    }

    public function privateKeys(): BelongsToMany
    {
        return $this->belongsToMany(PrivateKey::class, 'server_private_keys')
            ->withPivot('purpose', 'is_primary', 'last_used_at')
            ->withTimestamps();
    }

    public function sshSessions(): HasMany
    {
        return $this->hasMany(SshSession::class);
    }

    /**
     * Get the primary SSH key for this server
     */
    public function primaryPrivateKey()
    {
        return $this->privateKeys()->wherePivot('is_primary', true)->first();
    }

    /**
     * Get latest metrics for this server (no relationship, direct query)
     */
    public function getLatestMetrics(): ?Metric
    {
        return Metric::where('server_id', $this->server_id)
            ->orderBy('timestamp', 'desc')
            ->first();
    }

    /**
     * Get metrics in time range (no relationship, direct query)
     */
    public function getMetricsInRange($startTime, $endTime = null)
    {
        $query = Metric::where('server_id', $this->server_id)
            ->where('timestamp', '>=', $startTime)
            ->orderBy('timestamp', 'asc');

        if ($endTime) {
            $query->where('timestamp', '<=', $endTime);
        }

        return $query->get();
    }

    /**
     * Get recent metrics (last N entries, no relationship)
     */
    public function getRecentMetrics(int $limit = 100)
    {
        return Metric::where('server_id', $this->server_id)
            ->orderBy('timestamp', 'desc')
            ->limit($limit)
            ->get();
    }

    /**
     * Check if server is online (seen in last 5 minutes)
     */
    public function isOnline(): bool
    {
        if (!$this->last_seen_at) {
            return false;
        }

        return $this->last_seen_at->greaterThan(now()->subMinutes(5));
    }

    /**
     * Scope for online servers
     */
    public function scopeOnline($query)
    {
        return $query->where('last_seen_at', '>', now()->subMinutes(5));
    }

    /**
     * Scope for offline servers
     */
    public function scopeOffline($query)
    {
        return $query->where(function ($q) {
            $q->whereNull('last_seen_at')
                ->orWhere('last_seen_at', '<=', now()->subMinutes(5));
        });
    }
}
