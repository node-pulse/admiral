# Laravel Integration Reference

Laravel backend integration code and examples for the Ansible agent deployment system.

---

## Database Schema

### Migrations

**File**: `migrate/migrations/20251025120000001_add_deployments_tables.sql`

```sql
-- Up Migration
-- Add deployment tracking tables

CREATE TABLE admiral.deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Deployment configuration
    playbook VARCHAR(100) NOT NULL,  -- deploy-agent, update-agent, remove-agent
    server_filter JSONB,              -- Server selection criteria
    variables JSONB,                  -- Ansible extra vars

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed, cancelled
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Results
    total_servers INTEGER NOT NULL DEFAULT 0,
    successful_servers INTEGER NOT NULL DEFAULT 0,
    failed_servers INTEGER NOT NULL DEFAULT 0,
    skipped_servers INTEGER NOT NULL DEFAULT 0,

    -- Output
    output TEXT,                      -- Ansible stdout
    error_output TEXT,                -- Ansible stderr

    -- Metadata
    created_by UUID,                  -- User ID (if auth is implemented)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_deployments_status ON admiral.deployments(status);
CREATE INDEX idx_deployments_created_at ON admiral.deployments(created_at DESC);


CREATE TABLE admiral.deployment_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES admiral.deployments(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES admiral.servers(id) ON DELETE CASCADE,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, running, success, failed, skipped
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Results
    changed BOOLEAN DEFAULT FALSE,
    output TEXT,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(deployment_id, server_id)
);

CREATE INDEX idx_deployment_servers_deployment ON admiral.deployment_servers(deployment_id);
CREATE INDEX idx_deployment_servers_server ON admiral.deployment_servers(server_id);
CREATE INDEX idx_deployment_servers_status ON admiral.deployment_servers(status);


-- Down Migration

DROP TABLE IF EXISTS admiral.deployment_servers;
DROP TABLE IF EXISTS admiral.deployments;
```

---

## Eloquent Models

### Deployment Model

