<?php

namespace App\Http\Controllers;

use App\Models\ProcessSnapshot;
use App\Models\Server;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProcessController extends Controller
{
    /**
     * Get top N processes by CPU or memory usage
     *
     * Endpoint: GET /api/processes/top
     *
     * Query Parameters:
     * - server_ids[]: array of server UUIDs (required)
     * - metric: 'cpu' or 'memory' (default: 'cpu')
     * - limit: integer, max 50 (default: 10)
     * - hours: integer, 1-168 (default: 1)
     *
     * Returns top processes aggregated across selected servers
     */
    public function top(Request $request)
    {
        $request->validate([
            'server_ids' => 'required|array',
            'server_ids.*' => 'uuid|exists:servers,id',
            'metric' => 'string|in:cpu,memory',
            'limit' => 'integer|min:1|max:50',
            'hours' => 'integer|min:1|max:168', // Max 7 days
        ]);

        $serverIds = $request->input('server_ids');
        $metric = $request->input('metric', 'cpu');
        $limit = $request->input('limit', 10);
        $hours = $request->input('hours', 1);

        // Get servers to map UUIDs to server_id (text)
        $servers = Server::whereIn('id', $serverIds)->get()->keyBy('id');
        $serverIdTexts = $servers->pluck('server_id')->toArray();

        if (empty($serverIdTexts)) {
            return response()->json([
                'metric' => $metric,
                'time_range_hours' => $hours,
                'processes' => [],
            ]);
        }

        $startTime = now()->subHours($hours);

        // Get top processes based on metric
        if ($metric === 'cpu') {
            $processes = $this->getTopProcessesByCPU($serverIdTexts, $startTime, $limit);
        } else {
            $processes = $this->getTopProcessesByMemory($serverIdTexts, $startTime, $limit);
        }

        return response()->json([
            'metric' => $metric,
            'time_range_hours' => $hours,
            'processes' => $processes,
        ]);
    }

    /**
     * Get top N processes by average CPU usage
     * Uses LAG() to calculate CPU percentage from counter deltas
     */
    private function getTopProcessesByCPU(array $serverIdTexts, $startTime, int $limit)
    {
        $placeholders = implode(',', array_fill(0, count($serverIdTexts), '?'));
        $params = array_merge($serverIdTexts, [$startTime->toDateTimeString(), $limit]);

        $sql = "
            WITH deltas AS (
                SELECT
                    ps.server_id,
                    s.hostname,
                    s.name as server_name,
                    ps.process_name,
                    ps.timestamp,
                    ps.cpu_seconds_total,
                    ps.memory_bytes,
                    ps.num_procs,
                    LAG(ps.cpu_seconds_total) OVER (
                        PARTITION BY ps.server_id, ps.process_name
                        ORDER BY ps.timestamp
                    ) as prev_cpu,
                    LAG(ps.timestamp) OVER (
                        PARTITION BY ps.server_id, ps.process_name
                        ORDER BY ps.timestamp
                    ) as prev_ts
                FROM admiral.process_snapshots ps
                INNER JOIN admiral.servers s ON s.server_id = ps.server_id
                WHERE ps.server_id IN ($placeholders)
                    AND ps.timestamp >= ?
            ),
            cpu_rates AS (
                SELECT
                    server_id,
                    hostname,
                    server_name,
                    process_name,
                    CASE
                        WHEN prev_cpu IS NOT NULL AND prev_ts IS NOT NULL THEN
                            ((cpu_seconds_total - prev_cpu) /
                             GREATEST(1, EXTRACT(EPOCH FROM (timestamp - prev_ts)))) * 100
                        ELSE NULL
                    END as cpu_percent,
                    memory_bytes,
                    num_procs
                FROM deltas
                WHERE prev_cpu IS NOT NULL
            )
            SELECT
                server_id,
                COALESCE(NULLIF(server_name, ''), NULLIF(hostname, ''), server_id) as server_display_name,
                process_name,
                ROUND(AVG(cpu_percent)::numeric, 2) as avg_cpu_percent,
                ROUND(AVG(memory_bytes / 1024.0 / 1024.0)::numeric, 2) as avg_memory_mb,
                ROUND(MAX(memory_bytes / 1024.0 / 1024.0)::numeric, 2) as peak_memory_mb,
                ROUND(AVG(num_procs)::numeric, 0) as avg_num_procs
            FROM cpu_rates
            WHERE cpu_percent IS NOT NULL
            GROUP BY server_id, server_name, hostname, process_name
            ORDER BY avg_cpu_percent DESC
            LIMIT ?
        ";

        $results = DB::select($sql, $params);

        return array_map(function ($row) {
            return [
                'server_id' => $row->server_id,
                'server_name' => $row->server_display_name,
                'name' => $row->process_name,
                'avg_cpu_percent' => (float) $row->avg_cpu_percent,
                'avg_memory_mb' => (float) $row->avg_memory_mb,
                'peak_memory_mb' => (float) $row->peak_memory_mb,
                'avg_num_procs' => (int) $row->avg_num_procs,
            ];
        }, $results);
    }

    /**
     * Get top N processes by average memory usage
     */
    private function getTopProcessesByMemory(array $serverIdTexts, $startTime, int $limit)
    {
        $placeholders = implode(',', array_fill(0, count($serverIdTexts), '?'));
        $params = array_merge($serverIdTexts, [$startTime->toDateTimeString(), $limit]);

        $sql = "
            WITH deltas AS (
                SELECT
                    ps.server_id,
                    s.hostname,
                    s.name as server_name,
                    ps.process_name,
                    ps.timestamp,
                    ps.cpu_seconds_total,
                    ps.memory_bytes,
                    ps.num_procs,
                    LAG(ps.cpu_seconds_total) OVER (
                        PARTITION BY ps.server_id, ps.process_name
                        ORDER BY ps.timestamp
                    ) as prev_cpu,
                    LAG(ps.timestamp) OVER (
                        PARTITION BY ps.server_id, ps.process_name
                        ORDER BY ps.timestamp
                    ) as prev_ts
                FROM admiral.process_snapshots ps
                INNER JOIN admiral.servers s ON s.server_id = ps.server_id
                WHERE ps.server_id IN ($placeholders)
                    AND ps.timestamp >= ?
            ),
            cpu_rates AS (
                SELECT
                    server_id,
                    hostname,
                    server_name,
                    process_name,
                    CASE
                        WHEN prev_cpu IS NOT NULL AND prev_ts IS NOT NULL THEN
                            ((cpu_seconds_total - prev_cpu) /
                             GREATEST(1, EXTRACT(EPOCH FROM (timestamp - prev_ts)))) * 100
                        ELSE NULL
                    END as cpu_percent,
                    memory_bytes,
                    num_procs
                FROM deltas
            )
            SELECT
                server_id,
                COALESCE(NULLIF(server_name, ''), NULLIF(hostname, ''), server_id) as server_display_name,
                process_name,
                ROUND(AVG(cpu_percent)::numeric, 2) as avg_cpu_percent,
                ROUND(AVG(memory_bytes / 1024.0 / 1024.0)::numeric, 2) as avg_memory_mb,
                ROUND(MAX(memory_bytes / 1024.0 / 1024.0)::numeric, 2) as peak_memory_mb,
                ROUND(AVG(num_procs)::numeric, 0) as avg_num_procs
            FROM cpu_rates
            GROUP BY server_id, server_name, hostname, process_name
            ORDER BY avg_memory_mb DESC
            LIMIT ?
        ";

        $results = DB::select($sql, $params);

        return array_map(function ($row) {
            return [
                'server_id' => $row->server_id,
                'server_name' => $row->server_display_name,
                'name' => $row->process_name,
                'avg_cpu_percent' => $row->avg_cpu_percent ? (float) $row->avg_cpu_percent : null,
                'avg_memory_mb' => (float) $row->avg_memory_mb,
                'peak_memory_mb' => (float) $row->peak_memory_mb,
                'avg_num_procs' => (int) $row->avg_num_procs,
            ];
        }, $results);
    }
}
