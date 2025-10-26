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
     * Display deployments index page
     */
    public function index()
    {
        return Inertia::render('deployments/index');
    }

    /**
     * Display create deployment page
     */
    public function create()
    {
        return Inertia::render('deployments/create');
    }

    /**
     * Display deployment details page
     */
    public function details(string $id)
    {
        return Inertia::render('deployments/show', [
            'deploymentId' => $id,
        ]);
    }

    /**
     * Get list of deployments
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
     * Show deployment details
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
                'total_servers' => $deployment->total_servers,
                'successful_servers' => $deployment->successful_servers,
                'failed_servers' => $deployment->failed_servers,
                'skipped_servers' => $deployment->skipped_servers,
                'success_rate' => $deployment->success_rate,
                'duration' => $deployment->duration,
                'started_at' => $deployment->started_at?->toIso8601String(),
                'completed_at' => $deployment->completed_at?->toIso8601String(),
                'created_at' => $deployment->created_at->toIso8601String(),
                'output' => $deployment->output,
                'error_output' => $deployment->error_output,
                'servers' => $deployment->deploymentServers->map(function ($ds) {
                    return [
                        'id' => $ds->server->id,
                        'hostname' => $ds->server->hostname,
                        'name' => $ds->server->name,
                        'status' => $ds->status,
                        'changed' => $ds->changed,
                        'started_at' => $ds->started_at?->toIso8601String(),
                        'completed_at' => $ds->completed_at?->toIso8601String(),
                        'output' => $ds->output,
                        'error_message' => $ds->error_message,
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
            'playbook' => 'required|string|in:deploy-agent.yml,update-agent.yml,remove-agent.yml,rollback-agent.yml',
            'server_ids' => 'required|array|min:1',
            'server_ids.*' => 'required|uuid|exists:admiral.servers,id',
            'variables' => 'nullable|array',
        ]);

        // Create deployment record
        $deployment = Deployment::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'playbook' => $validated['playbook'],
            'server_filter' => [
                'server_ids' => $validated['server_ids'],
            ],
            'variables' => $validated['variables'] ?? [],
            'status' => 'pending',
        ]);

        // Prepare extra vars for Ansible
        $extraVars = array_merge($validated['variables'] ?? [], [
            'dashboard_endpoint' => config('app.url') . '/metrics',
            'agent_version' => $validated['variables']['agent_version'] ?? 'latest',
        ]);

        // Dispatch job
        DeployAgentJob::dispatch(
            $deployment,
            $validated['server_ids'],
            $extraVars
        );

        return response()->json([
            'message' => 'Deployment job queued successfully',
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

        // Get the process ID from cache
        $processId = cache()->get("deployment:{$deployment->id}:process_id");

        if ($processId && posix_getpgid($processId)) {
            // Try graceful termination first
            posix_kill($processId, SIGTERM);

            // Wait 5 seconds
            sleep(5);

            // Force kill if still running
            if (posix_getpgid($processId)) {
                posix_kill($processId, SIGKILL);
            }

            cache()->forget("deployment:{$deployment->id}:process_id");
        }

        // Update deployment status
        $deployment->update([
            'status' => 'cancelled',
            'completed_at' => now(),
        ]);

        return response()->json([
            'message' => 'Deployment cancelled successfully',
        ]);
    }
}