**File**: `flagship/app/Models/Deployment.php`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Deployment extends Model
{
    protected $table = 'admiral.deployments';

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

    /**
     * Get servers through deployment_servers pivot table
     */
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

    /**
     * Get deployment server pivot records
     */
    public function deploymentServers(): HasMany
    {
        return $this->hasMany(DeploymentServer::class, 'deployment_id');
    }

    /**
     * Check if deployment is running
     */
    public function isRunning(): bool
    {
        return $this->status === 'running';
    }

    /**
     * Check if deployment is completed (any terminal state)
     */
    public function isCompleted(): bool
    {
        return in_array($this->status, ['completed', 'failed', 'cancelled']);
    }

    /**
     * Get success rate percentage
     */
    public function getSuccessRateAttribute(): float
    {
        if ($this->total_servers === 0) {
            return 0.0;
        }

        return ($this->successful_servers / $this->total_servers) * 100;
    }

    /**
     * Get deployment duration in seconds
     */
    public function getDurationAttribute(): ?int
    {
        if (!$this->started_at || !$this->completed_at) {
            return null;
        }

        return $this->started_at->diffInSeconds($this->completed_at);
    }
}
```

### DeploymentServer Model (Pivot)

**File**: `flagship/app/Models/DeploymentServer.php`

```php
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

    /**
     * Get the deployment this record belongs to
     */
    public function deployment(): BelongsTo
    {
        return $this->belongsTo(Deployment::class, 'deployment_id');
    }

    /**
     * Get the server this record belongs to
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'server_id');
    }
}
```

---

## Services

### AnsibleService

**File**: `flagship/app/Services/AnsibleService.php`

This service wraps Ansible CLI execution and handles playbook orchestration.

```php
<?php

namespace App\Services;

use App\Models\Deployment;
use App\Models\DeploymentServer;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Process;

class AnsibleService
{
    private string $ansiblePath;
    private string $playbookPath;
    private string $inventoryPath;

    public function __construct()
    {
        $this->ansiblePath = base_path('ansible');
        $this->playbookPath = base_path('ansible/playbooks/nodepulse');
        $this->inventoryPath = base_path('ansible/inventory/dynamic.php');
    }

    /**
     * Run an Ansible playbook
     *
     * @param Deployment $deployment  The deployment record
     * @param string $playbook         Playbook filename (e.g., "deploy-agent-mtls.yml")
     * @param array $serverIds         Server UUIDs to deploy to
     * @param array $extraVars         Extra variables to pass to Ansible
     * @return bool                    True if successful
     */
    public function runPlaybook(
        Deployment $deployment,
        string $playbook,
        array $serverIds = [],
        array $extraVars = []
    ): bool {
        // Update deployment status
        $deployment->update([
            'status' => 'running',
            'started_at' => now(),
        ]);

        // Build Ansible command
        $command = $this->buildCommand($playbook, $serverIds, $extraVars);

        Log::info("Running Ansible playbook", [
            'deployment_id' => $deployment->id,
            'playbook' => $playbook,
            'command' => $command,
        ]);

        // Execute Ansible
        $process = new Process(
            $command,
            $this->ansiblePath,
            $this->buildEnvironment($serverIds),
            null,
            3600  // 1 hour timeout
        );

        // Start the process and track PID for cancellation
        $process->start();

        // Store process ID in cache for cancellation support
        cache()->put("deployment:{$deployment->id}:process_id", $process->getPid(), 3600);

        $output = '';
        $errorOutput = '';

        // Stream output and parse in real-time
        $process->wait(function ($type, $buffer) use (&$output, &$errorOutput, $deployment) {
            if (Process::ERR === $type) {
                $errorOutput .= $buffer;
            } else {
                $output .= $buffer;
            }

            // Parse Ansible output for progress updates
            $this->parseAnsibleOutput($buffer, $deployment);
        });

        // Update deployment with results
        $deployment->update([
            'status' => $process->isSuccessful() ? 'completed' : 'failed',
            'completed_at' => now(),
            'output' => $output,
            'error_output' => $errorOutput,
        ]);

        // Parse final stats from PLAY RECAP section
        $this->parseFinalStats($output, $deployment);

        // Clean up cache
        cache()->forget("deployment:{$deployment->id}:process_id");

        return $process->isSuccessful();
    }

    /**
     * Build Ansible command array
     */
    private function buildCommand(string $playbook, array $serverIds, array $extraVars): array
    {
        $command = [
            'ansible-playbook',
            "{$this->playbookPath}/{$playbook}",
            '-i', $this->inventoryPath,
            '--timeout=30',
        ];

        // Add extra vars as JSON
        if (!empty($extraVars)) {
            $command[] = '--extra-vars';
            $command[] = json_encode($extraVars);
        }

        return $command;
    }

    /**
     * Build environment variables for Ansible
     */
    private function buildEnvironment(array $serverIds = []): array
    {
        $env = array_merge($_ENV, [
            'ANSIBLE_CONFIG' => base_path('ansible/ansible.cfg'),
            'ANSIBLE_FORCE_COLOR' => 'true',
            'ANSIBLE_HOST_KEY_CHECKING' => 'False',
            'AGENT_DOWNLOAD_BASE_URL' => config('app.agent_download_base_url'),
        ]);

        // Pass server IDs to dynamic inventory script
        if (!empty($serverIds)) {
            $env['ANSIBLE_SERVER_IDS'] = implode(',', $serverIds);
        }

        return $env;
    }

    /**
     * Parse Ansible output for progress updates
     *
     * Detects task execution and updates deployment_servers status
     */
    private function parseAnsibleOutput(string $buffer, Deployment $deployment): void
    {
        // Parse task execution
        if (preg_match('/TASK \[(.*?)\]/', $buffer, $matches)) {
            Log::debug("Ansible task", [
                'deployment_id' => $deployment->id,
                'task' => $matches[1],
            ]);
        }

        // Parse host results (ok, changed, failed, skipped)
        if (preg_match('/(ok|changed|failed|skipped):\s+\[(.*?)\]/', $buffer, $matches)) {
            $status = $matches[1];
            $hostname = $matches[2];

            // Find the server and update status
            $server = $deployment->servers()
                ->where('hostname', $hostname)
                ->first();

            if ($server) {
                DeploymentServer::where('deployment_id', $deployment->id)
                    ->where('server_id', $server->id)
                    ->update([
                        'status' => $this->mapAnsibleStatus($status),
                        'changed' => $status === 'changed',
                    ]);
            }
        }
    }

    /**
     * Parse final Ansible stats from PLAY RECAP section
     *
     * Example:
     * PLAY RECAP *****
     * server1 : ok=5 changed=2 unreachable=0 failed=0 skipped=0 rescued=0 ignored=0
     */
    private function parseFinalStats(string $output, Deployment $deployment): void
    {
        $stats = [
            'successful_servers' => 0,
            'failed_servers' => 0,
            'skipped_servers' => 0,
        ];

        if (preg_match_all('/(\S+)\s+:\s+ok=(\d+).*?failed=(\d+).*?skipped=(\d+)/', $output, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $hostname = $match[1];
                $ok = (int) $match[2];
                $failed = (int) $match[3];
                $skipped = (int) $match[4];

                if ($failed > 0) {
                    $stats['failed_servers']++;
                } elseif ($skipped > 0) {
                    $stats['skipped_servers']++;
                } else {
                    $stats['successful_servers']++;
                }
            }
        }

        $deployment->update($stats);
    }

    /**
     * Map Ansible status to our deployment status
     */
    private function mapAnsibleStatus(string $ansibleStatus): string
    {
        return match($ansibleStatus) {
            'ok', 'changed' => 'success',
            'failed' => 'failed',
            'skipped' => 'skipped',
            default => 'pending',
        };
    }

    /**
     * Test Ansible connectivity to servers
     *
     * Runs `ansible all -m ping` to verify SSH access
     */
    public function testConnection(array $serverIds = []): array
    {
        $command = [
            'ansible',
            'all',
            '-i', $this->inventoryPath,
            '-m', 'ping',
            '--timeout=10',
        ];

        $process = new Process(
            $command,
            $this->ansiblePath,
            $this->buildEnvironment($serverIds)
        );

        $process->run();

        return [
            'success' => $process->isSuccessful(),
            'output' => $process->getOutput(),
            'error' => $process->getErrorOutput(),
        ];
    }
}
```

---

## Jobs

### DeployAgentJob

**File**: `flagship/app/Jobs/DeployAgentJob.php`

Queue job that runs the Ansible deployment in the background.

```php
<?php

