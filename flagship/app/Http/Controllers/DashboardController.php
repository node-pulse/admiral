<?php

namespace App\Http\Controllers;

use App\Models\Metric;
use App\Models\Server;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Get dashboard stats (server count, online/offline counts)
     */
    public function stats()
    {
        $totalServers = Server::count();
        $onlineServers = Server::online()->count();
        $offlineServers = $totalServers - $onlineServers;

        // Get recent alerts count
        $activeAlerts = DB::table('alerts')
            ->where('status', 'active')
            ->count();

        return response()->json([
            'total_servers' => $totalServers,
            'online_servers' => $onlineServers,
            'offline_servers' => $offlineServers,
            'active_alerts' => $activeAlerts,
        ]);
    }

    /**
     * Get list of servers that have metrics data
     */
    public function serversWithMetrics(Request $request)
    {
        $query = DB::table('metrics')
            ->select(
                'servers.id',
                'servers.server_id',
                'servers.hostname',
                'servers.name',
                'servers.status',
                'servers.last_seen_at',
                DB::raw('MAX(metrics.timestamp) as last_metric_at'),
                DB::raw('COUNT(metrics.id) as metric_count')
            )
            ->join('servers', 'metrics.server_id', '=', 'servers.id')
            ->groupBy(
                'servers.id',
                'servers.server_id',
                'servers.hostname',
                'servers.name',
                'servers.status',
                'servers.last_seen_at'
            )
            ->orderBy('servers.hostname');

        // Search filter
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('servers.hostname', 'ilike', "%{$search}%")
                    ->orWhere('servers.name', 'ilike', "%{$search}%")
                    ->orWhere('servers.server_id', 'ilike', "%{$search}%");
            });
        }

        // Time range filter (only show servers with recent metrics)
        if ($request->has('recent_hours')) {
            $hours = $request->input('recent_hours', 24);
            $query->having('last_metric_at', '>=', now()->subHours($hours));
        }

        // Limit results for performance
        $limit = $request->input('limit', 100);
        $servers = $query->limit($limit)->get();

        return response()->json([
            'servers' => $servers->map(function ($server) {
                $lastSeenAt = $server->last_seen_at ? \Carbon\Carbon::parse($server->last_seen_at) : null;
                $isOnline = $lastSeenAt && $lastSeenAt->greaterThan(now()->subMinutes(5));

                return [
                    'id' => $server->id,
                    'server_id' => $server->server_id,
                    'hostname' => $server->hostname,
                    'name' => $server->name,
                    'display_name' => $server->name ?: $server->hostname,
                    'status' => $server->status,
                    'is_online' => $isOnline,
                    'last_seen_at' => $lastSeenAt?->toIso8601String(),
                    'last_metric_at' => \Carbon\Carbon::parse($server->last_metric_at)->toIso8601String(),
                    'metric_count' => $server->metric_count,
                ];
            }),
            'total' => $servers->count(),
            'has_more' => $servers->count() >= $limit,
        ]);
    }

    /**
     * Get list of servers for dropdown/search
     */
    public function servers(Request $request)
    {
        $query = Server::query()
            ->orderBy('hostname');

        // Search filter
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('hostname', 'ilike', "%{$search}%")
                    ->orWhere('name', 'ilike', "%{$search}%")
                    ->orWhere('server_id', 'ilike', "%{$search}%");
            });
        }

        // Status filter
        if ($request->has('status')) {
            if ($request->input('status') === 'online') {
                $query->online();
            } elseif ($request->input('status') === 'offline') {
                $query->offline();
            }
        }

        // Limit results for performance
        $limit = $request->input('limit', 100);
        $servers = $query->limit($limit)->get();

        return response()->json([
            'data' => $servers->map(function ($server) {
                return [
                    'id' => $server->id,
                    'server_id' => $server->server_id,
                    'hostname' => $server->hostname,
                    'name' => $server->name,
                    'display_name' => $server->name ?: $server->hostname,
                    'ssh_host' => $server->ssh_host,
                    'ssh_username' => $server->ssh_username,
                    'distro' => $server->distro,
                    'architecture' => $server->architecture,
                    'agent_installed' => !is_null($server->last_seen_at),
                    'status' => $server->status,
                    'is_online' => $server->isOnline(),
                    'last_seen_at' => $server->last_seen_at?->toIso8601String(),
                ];
            }),
            'total' => $servers->count(),
            'has_more' => $servers->count() >= $limit,
        ]);
    }

    /**
     * Get metrics data for specific servers
     */
    public function metrics(Request $request)
    {
        $request->validate([
            'server_ids' => 'required|array',
            'server_ids.*' => 'uuid|exists:servers,id',
            'hours' => 'integer|min:1|max:168', // Max 7 days (168 hours)
            'metric_types' => 'array',
            'metric_types.*' => 'string|in:cpu,memory,disk,network',
        ]);

        $serverIds = $request->input('server_ids');
        $hours = $request->input('hours', 24);
        $metricTypes = $request->input('metric_types', ['cpu', 'memory', 'disk']);

        $startTime = now()->subHours($hours);

        // Build query for metrics
        $query = Metric::query()
            ->whereIn('server_id', $serverIds)
            ->where('timestamp', '>=', $startTime)
            ->orderBy('timestamp', 'desc');

        // Select only needed columns based on metric types
        $selectColumns = ['id', 'server_id', 'timestamp'];

        if (in_array('cpu', $metricTypes)) {
            $selectColumns[] = 'cpu_usage_percent';
        }
        if (in_array('memory', $metricTypes)) {
            $selectColumns[] = 'memory_usage_percent';
            $selectColumns[] = 'memory_used_mb';
            $selectColumns[] = 'memory_total_mb';
        }
        if (in_array('disk', $metricTypes)) {
            $selectColumns[] = 'disk_usage_percent';
            $selectColumns[] = 'disk_used_gb';
            $selectColumns[] = 'disk_total_gb';
        }
        if (in_array('network', $metricTypes)) {
            $selectColumns[] = 'network_upload_bytes';
            $selectColumns[] = 'network_download_bytes';
        }

        $query->select($selectColumns);

        // Limit results for performance (max 1000 data points per server)
        $maxPointsPerServer = 1000;
        $metrics = $query->limit($maxPointsPerServer * count($serverIds))->get();

        // Group by server
        $groupedMetrics = $metrics->groupBy('server_id')->map(function ($serverMetrics, $serverId) use ($metricTypes) {
            $server = Server::find($serverId);

            return [
                'server_id' => $serverId,
                'hostname' => $server->hostname,
                'display_name' => $server->name ?: $server->hostname,
                'data_points' => $serverMetrics->map(function ($metric) use ($metricTypes) {
                    $point = [
                        'timestamp' => $metric->timestamp->toIso8601String(),
                    ];

                    if (in_array('cpu', $metricTypes)) {
                        $point['cpu_usage_percent'] = $metric->cpu_usage_percent;
                    }
                    if (in_array('memory', $metricTypes)) {
                        $point['memory_usage_percent'] = $metric->memory_usage_percent;
                        $point['memory_used_mb'] = $metric->memory_used_mb;
                        $point['memory_total_mb'] = $metric->memory_total_mb;
                    }
                    if (in_array('disk', $metricTypes)) {
                        $point['disk_usage_percent'] = $metric->disk_usage_percent;
                        $point['disk_used_gb'] = $metric->disk_used_gb;
                        $point['disk_total_gb'] = $metric->disk_total_gb;
                    }
                    if (in_array('network', $metricTypes)) {
                        $point['network_upload_bytes'] = $metric->network_upload_bytes;
                        $point['network_download_bytes'] = $metric->network_download_bytes;
                    }

                    return $point;
                })->values(),
            ];
        })->values();

        return response()->json([
            'metrics' => $groupedMetrics,
            'time_range' => [
                'start' => $startTime->toIso8601String(),
                'end' => now()->toIso8601String(),
                'hours' => $hours,
            ],
        ]);
    }
}
