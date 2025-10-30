<?php

namespace App\Http\Controllers;

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
     * Get metrics data for specific servers (Prometheus format)
     */
    public function metrics(Request $request)
    {
        $totalStart = microtime(true);

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

        \Log::info('METRICS_API_START', ['server_count' => count($serverIds), 'metric_types' => $metricTypes]);

        // Get servers to map server_id (text) to display names
        $servers = Server::whereIn('id', $serverIds)->get()->keyBy('id');
        $serverIdTextMap = $servers->mapWithKeys(fn($s) => [$s->id => $s->server_id])->toArray();
        $serverIdToUuidMap = $servers->mapWithKeys(fn($s) => [$s->server_id => $s->id])->toArray();

        // Fetch metrics for ALL servers in a SINGLE query per metric type (instead of N queries)
        $allServerMetrics = [];
        foreach ($metricTypes as $metricType) {
            $serverIdTexts = array_values($serverIdTextMap);
            $metricStart = microtime(true);

            switch ($metricType) {
                case 'cpu':
                    $allServerMetrics['cpu'] = $this->getCpuMetricsBatch($serverIdTexts, $startTime);
                    break;

                case 'memory':
                    $allServerMetrics['memory'] = $this->getMemoryMetricsBatch($serverIdTexts, $startTime);
                    break;

                case 'disk':
                    $allServerMetrics['disk'] = $this->getDiskMetricsBatch($serverIdTexts, $startTime);
                    break;

                case 'network':
                    $allServerMetrics['network'] = $this->getNetworkMetricsBatch($serverIdTexts, $startTime);
                    break;
            }

            \Log::info('METRICS_QUERY_' . strtoupper($metricType), ['duration_ms' => round((microtime(true) - $metricStart) * 1000, 2)]);
        }

        // First pass: collect all timestamps from all servers to create unified timeline
        $allTimestamps = [];
        $serverDataByTimestamp = [];

        foreach ($serverIds as $serverId) {
            $serverIdText = $serverIdTextMap[$serverId];
            $serverDataByTimestamp[$serverId] = [];

            foreach ($allServerMetrics as $metricType => $metricsByServer) {
                if (isset($metricsByServer[$serverIdText])) {
                    foreach ($metricsByServer[$serverIdText] as $point) {
                        $timestamp = $point['timestamp'];
                        $allTimestamps[$timestamp] = true;

                        if (!isset($serverDataByTimestamp[$serverId][$timestamp])) {
                            $serverDataByTimestamp[$serverId][$timestamp] = ['timestamp' => $timestamp];
                        }

                        // Merge this metric's data
                        foreach ($point as $key => $value) {
                            if ($key !== 'timestamp') {
                                $serverDataByTimestamp[$serverId][$timestamp][$key] = $value;
                            }
                        }
                    }
                }
            }
        }

        // Sort all unique timestamps
        $sortedTimestamps = collect(array_keys($allTimestamps))
            ->sort()
            ->reverse()
            ->take(1000)
            ->values();

        // Second pass: fill in data for each server using unified timeline
        $groupedMetrics = collect();
        foreach ($serverIds as $serverId) {
            $server = $servers[$serverId];
            $dataPoints = [];

            foreach ($sortedTimestamps as $timestamp) {
                if (isset($serverDataByTimestamp[$serverId][$timestamp])) {
                    // We have data for this timestamp
                    $dataPoints[] = $serverDataByTimestamp[$serverId][$timestamp];
                } else {
                    // Missing data point - add null entry to keep timeline aligned
                    $dataPoints[] = ['timestamp' => $timestamp];
                }
            }

            $groupedMetrics->push([
                'server_id' => $serverId,
                'hostname' => $server->hostname,
                'display_name' => $server->name ?: $server->hostname,
                'data_points' => $dataPoints,
            ]);
        }

        \Log::info('METRICS_API_END', ['total_duration_ms' => round((microtime(true) - $totalStart) * 1000, 2)]);

        return response()->json([
            'metrics' => $groupedMetrics,
            'time_range' => [
                'start' => $startTime->toIso8601String(),
                'end' => now()->toIso8601String(),
                'hours' => $hours,
            ],
        ]);
    }


    /**
     * Get CPU metrics for multiple servers in a single query
     * Uses LAG() window function to calculate CPU usage from counter deltas
     * Returns: ['server_id_text' => [datapoints...]]
     */
    private function getCpuMetricsBatch(array $serverIdTexts, $startTime)
    {
        if (empty($serverIdTexts)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($serverIdTexts), '?'));
        $params = array_merge($serverIdTexts, [$startTime->toDateTimeString()]);

        // With simplified schema: calculate CPU usage from raw counter values
        // Formula: 100 - (idle_seconds / total_seconds * 100)
        $sql = "
            WITH with_previous AS (
                SELECT
                    server_id,
                    timestamp,
                    cpu_idle_seconds,
                    cpu_user_seconds,
                    cpu_system_seconds,
                    cpu_iowait_seconds,
                    cpu_steal_seconds,
                    cpu_cores,
                    LAG(timestamp) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_ts,
                    LAG(cpu_idle_seconds) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_idle,
                    LAG(cpu_user_seconds) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_user,
                    LAG(cpu_system_seconds) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_system,
                    LAG(cpu_iowait_seconds) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_iowait,
                    LAG(cpu_steal_seconds) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_steal
                FROM admiral.metrics
                WHERE server_id IN ($placeholders)
                    AND timestamp >= ?
                ORDER BY server_id, timestamp
            )
            SELECT
                server_id,
                timestamp,
                CASE
                    WHEN prev_idle IS NOT NULL THEN
                        GREATEST(0, LEAST(100,
                            100 - ((cpu_idle_seconds - prev_idle) /
                                  ((cpu_idle_seconds - prev_idle) +
                                   (cpu_user_seconds - prev_user) +
                                   (cpu_system_seconds - prev_system) +
                                   (cpu_iowait_seconds - prev_iowait) +
                                   (cpu_steal_seconds - prev_steal)) * 100)
                        ))
                    ELSE NULL
                END as cpu_usage_percent
            FROM with_previous
            WHERE prev_idle IS NOT NULL
            ORDER BY server_id, timestamp DESC
        ";

        $results = \DB::select($sql, $params);

        // Group by server_id
        $resultsByServer = [];
        foreach ($results as $row) {
            if (!isset($resultsByServer[$row->server_id])) {
                $resultsByServer[$row->server_id] = [];
            }

            if ($row->cpu_usage_percent !== null) {
                $resultsByServer[$row->server_id][] = [
                    'timestamp' => $row->timestamp,
                    'cpu_usage_percent' => round((float)$row->cpu_usage_percent, 2),
                ];
            }
        }

        return $resultsByServer;
    }

    /**
     * Get memory metrics for multiple servers in a single query
     * Calculates memory usage from raw bytes (total - available)
     * Returns: ['server_id_text' => [datapoints...]]
     */
    private function getMemoryMetricsBatch(array $serverIdTexts, $startTime)
    {
        if (empty($serverIdTexts)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($serverIdTexts), '?'));
        $params = array_merge($serverIdTexts, [$startTime->toDateTimeString()]);

        $sql = "
            SELECT
                server_id,
                timestamp,
                memory_total_bytes,
                memory_available_bytes
            FROM admiral.metrics
            WHERE server_id IN ($placeholders)
                AND timestamp >= ?
                AND memory_total_bytes > 0
            ORDER BY server_id, timestamp DESC
        ";

        $results = \DB::select($sql, $params);

        $resultsByServer = [];
        foreach ($results as $row) {
            if (!isset($resultsByServer[$row->server_id])) {
                $resultsByServer[$row->server_id] = [];
            }

            $used = $row->memory_total_bytes - $row->memory_available_bytes;
            $usagePercent = ($used / $row->memory_total_bytes) * 100;

            $resultsByServer[$row->server_id][] = [
                'timestamp' => $row->timestamp,
                'memory_usage_percent' => round($usagePercent, 2),
                'memory_used_mb' => round($used / 1024 / 1024, 2),
                'memory_total_mb' => round($row->memory_total_bytes / 1024 / 1024, 2),
            ];
        }

        return $resultsByServer;
    }

    /**
     * Get disk metrics for multiple servers in a single query
     * Calculates disk usage from raw bytes (total - available)
     * Returns: ['server_id_text' => [datapoints...]]
     */
    private function getDiskMetricsBatch(array $serverIdTexts, $startTime)
    {
        if (empty($serverIdTexts)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($serverIdTexts), '?'));
        $params = array_merge($serverIdTexts, [$startTime->toDateTimeString()]);

        $sql = "
            SELECT
                server_id,
                timestamp,
                disk_total_bytes,
                disk_available_bytes
            FROM admiral.metrics
            WHERE server_id IN ($placeholders)
                AND timestamp >= ?
                AND disk_total_bytes > 0
            ORDER BY server_id, timestamp DESC
        ";

        $results = \DB::select($sql, $params);

        $resultsByServer = [];
        foreach ($results as $row) {
            if (!isset($resultsByServer[$row->server_id])) {
                $resultsByServer[$row->server_id] = [];
            }

            $used = $row->disk_total_bytes - $row->disk_available_bytes;
            $usagePercent = ($used / $row->disk_total_bytes) * 100;

            $resultsByServer[$row->server_id][] = [
                'timestamp' => $row->timestamp,
                'disk_usage_percent' => round($usagePercent, 2),
                'disk_used_gb' => round($used / 1024 / 1024 / 1024, 2),
                'disk_total_gb' => round($row->disk_total_bytes / 1024 / 1024 / 1024, 2),
            ];
        }

        return $resultsByServer;
    }

    /**
     * Get network metrics for multiple servers in a single query
     * Uses LAG() window function to calculate throughput from counter deltas
     * Returns: ['server_id_text' => [datapoints...]]
     */
    private function getNetworkMetricsBatch(array $serverIdTexts, $startTime)
    {
        if (empty($serverIdTexts)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($serverIdTexts), '?'));
        $params = array_merge($serverIdTexts, [$startTime->toDateTimeString()]);

        $sql = "
            WITH with_previous AS (
                SELECT
                    server_id,
                    timestamp,
                    network_receive_bytes_total,
                    network_transmit_bytes_total,
                    LAG(timestamp) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_ts,
                    LAG(network_receive_bytes_total) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_rx,
                    LAG(network_transmit_bytes_total) OVER (PARTITION BY server_id ORDER BY timestamp) as prev_tx
                FROM admiral.metrics
                WHERE server_id IN ($placeholders)
                    AND timestamp >= ?
                ORDER BY server_id, timestamp
            )
            SELECT
                server_id,
                timestamp,
                CASE
                    WHEN prev_rx IS NOT NULL AND prev_tx IS NOT NULL AND prev_ts IS NOT NULL THEN
                        (network_receive_bytes_total - prev_rx) / GREATEST(1, EXTRACT(EPOCH FROM (timestamp - prev_ts)))
                    ELSE NULL
                END as download_bps,
                CASE
                    WHEN prev_rx IS NOT NULL AND prev_tx IS NOT NULL AND prev_ts IS NOT NULL THEN
                        (network_transmit_bytes_total - prev_tx) / GREATEST(1, EXTRACT(EPOCH FROM (timestamp - prev_ts)))
                    ELSE NULL
                END as upload_bps
            FROM with_previous
            WHERE prev_rx IS NOT NULL AND prev_tx IS NOT NULL
            ORDER BY server_id, timestamp DESC
        ";

        $results = \DB::select($sql, $params);

        $resultsByServer = [];
        foreach ($results as $row) {
            if (!isset($resultsByServer[$row->server_id])) {
                $resultsByServer[$row->server_id] = [];
            }

            if ($row->download_bps !== null && $row->upload_bps !== null) {
                $resultsByServer[$row->server_id][] = [
                    'timestamp' => $row->timestamp,
                    'network_download_bytes' => round((float)$row->download_bps, 2),
                    'network_upload_bytes' => round((float)$row->upload_bps, 2),
                ];
            }
        }

        return $resultsByServer;
    }
}