namespace App\Jobs;

use App\Models\Deployment;
use App\Models\DeploymentServer;
use App\Models\Server;
use App\Services\AnsibleService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class DeployAgentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 3600; // 1 hour
    public $tries = 1;      // No retries for deployments

    public function __construct(
        private Deployment $deployment,
        private array $serverIds,
        private array $variables = []
    ) {
        $this->onQueue('deployments');
    }

    public function handle(AnsibleService $ansible): void
    {
        Log::info("Starting agent deployment", [
            'deployment_id' => $this->deployment->id,
            'servers' => count($this->serverIds),
        ]);

        // Create deployment server records
        foreach ($this->serverIds as $serverId) {
            DeploymentServer::create([
                'deployment_id' => $this->deployment->id,
                'server_id' => $serverId,
                'status' => 'pending',
            ]);
        }

        // Update total servers count
        $this->deployment->update([
            'total_servers' => count($this->serverIds),
        ]);

        try {
            // Determine playbook based on deployment configuration
            $playbook = $this->deployment->playbook;

            // Run Ansible playbook
            $success = $ansible->runPlaybook(
                $this->deployment,
                $playbook,
                $this->serverIds,
                $this->variables
            );

            if ($success) {
                Log::info("Deployment completed successfully", [
                    'deployment_id' => $this->deployment->id,
                ]);
            } else {
                Log::warning("Deployment completed with errors", [
                    'deployment_id' => $this->deployment->id,
                ]);
            }
        } catch (\Exception $e) {
            Log::error("Deployment failed", [
                'deployment_id' => $this->deployment->id,
                'error' => $e->getMessage(),
            ]);

            $this->deployment->update([
                'status' => 'failed',
                'completed_at' => now(),
                'error_output' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    /**
     * Handle job failure
     */
    public function failed(\Throwable $exception): void
    {
        Log::error("Deployment job failed", [
            'deployment_id' => $this->deployment->id,
            'exception' => $exception->getMessage(),
        ]);

        $this->deployment->update([
            'status' => 'failed',
            'completed_at' => now(),
            'error_output' => $exception->getMessage(),
        ]);
    }
}
```

---

## Controllers

### DeploymentsController

**File**: `flagship/app/Http/Controllers/DeploymentsController.php`

Handles API requests for deployment management.

```php
<?php

namespace App\Http\Controllers;

use App\Jobs\DeployAgentJob;
use App\Models\Deployment;
use App\Models\Server;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DeploymentsController extends Controller
{
    /**
     * Display deployments index page (Inertia)
     */
    public function index()
    {
        return Inertia::render('deployments/index');
    }

    /**
     * Get list of deployments (API)
     */
    public function list(Request $request)
    {
        $query = Deployment::query()
            ->orderBy('created_at', 'desc');

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        // Search by name
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                    ->orWhere('description', 'ilike', "%{$search}%");
            });
        }

        $perPage = $request->input('per_page', 20);
        $deployments = $query->paginate($perPage);

        return response()->json([
            'deployments' => $deployments->through(function ($deployment) {
                return [
                    'id' => $deployment->id,
                    'name' => $deployment->name,
                    'description' => $deployment->description,
                    'playbook' => $deployment->playbook,
                    'status' => $deployment->status,
                    'total_servers' => $deployment->total_servers,
                    'successful_servers' => $deployment->successful_servers,
                    'failed_servers' => $deployment->failed_servers,
                    'success_rate' => $deployment->success_rate,
                    'duration' => $deployment->duration,
                    'started_at' => $deployment->started_at?->toIso8601String(),
                    'completed_at' => $deployment->completed_at?->toIso8601String(),
                    'created_at' => $deployment->created_at->toIso8601String(),
                ];
            }),
            'meta' => [
                'current_page' => $deployments->currentPage(),
                'per_page' => $deployments->perPage(),
                'total' => $deployments->total(),
                'last_page' => $deployments->lastPage(),
            ],
        ]);
    }

    /**
     * Show deployment details (API)
     */
    public function show(string $id)
    {
        $deployment = Deployment::with(['deploymentServers.server'])
            ->findOrFail($id);

        return response()->json([
            'deployment' => [
                'id' => $deployment->id,
                'name' => $deployment->name,
                'description' => $deployment->description,
                'playbook' => $deployment->playbook,
                'status' => $deployment->status,
                'variables' => $deployment->variables,
                'total_servers' => $deployment->total_servers,
                'successful_servers' => $deployment->successful_servers,
                'failed_servers' => $deployment->failed_servers,
                'skipped_servers' => $deployment->skipped_servers,
                'success_rate' => $deployment->success_rate,
                'duration' => $deployment->duration,
                'output' => $deployment->output,
                'error_output' => $deployment->error_output,
                'started_at' => $deployment->started_at?->toIso8601String(),
                'completed_at' => $deployment->completed_at?->toIso8601String(),
                'created_at' => $deployment->created_at->toIso8601String(),
                'servers' => $deployment->deploymentServers->map(function ($ds) {
                    return [
                        'id' => $ds->id,
                        'server_id' => $ds->server_id,
                        'hostname' => $ds->server->hostname,
                        'status' => $ds->status,
                        'changed' => $ds->changed,
                        'output' => $ds->output,
                        'error_message' => $ds->error_message,
                        'started_at' => $ds->started_at?->toIso8601String(),
                        'completed_at' => $ds->completed_at?->toIso8601String(),
                    ];
                }),
            ],
        ]);
    }

    /**
     * Create a new deployment
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'playbook' => 'required|in:deploy-agent-mtls.yml,deploy-agent-no-mtls.yml,upgrade-agent.yml,rollback-agent.yml,uninstall-agent.yml',
            'server_ids' => 'required|array|min:1',
            'server_ids.*' => 'uuid|exists:admiral.servers,id',
            'variables' => 'nullable|array',
        ]);

        // Create deployment record
        $deployment = Deployment::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'playbook' => $validated['playbook'],
            'server_filter' => ['server_ids' => $validated['server_ids']],
            'variables' => array_merge([
                'ingest_endpoint' => config('app.ingest_endpoint'),
                'agent_version' => config('app.agent_version', 'latest'),
                'agent_interval' => '15s',
                'agent_timeout' => '10s',
            ], $validated['variables'] ?? []),
            'status' => 'pending',
        ]);

        // Dispatch deployment job
        DeployAgentJob::dispatch(
            $deployment,
            $validated['server_ids'],
            $deployment->variables
        );

        return response()->json([
            'message' => 'Deployment started',
            'deployment' => [
                'id' => $deployment->id,
                'name' => $deployment->name,
                'status' => $deployment->status,
            ],
        ], 201);
    }

    /**
     * Cancel a running deployment
     */
    public function cancel(string $id)
    {
        $deployment = Deployment::findOrFail($id);

        if (!$deployment->isRunning()) {
            return response()->json([
                'message' => 'Deployment is not running',
            ], 400);
        }

        // Find and kill the running Ansible process
        $processId = cache()->get("deployment:{$deployment->id}:process_id");

        if ($processId && posix_getpgid($processId)) {
            // Send SIGTERM to gracefully stop Ansible
            posix_kill($processId, SIGTERM);

            // Wait 5 seconds for graceful shutdown
            sleep(5);

            // If still running, force kill with SIGKILL
            if (posix_getpgid($processId)) {
                posix_kill($processId, SIGKILL);
            }

            cache()->forget("deployment:{$deployment->id}:process_id");
        }

        $deployment->update([
            'status' => 'cancelled',
            'completed_at' => now(),
        ]);

        return response()->json([
            'message' => 'Deployment cancelled',
        ]);
    }
}
```

---

## Routes

### API Routes

**File**: `flagship/routes/api.php`

```php
<?php

