<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeploymentServer extends Model
{
    protected $table = 'admiral.deployment_servers';

    protected $fillable = [
        'deployment_id',
        'server_id',
        'status',
        'started_at',
        'completed_at',
        'changed',
        'output',
        'error_message',
    ];

    protected $casts = [
        'changed' => 'boolean',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function deployment(): BelongsTo
    {
        return $this->belongsTo(Deployment::class, 'deployment_id');
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'server_id');
    }
}
