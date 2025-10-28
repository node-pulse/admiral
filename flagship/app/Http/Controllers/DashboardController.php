<?php

namespace App\Http\Controllers;

use App\Models\MetricSample;
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

        // Get servers to map server_id (text) to display names
        $servers = Server::whereIn('id', $serverIds)->get()->keyBy('id');
        $serverIdTextMap = $servers->mapWithKeys(fn($s) => [$s->id => $s->server_id])->toArray();

        $groupedMetrics = collect();

        foreach ($serverIds as $serverId) {
            $server = $servers[$serverId];
            $serverIdText = $serverIdTextMap[$serverId];

            // Collect all metrics for different types
            $allMetrics = [];

            foreach ($metricTypes as $metricType) {
                switch ($metricType) {
                    case 'cpu':
                        $allMetrics['cpu'] = $this->getCpuMetrics($serverIdText, $startTime);
                        break;

                    case 'memory':
                        $allMetrics['memory'] = $this->getMemoryMetrics($serverIdText, $startTime);
                        break;

                    case 'disk':
                        $allMetrics['disk'] = $this->getDiskMetrics($serverIdText, $startTime);
                        break;

                    case 'network':
                        $allMetrics['network'] = $this->getNetworkMetrics($serverIdText, $startTime);
                        break;
                }
            }

            // Merge all metrics by timestamp into a single time series
            $timestampMap = [];

            foreach ($allMetrics as $metricType => $metrics) {
                foreach ($metrics as $point) {
                    $timestamp = $point['timestamp'];

                    if (!isset($timestampMap[$timestamp])) {
                        $timestampMap[$timestamp] = ['timestamp' => $timestamp];
                    }

                    // Merge this metric's data into the timestamp entry
                    foreach ($point as $key => $value) {
                        if ($key !== 'timestamp') {
                            $timestampMap[$timestamp][$key] = $value;
                        }
                    }
                }
            }

            // Convert to array and sort by timestamp (most recent first)
            $mergedDataPoints = collect($timestampMap)
                ->sortByDesc('timestamp')
                ->take(1000) // Limit to 1000 points
                ->values();

            $groupedMetrics->push([
                'server_id' => $serverId,
                'hostname' => $server->hostname,
                'display_name' => $server->name ?: $server->hostname,
                'data_points' => $mergedDataPoints,
            ]);
        }

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
     * Calculate CPU usage from Prometheus node_cpu_seconds_total counter
     */
    private function getCpuMetrics(string $serverIdText, $startTime)
    {
        // Get node_cpu_seconds_total for all CPUs in idle mode
        $cpuMetrics = MetricSample::where('server_id', $serverIdText)
            ->where('metric_name', 'node_cpu_seconds_total')
            ->where('timestamp', '>=', $startTime)
            ->whereRaw("labels->>'mode' = ?", ['idle'])
            ->orderBy('timestamp')
            ->get();

        // Group by timestamp (agents now send aligned timestamps, use ISO8601 for exact matching)
        $grouped = $cpuMetrics->groupBy(fn($m) => $m->timestamp->toIso8601String());

        $dataPoints = collect();
        $previousTimestamp = null;
        $previousIdleTotal = null;

        foreach ($grouped as $timestamp => $samples) {
            $currentIdleTotal = $samples->sum('value');
            $cpuCount = $samples->count();

            if ($previousIdleTotal !== null && $previousTimestamp !== null) {
                // Parse ISO8601 timestamps for precise time difference calculation
                $timeDiff = strtotime($timestamp) - strtotime($previousTimestamp);
                $idleDiff = $currentIdleTotal - $previousIdleTotal;

                if ($timeDiff > 0) {
                    // Calculate usage: 100 - (idle_diff / (time_diff * cpu_count)) * 100
                    $idlePercent = ($idleDiff / ($timeDiff * $cpuCount)) * 100;
                    $usagePercent = max(0, min(100, 100 - $idlePercent));

                    $dataPoints->push([
                        'timestamp' => $samples->first()->timestamp->toIso8601String(),
                        'cpu_usage_percent' => round($usagePercent, 2),
                    ]);
                }
            }

            $previousTimestamp = $timestamp;
            $previousIdleTotal = $currentIdleTotal;
        }

        return $dataPoints;
    }

    /**
     * Calculate memory usage from Prometheus node_memory_* gauges
     */
    private function getMemoryMetrics(string $serverIdText, $startTime)
    {
        // Get memory total and available metrics
        $memoryMetrics = MetricSample::where('server_id', $serverIdText)
            ->whereIn('metric_name', ['node_memory_MemTotal_bytes', 'node_memory_MemAvailable_bytes'])
            ->where('timestamp', '>=', $startTime)
            ->orderBy('timestamp')
            ->get();

        // Group by timestamp (agents now send aligned timestamps, use ISO8601 for exact matching)
        $grouped = $memoryMetrics->groupBy(fn($m) => $m->timestamp->toIso8601String());

        return $grouped->map(function ($samples) {
            $total = $samples->firstWhere('metric_name', 'node_memory_MemTotal_bytes')?->value;
            $available = $samples->firstWhere('metric_name', 'node_memory_MemAvailable_bytes')?->value;

            if ($total && $available !== null) {
                $used = $total - $available;
                $usagePercent = ($used / $total) * 100;

                return [
                    'timestamp' => $samples->first()->timestamp->toIso8601String(),
                    'memory_usage_percent' => round($usagePercent, 2),
                    'memory_used_mb' => round($used / 1024 / 1024, 2),
                    'memory_total_mb' => round($total / 1024 / 1024, 2),
                ];
            }

            return null;
        })->filter()->values();
    }

    /**
     * Calculate disk usage from Prometheus node_filesystem_* gauges
     */
    private function getDiskMetrics(string $serverIdText, $startTime)
    {
        // Get filesystem metrics for root mountpoint only (or primary filesystem)
        // Exclude tmpfs, devtmpfs, and other virtual filesystems
        $diskMetrics = MetricSample::where('server_id', $serverIdText)
            ->whereIn('metric_name', ['node_filesystem_size_bytes', 'node_filesystem_avail_bytes'])
            ->where('timestamp', '>=', $startTime)
            ->whereRaw("labels->>'mountpoint' = ?", ['/']) // Root filesystem only
            ->whereRaw("labels->>'fstype' NOT IN ('tmpfs', 'devtmpfs', 'overlay', 'squashfs')")
            ->orderBy('timestamp')
            ->get();

        // Group by timestamp (agents now send aligned timestamps, use ISO8601 for exact matching)
        $grouped = $diskMetrics->groupBy(fn($m) => $m->timestamp->toIso8601String());

        return $grouped->map(function ($samples) {
            $total = $samples->firstWhere('metric_name', 'node_filesystem_size_bytes')?->value;
            $available = $samples->firstWhere('metric_name', 'node_filesystem_avail_bytes')?->value;

            if ($total && $available !== null) {
                $used = $total - $available;
                $usagePercent = ($used / $total) * 100;

                return [
                    'timestamp' => $samples->first()->timestamp->toIso8601String(),
                    'disk_usage_percent' => round($usagePercent, 2),
                    'disk_used_gb' => round($used / 1024 / 1024 / 1024, 2),
                    'disk_total_gb' => round($total / 1024 / 1024 / 1024, 2),
                ];
            }

            return null;
        })->filter()->values();
    }

    /**
     * Calculate network throughput from Prometheus node_network_* counters
     */
    private function getNetworkMetrics(string $serverIdText, $startTime)
    {
        // Get network metrics for main interfaces (exclude loopback, docker, etc.)
        $networkMetrics = MetricSample::where('server_id', $serverIdText)
            ->whereIn('metric_name', ['node_network_receive_bytes_total', 'node_network_transmit_bytes_total'])
            ->where('timestamp', '>=', $startTime)
            ->whereRaw("labels->>'device' NOT IN ('lo', 'docker0', 'veth0', 'virbr0')")
            ->whereRaw("labels->>'device' NOT LIKE 'veth%'")
            ->orderBy('timestamp')
            ->get();

        // Group by timestamp and device (agents now send aligned timestamps, use ISO8601 for exact matching)
        $grouped = $networkMetrics
            ->groupBy(fn($m) => $m->timestamp->toIso8601String() . '|' . ($m->labels['device'] ?? 'unknown'));

        $dataPoints = collect();
        $previous = [];

        foreach ($grouped as $key => $samples) {
            [$timestamp, $device] = explode('|', $key);

            $rx = $samples->firstWhere('metric_name', 'node_network_receive_bytes_total')?->value;
            $tx = $samples->firstWhere('metric_name', 'node_network_transmit_bytes_total')?->value;

            if ($rx !== null && $tx !== null) {
                $prevKey = $device;

                if (isset($previous[$prevKey])) {
                    $rxDiff = $rx - $previous[$prevKey]['rx'];
                    $txDiff = $tx - $previous[$prevKey]['tx'];
                    $timeDiff = strtotime($timestamp) - strtotime($previous[$prevKey]['timestamp']);

                    if ($timeDiff > 0) {
                        // Calculate bytes per second, then convert to MB/s
                        $downloadBps = $rxDiff / $timeDiff;
                        $uploadBps = $txDiff / $timeDiff;

                        $dataPoints->push([
                            'timestamp' => $samples->first()->timestamp->toIso8601String(),
                            'network_download_bytes' => round($downloadBps, 2),
                            'network_upload_bytes' => round($uploadBps, 2),
                        ]);
                    }
                }

                $previous[$prevKey] = [
                    'timestamp' => $timestamp,
                    'rx' => $rx,
                    'tx' => $tx,
                ];
            }
        }

        return $dataPoints;
    }
}