use App\Http\Controllers\DeploymentsController;
use Illuminate\Support\Facades\Route;

// Deployment API routes (with auth middleware)
Route::middleware(['auth', 'verified', 'admin'])->prefix('deployments')->group(function () {
    Route::get('/', [DeploymentsController::class, 'list']);
    Route::post('/', [DeploymentsController::class, 'store']);
    Route::get('/{id}', [DeploymentsController::class, 'show']);
    Route::post('/{id}/cancel', [DeploymentsController::class, 'cancel']);
});
```

### Web Routes

**File**: `flagship/routes/web.php`

```php
<?php

use App\Http\Controllers\DeploymentsController;
use Illuminate\Support\Facades\Route;

// Deployment web routes (Inertia pages)
Route::middleware(['auth', 'verified', 'admin'])->prefix('dashboard/deployments')->group(function () {
    Route::get('/', [DeploymentsController::class, 'index'])->name('deployments.index');
    Route::get('/create', [DeploymentsController::class, 'create'])->name('deployments.create');
    Route::get('/{id}', [DeploymentsController::class, 'details'])->name('deployments.show');
});
```

---

## Queue Configuration

### Queue Setup

**File**: `flagship/config/queue.php`

Add a dedicated queue for deployments:

```php
'connections' => [
    // ... existing connections ...

    'database' => [
        'driver' => 'database',
        'connection' => env('DB_QUEUE_CONNECTION'),
        'table' => env('DB_QUEUE_TABLE', 'jobs'),
        'queue' => env('QUEUE_NAME', 'default'),
        'retry_after' => 7200, // 2 hours for deployment jobs
        'after_commit' => false,
    ],
],

