<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $name
 * @property string|null $description
 * @property string $playbook
 * @property array $server_filter
 * @property array $variables
 * @property string $status
 * @property \Illuminate\Support\Carbon|null $started_at
 * @property \Illuminate\Support\Carbon|null $completed_at
 * @property int $total_servers
 * @property int $successful_servers
 * @property int $failed_servers
 * @property int $skipped_servers
 * @property string|null $output
 * @property string|null $error_output
 * @property int|null $created_by
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 * @property-read float $success_rate
 * @property-read int|null $duration
 */
class Deployment extends Model
{
    protected $table = 'admiral.deployments';

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'description',
        'playbook',
        'server_filter',
        'variables',
        'status',
        'started_at',
        'completed_at',
        'total_servers',
        'successful_servers',
        'failed_servers',
        'skipped_servers',
        'output',
        'error_output',
        'created_by',
    ];

    protected $casts = [
        'server_filter' => 'array',
        'variables' => 'array',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = \Illuminate\Support\Str::uuid()->toString();
            }
        });
    }

    public function servers(): BelongsToMany
    {
        return $this->belongsToMany(
            Server::class,
            'admiral.deployment_servers',
            'deployment_id',
            'server_id'
        )->withPivot([
            'status',
            'started_at',
            'completed_at',
            'changed',
            'output',
            'error_message',
        ])->withTimestamps();
    }

    public function deploymentServers(): HasMany
    {
        return $this->hasMany(DeploymentServer::class, 'deployment_id');
    }

    public function isRunning(): bool
    {
        return $this->status === 'running';
    }

    public function isCompleted(): bool
    {
        return in_array($this->status, ['completed', 'failed', 'cancelled']);
    }

    public function getSuccessRateAttribute(): float
    {
        if ($this->total_servers === 0) {
            return 0.0;
        }

        return ($this->successful_servers / $this->total_servers) * 100;
    }

    public function getDurationAttribute(): ?int
    {
        if (!$this->started_at || !$this->completed_at) {
            return null;
        }

        return $this->started_at->diffInSeconds($this->completed_at);
    }
}
