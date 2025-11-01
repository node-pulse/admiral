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

        // Sort all unique timestamps (no artificial limit - already filtered by timestamp in queries)
        $sortedTimestamps = collect(array_keys($allTimestamps))
            ->sort()
            ->reverse()
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
     * Get CPU metrics - SIMPLE CALCULATION
     * Calculate percentage directly in SQL using LAG for deltas
     */
    private function getCpuMetricsBatch(array $serverIdTexts, $startTime)
    {
        if (empty($serverIdTexts)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($serverIdTexts), '?'));
        $params = array_merge($serverIdTexts, [$startTime->toDateTimeString()]);

        // Aggregate to 1-minute intervals for smoother charts
        $sql = "
            WITH minute_buckets AS (
                SELECT
                    server_id,
                    date_trunc('minute', timestamp) as minute,
                    AVG(cpu_cores) as cpu_cores,
                    MAX(cpu_user_seconds) as cpu_user_seconds,
                    MAX(cpu_system_seconds) as cpu_system_seconds,
                    MAX(cpu_iowait_seconds) as cpu_iowait_seconds,
                    MAX(cpu_steal_seconds) as cpu_steal_seconds
                FROM admiral.metrics
                WHERE server_id IN ($placeholders)
                    AND timestamp >= ?
                GROUP BY server_id, date_trunc('minute', timestamp)
            ),
            deltas AS (
                SELECT
                    server_id,
                    minute as timestamp,
                    cpu_cores,
                    cpu_user_seconds - LAG(cpu_user_seconds) OVER (PARTITION BY server_id ORDER BY minute) as user_delta,
                    cpu_system_seconds - LAG(cpu_system_seconds) OVER (PARTITION BY server_id ORDER BY minute) as system_delta,
                    cpu_iowait_seconds - LAG(cpu_iowait_seconds) OVER (PARTITION BY server_id ORDER BY minute) as iowait_delta,
                    cpu_steal_seconds - LAG(cpu_steal_seconds) OVER (PARTITION BY server_id ORDER BY minute) as steal_delta,
                    EXTRACT(EPOCH FROM (minute - LAG(minute) OVER (PARTITION BY server_id ORDER BY minute))) as time_delta
                FROM minute_buckets
            )
            SELECT
                server_id,
                timestamp,
                CASE
                    -- Only calculate if time_delta is reasonable (30-120 seconds for 1-min buckets)
                    WHEN time_delta BETWEEN 30 AND 120
                        AND cpu_cores > 0
                        AND user_delta >= 0 AND system_delta >= 0 AND iowait_delta >= 0 AND steal_delta >= 0
                    THEN
                        LEAST(100, (user_delta + system_delta + iowait_delta + steal_delta) / cpu_cores / time_delta * 100)
                    ELSE NULL
                END as cpu_usage_percent
            FROM deltas
            WHERE time_delta IS NOT NULL
            ORDER BY server_id, timestamp DESC
        ";

        $results = \DB::select($sql, $params);

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
            $available = $row->memory_available_bytes;

            $resultsByServer[$row->server_id][] = [
                'timestamp' => $row->timestamp,
                'memory_used_mb' => round($used / 1024 / 1024, 2),
                'memory_available_mb' => round($available / 1024 / 1024, 2),
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
            $available = $row->disk_available_bytes;

            $resultsByServer[$row->server_id][] = [
                'timestamp' => $row->timestamp,
                'disk_used_gb' => round($used / 1024 / 1024 / 1024, 2),
                'disk_available_gb' => round($available / 1024 / 1024 / 1024, 2),
                'disk_total_gb' => round($row->disk_total_bytes / 1024 / 1024 / 1024, 2),
            ];
        }

        return $resultsByServer;
    }

    /**
     * Get network metrics - SIMPLE CALCULATION
     * Calculate Mbps directly in SQL using LAG for deltas
     */
    private function getNetworkMetricsBatch(array $serverIdTexts, $startTime)
    {
        if (empty($serverIdTexts)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($serverIdTexts), '?'));
        $params = array_merge($serverIdTexts, [$startTime->toDateTimeString()]);

        // Aggregate to 1-minute intervals for smoother charts
        $sql = "
            WITH minute_buckets AS (
                SELECT
                    server_id,
                    date_trunc('minute', timestamp) as minute,
                    MAX(network_receive_bytes_total) as network_receive_bytes_total,
                    MAX(network_transmit_bytes_total) as network_transmit_bytes_total
                FROM admiral.metrics
                WHERE server_id IN ($placeholders)
                    AND timestamp >= ?
                GROUP BY server_id, date_trunc('minute', timestamp)
            ),
            deltas AS (
                SELECT
                    server_id,
                    minute as timestamp,
                    network_receive_bytes_total - LAG(network_receive_bytes_total) OVER (PARTITION BY server_id ORDER BY minute) as rx_delta,
                    network_transmit_bytes_total - LAG(network_transmit_bytes_total) OVER (PARTITION BY server_id ORDER BY minute) as tx_delta,
                    EXTRACT(EPOCH FROM (minute - LAG(minute) OVER (PARTITION BY server_id ORDER BY minute))) as time_delta
                FROM minute_buckets
            )
            SELECT
                server_id,
                timestamp,
                CASE
                    -- Only calculate if time_delta is reasonable (30-120 seconds for 1-min buckets)
                    WHEN time_delta BETWEEN 30 AND 120 AND rx_delta >= 0
                    THEN (rx_delta / time_delta * 8 / 1024 / 1024)
                    ELSE NULL
                END as network_download_mbps,
                CASE
                    -- Only calculate if time_delta is reasonable (30-120 seconds for 1-min buckets)
                    WHEN time_delta BETWEEN 30 AND 120 AND tx_delta >= 0
                    THEN (tx_delta / time_delta * 8 / 1024 / 1024)
                    ELSE NULL
                END as network_upload_mbps
            FROM deltas
            WHERE time_delta IS NOT NULL
            ORDER BY server_id, timestamp DESC
        ";

        $results = \DB::select($sql, $params);

        $resultsByServer = [];
        foreach ($results as $row) {
            if (!isset($resultsByServer[$row->server_id])) {
                $resultsByServer[$row->server_id] = [];
            }

            if ($row->network_download_mbps !== null && $row->network_upload_mbps !== null) {
                $resultsByServer[$row->server_id][] = [
                    'timestamp' => $row->timestamp,
                    'network_download_mbps' => round((float)$row->network_download_mbps, 2),
                    'network_upload_mbps' => round((float)$row->network_upload_mbps, 2),
                ];
            }
        }

        return $resultsByServer;
    }
}