'queues' => [
    'default' => 'default',
    'deployments' => 'deployments', // Dedicated queue for Ansible deployments
],
```

### Queue Worker (Development)

```bash
# Start queue worker for deployments queue
php artisan queue:work --queue=deployments --tries=1 --timeout=3600

# Or use the dev command (includes queue worker)
composer dev
```

### Queue Worker (Production with Supervisor)

**File**: `/etc/supervisor/conf.d/flagship-queue.conf`

```ini
[program:flagship-queue-deployments]
process_name=%(program_name)s_%(process_num)02d
command=php /path/to/flagship/artisan queue:work --queue=deployments --sleep=3 --tries=1 --max-time=3600 --timeout=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/flagship-queue-deployments.log
stopwaitsecs=3600
```

---

## Artisan Commands

### AnsibleInitCommand

**File**: `flagship/app/Console/Commands/AnsibleInitCommand.php`

Initialize Ansible directory structure.

```php
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class AnsibleInitCommand extends Command
{
    protected $signature = 'ansible:init';
    protected $description = 'Initialize Ansible directory structure';

    public function handle()
    {
        $basePath = base_path('ansible');

        $directories = [
            'inventory',
            'playbooks/nodepulse',
            'playbooks/prometheus',
            'roles/nodepulse-agent/tasks',
            'roles/nodepulse-agent/templates',
            'roles/nodepulse-agent/files',
            'roles/nodepulse-agent/handlers',
            'roles/nodepulse-agent/vars',
            'roles/nodepulse-agent/defaults',
            'group_vars',
            'host_vars',
        ];

        foreach ($directories as $dir) {
            $path = "$basePath/$dir";
            if (!File::exists($path)) {
                File::makeDirectory($path, 0755, true);
                $this->info("Created: $path");
            }
        }

        // Create ansible.cfg if it doesn't exist
        $configPath = "$basePath/ansible.cfg";
        if (!File::exists($configPath)) {
            File::put($configPath, $this->getAnsibleConfig());
            $this->info("Created: $configPath");
        }

        $this->info('Ansible directory structure initialized successfully!');
    }

    private function getAnsibleConfig(): string
    {
        return <<<CFG
[defaults]
inventory = ./inventory/dynamic.php
forks = 100
host_key_checking = False
timeout = 30
gathering = smart
stdout_callback = yaml
callbacks_enabled = profile_tasks, timer

[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o StrictHostKeyChecking=no
pipelining = True
CFG;
    }
}
```

### AnsibleInventoryCommand

**File**: `flagship/app/Console/Commands/AnsibleInventoryCommand.php`

Test dynamic inventory script.

```php
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Symfony\Component\Process\Process;

class AnsibleInventoryCommand extends Command
{
    protected $signature = 'ansible:inventory
                            {--server-ids= : Comma-separated server IDs}
                            {--tags= : Comma-separated tags}
                            {--status= : Filter by status}';

    protected $description = 'Generate and display Ansible inventory';

    public function handle()
    {
        $inventoryScript = base_path('ansible/inventory/dynamic.php');

        $env = [];

        if ($serverIds = $this->option('server-ids')) {
            $env['ANSIBLE_SERVER_IDS'] = $serverIds;
        }

        if ($tags = $this->option('tags')) {
            $env['ANSIBLE_TAGS'] = $tags;
        }

        if ($status = $this->option('status')) {
            $env['ANSIBLE_STATUS'] = $status;
        }

        $process = new Process([$inventoryScript, '--list'], null, $env);
        $process->run();

        if (!$process->isSuccessful()) {
            $this->error('Failed to generate inventory:');
            $this->error($process->getErrorOutput());
            return 1;
        }

        $this->info('Ansible Inventory:');
        $this->line($process->getOutput());

        return 0;
    }
}
```

**Usage**:

```bash
# List all servers
php artisan ansible:inventory

# Filter by server IDs
php artisan ansible:inventory --server-ids=uuid1,uuid2,uuid3

# Filter by tags
php artisan ansible:inventory --tags=production,web

# Filter by status
php artisan ansible:inventory --status=active
```

---

## Reference

- Main README: [../ANSIBLE_README.md](../ANSIBLE_README.md)
- Architecture details: [architecture.md](./architecture.md)
- Playbooks reference: [playbooks.md](./playbooks.md)

---

**Last Updated:** 2025-10-30
