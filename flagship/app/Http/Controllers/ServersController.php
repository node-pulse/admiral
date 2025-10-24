<?php

namespace App\Http\Controllers;

use App\Models\PrivateKey;
use App\Models\Server;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ServersController extends Controller
{
    /**
     * Display servers index page
     */
    public function index()
    {
        return Inertia::render('servers');
    }

    /**
     * Get paginated list of servers with SSH key info
     */
    public function list(Request $request)
    {
        $query = Server::query()
            ->with(['privateKeys' => function ($query) {
                $query->wherePivot('is_primary', true);
            }])
            ->orderBy('hostname');

        // Search filter
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('hostname', 'ilike', "%{$search}%")
                    ->orWhere('name', 'ilike', "%{$search}%")
                    ->orWhere('server_id', 'ilike', "%{$search}%")
                    ->orWhere('ssh_host', 'ilike', "%{$search}%");
            });
        }

        // Status filter
        if ($request->has('status')) {
            $status = $request->input('status');
            if ($status === 'online') {
                $query->online();
            } elseif ($status === 'offline') {
                $query->offline();
            } else {
                $query->where('status', $status);
            }
        }

        // SSH configured filter
        if ($request->has('has_ssh')) {
            if ($request->boolean('has_ssh')) {
                $query->whereNotNull('ssh_host');
            } else {
                $query->whereNull('ssh_host');
            }
        }

        $perPage = $request->input('per_page', 20);
        $servers = $query->paginate($perPage);

        return response()->json([
            'servers' => $servers->through(function ($server) {
                $primaryKey = $server->privateKeys->first();

                return [
                    'id' => $server->id,
                    'server_id' => $server->server_id,
                    'hostname' => $server->hostname,
                    'name' => $server->name,
                    'display_name' => $server->name ?: $server->hostname,
                    'description' => $server->description,

                    // System info
                    'kernel' => $server->kernel,
                    'distro' => $server->distro,
                    'architecture' => $server->architecture,
                    'cpu_cores' => $server->cpu_cores,

                    // SSH configuration
                    'ssh_host' => $server->ssh_host,
                    'ssh_port' => $server->ssh_port,
                    'ssh_username' => $server->ssh_username,
                    'has_ssh_key' => !is_null($primaryKey),
                    'ssh_key_name' => $primaryKey?->name,
                    'is_reachable' => $server->is_reachable,
                    'last_validated_at' => $server->last_validated_at?->toIso8601String(),

                    // Status
                    'status' => $server->status,
                    'is_online' => $server->isOnline(),
                    'last_seen_at' => $server->last_seen_at?->toIso8601String(),

                    // Metadata
                    'tags' => $server->tags,
                    'created_at' => $server->created_at->toIso8601String(),
                    'updated_at' => $server->updated_at->toIso8601String(),
                ];
            }),
            'meta' => [
                'current_page' => $servers->currentPage(),
                'per_page' => $servers->perPage(),
                'total' => $servers->total(),
                'last_page' => $servers->lastPage(),
            ],
        ]);
    }

    /**
     * Get single server details
     */
    public function show(string $id)
    {
        $server = Server::with(['privateKeys', 'metrics' => function ($query) {
            $query->orderBy('timestamp', 'desc')->limit(1);
        }])->findOrFail($id);

        $latestMetric = $server->metrics->first();

        return response()->json([
            'server' => [
                'id' => $server->id,
                'server_id' => $server->server_id,
                'hostname' => $server->hostname,
                'name' => $server->name,
                'description' => $server->description,

                // System info
                'kernel' => $server->kernel,
                'kernel_version' => $server->kernel_version,
                'distro' => $server->distro,
                'distro_version' => $server->distro_version,
                'architecture' => $server->architecture,
                'cpu_cores' => $server->cpu_cores,

                // SSH configuration
                'ssh_host' => $server->ssh_host,
                'ssh_port' => $server->ssh_port,
                'ssh_username' => $server->ssh_username,
                'is_reachable' => $server->is_reachable,
                'last_validated_at' => $server->last_validated_at?->toIso8601String(),

                // SSH keys
                'private_keys' => $server->privateKeys->map(function ($key) {
                    return [
                        'id' => $key->id,
                        'name' => $key->name,
                        'fingerprint' => $key->fingerprint,
                        'is_primary' => $key->pivot->is_primary,
                        'purpose' => $key->pivot->purpose,
                        'last_used_at' => $key->pivot->last_used_at,
                    ];
                }),

                // Status
                'status' => $server->status,
                'is_online' => $server->isOnline(),
                'last_seen_at' => $server->last_seen_at?->toIso8601String(),

                // Latest metrics
                'latest_metric' => $latestMetric ? [
                    'cpu_usage_percent' => $latestMetric->cpu_usage_percent,
                    'memory_usage_percent' => $latestMetric->memory_usage_percent,
                    'disk_usage_percent' => $latestMetric->disk_usage_percent,
                    'timestamp' => $latestMetric->timestamp->toIso8601String(),
                ] : null,

                // Metadata
                'tags' => $server->tags,
                'metadata' => $server->metadata,
                'created_at' => $server->created_at->toIso8601String(),
                'updated_at' => $server->updated_at->toIso8601String(),
            ],
        ]);
    }

    /**
     * Create a new server
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'hostname' => 'nullable|string|max:255',
            'name' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'ssh_host' => 'nullable|string|max:255',
            'ssh_port' => 'nullable|integer|min:1|max:65535',
            'ssh_username' => 'nullable|string|max:255',
            'tags' => 'nullable|array',
            'metadata' => 'nullable|array',
        ]);

        // Generate a temporary server_id if not provided by agent
        if (!isset($validated['server_id'])) {
            $validated['server_id'] = \Illuminate\Support\Str::uuid()->toString();
        }

        // Use hostname as fallback if name not provided
        if (!isset($validated['hostname']) && !isset($validated['name'])) {
            return response()->json([
                'message' => 'Either hostname or name must be provided',
            ], 422);
        }

        // Default hostname to name if not provided
        if (!isset($validated['hostname'])) {
            $validated['hostname'] = $validated['name'];
        }

        $server = Server::create($validated);

        return response()->json([
            'message' => 'Server created successfully',
            'server' => $server,
        ], 201);
    }

    /**
     * Update an existing server
     */
    public function update(Request $request, string $id)
    {
        $server = Server::findOrFail($id);

        $validated = $request->validate([
            'hostname' => 'sometimes|string|max:255',
            'name' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'ssh_host' => 'nullable|string|max:255',
            'ssh_port' => 'nullable|integer|min:1|max:65535',
            'ssh_username' => 'nullable|string|max:255',
            'status' => 'sometimes|string|in:active,inactive,error',
            'tags' => 'nullable|array',
            'metadata' => 'nullable|array',
        ]);

        $server->update($validated);

        return response()->json([
            'message' => 'Server updated successfully',
            'server' => $server,
        ]);
    }

    /**
     * Delete a server
     */
    public function destroy(string $id)
    {
        $server = Server::findOrFail($id);
        $server->delete();

        return response()->json([
            'message' => 'Server deleted successfully',
        ]);
    }

    /**
     * Attach an SSH key to a server
     */
    public function attachKey(Request $request, string $id)
    {
        $server = Server::findOrFail($id);

        $validated = $request->validate([
            'private_key_id' => 'required|exists:private_keys,id',
            'is_primary' => 'boolean',
            'purpose' => 'nullable|string|max:255',
        ]);

        // If this is marked as primary, remove primary flag from other keys
        if ($validated['is_primary'] ?? false) {
            $server->privateKeys()->updateExistingPivot(
                $server->privateKeys->pluck('id'),
                ['is_primary' => false]
            );
        }

        // Attach the key
        $server->privateKeys()->syncWithoutDetaching([
            $validated['private_key_id'] => [
                'is_primary' => $validated['is_primary'] ?? false,
                'purpose' => $validated['purpose'] ?? 'default',
            ],
        ]);

        return response()->json([
            'message' => 'SSH key attached to server successfully',
        ]);
    }

    /**
     * Detach an SSH key from a server
     */
    public function detachKey(string $serverId, string $keyId)
    {
        $server = Server::findOrFail($serverId);
        $server->privateKeys()->detach($keyId);

        return response()->json([
            'message' => 'SSH key detached from server successfully',
        ]);
    }

    /**
     * Test SSH connection to a server
     */
    public function testConnection(string $id)
    {
        $server = Server::with('privateKeys')->findOrFail($id);

        if (!$server->ssh_host) {
            return response()->json([
                'success' => false,
                'message' => 'SSH host not configured',
            ], 400);
        }

        $primaryKey = $server->primaryPrivateKey();
        if (!$primaryKey) {
            return response()->json([
                'success' => false,
                'message' => 'No primary SSH key configured',
            ], 400);
        }

        // TODO: Implement actual SSH connection test
        // For now, return a placeholder response
        return response()->json([
            'success' => true,
            'message' => 'SSH connection test not yet implemented',
            'note' => 'This will use phpseclib or similar to test the connection',
        ]);
    }
}
