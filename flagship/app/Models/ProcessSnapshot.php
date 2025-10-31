<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProcessSnapshot extends Model
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'admiral.process_snapshots';

    /**
     * The primary key for the model.
     *
     * @var string
     */
    protected $primaryKey = 'id';

    /**
     * Indicates if the model should be timestamped.
     * We use created_at but not updated_at (append-only table)
     *
     * @var bool
     */
    public $timestamps = false;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'server_id',
        'timestamp',
        'process_name',
        'num_procs',
        'cpu_seconds_total',
        'memory_bytes',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'timestamp' => 'datetime',
        'created_at' => 'datetime',
        'num_procs' => 'integer',
        'cpu_seconds_total' => 'float',
        'memory_bytes' => 'integer',
    ];

    /**
     * Get the server that owns the process snapshot.
     * Note: No foreign key constraint for performance - application-level relationship
     */
    public function server()
    {
        return $this->belongsTo(Server::class, 'server_id', 'server_id');
    }

    /**
     * Scope: Filter by server ID
     */
    public function scopeForServer($query, string $serverId)
    {
        return $query->where('server_id', $serverId);
    }

    /**
     * Scope: Filter by time range (hours back from now)
     */
    public function scopeWithinHours($query, int $hours)
    {
        return $query->where('timestamp', '>=', now()->subHours($hours));
    }

    /**
     * Scope: Order by timestamp descending (newest first)
     */
    public function scopeLatest($query)
    {
        return $query->orderBy('timestamp', 'desc');
    }
}
