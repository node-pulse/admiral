<?php

namespace App\Http\Controllers;

use App\Models\SshSession;
use Illuminate\Http\Request;
use Inertia\Inertia;

class SshSessionsController extends Controller
{
    /**
     * Display SSH sessions page
     */
    public function page()
    {
        return Inertia::render('ssh-sessions');
    }

    /**
     * List all SSH sessions with filtering
     */
    public function index(Request $request)
    {
        $query = SshSession::query()
            ->with(['server' => function ($query) {
                $query->select('id', 'hostname', 'name');
            }])
            ->orderBy('started_at', 'desc');

        // Filter by server
        if ($request->has('server_id')) {
            $query->where('server_id', $request->input('server_id'));
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        // Filter by date range
        if ($request->has('start_date')) {
            $query->where('started_at', '>=', $request->input('start_date'));
        }
        if ($request->has('end_date')) {
            $query->where('started_at', '<=', $request->input('end_date'));
        }

        // Search filter (username, IP, session ID)
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('session_id', 'ilike', "%{$search}%")
                    ->orWhere('ssh_username', 'ilike', "%{$search}%")
                    ->orWhere('ip_address', 'ilike', "%{$search}%");
            });
        }

        $perPage = $request->input('per_page', 20);
        $sessions = $query->paginate($perPage);

        return response()->json([
            'ssh_sessions' => $sessions->through(function ($session) {
                return [
                    'id' => $session->id,
                    'session_id' => $session->session_id,
                    'server_id' => $session->server_id,
                    'server' => $session->server ? [
                        'id' => $session->server->id,
                        'hostname' => $session->server->hostname,
                        'name' => $session->server->name,
                        'display_name' => $session->server->name ?: $session->server->hostname,
                    ] : null,
                    'user_id' => $session->user_id,
                    'better_auth_id' => $session->better_auth_id,
                    'started_at' => $session->started_at->toIso8601String(),
                    'ended_at' => $session->ended_at?->toIso8601String(),
                    'duration_seconds' => $session->duration_seconds,
                    'duration_formatted' => $session->duration_seconds !== null ? $this->formatDuration($session->duration_seconds) : null,
                    'ip_address' => $session->ip_address,
                    'user_agent' => $session->user_agent,
                    'status' => $session->status,
                    'disconnect_reason' => $session->disconnect_reason,
                    'auth_method' => $session->auth_method,
                    'ssh_username' => $session->ssh_username,
                    'ssh_host' => $session->ssh_host,
                    'ssh_port' => $session->ssh_port,
                    'host_key_fingerprint' => $session->host_key_fingerprint,
                ];
            }),
            'meta' => [
                'current_page' => $sessions->currentPage(),
                'per_page' => $sessions->perPage(),
                'total' => $sessions->total(),
                'last_page' => $sessions->lastPage(),
            ],
        ]);
    }

    /**
     * Get a single SSH session details
     */
    public function show(string $id)
    {
        $session = SshSession::with('server')->findOrFail($id);

        return response()->json([
            'ssh_session' => [
                'id' => $session->id,
                'session_id' => $session->session_id,
                'server_id' => $session->server_id,
                'server' => $session->server ? [
                    'id' => $session->server->id,
                    'hostname' => $session->server->hostname,
                    'name' => $session->server->name,
                    'display_name' => $session->server->name ?: $session->server->hostname,
                ] : null,
                'user_id' => $session->user_id,
                'better_auth_id' => $session->better_auth_id,
                'started_at' => $session->started_at->toIso8601String(),
                'ended_at' => $session->ended_at?->toIso8601String(),
                'duration_seconds' => $session->duration_seconds,
                'duration_formatted' => $session->duration_seconds ? $this->formatDuration($session->duration_seconds) : null,
                'ip_address' => $session->ip_address,
                'user_agent' => $session->user_agent,
                'status' => $session->status,
                'disconnect_reason' => $session->disconnect_reason,
                'auth_method' => $session->auth_method,
                'ssh_username' => $session->ssh_username,
                'ssh_host' => $session->ssh_host,
                'ssh_port' => $session->ssh_port,
                'host_key_fingerprint' => $session->host_key_fingerprint,
                'created_at' => $session->created_at->toIso8601String(),
                'updated_at' => $session->updated_at->toIso8601String(),
            ],
        ]);
    }

    /**
     * Terminate an active SSH session
     */
    public function terminate(string $id)
    {
        $session = SshSession::findOrFail($id);

        if ($session->status !== 'active') {
            return response()->json([
                'message' => 'Session is not active',
                'status' => $session->status,
            ], 400);
        }

        // TODO: Implement actual session termination via WebSocket
        // For now, just mark as terminated in database
        $session->update([
            'status' => 'terminated',
            'disconnect_reason' => 'Terminated by administrator',
            'ended_at' => now(),
            'duration_seconds' => now()->diffInSeconds($session->started_at),
        ]);

        return response()->json([
            'message' => 'Session terminated successfully',
            'ssh_session' => [
                'id' => $session->id,
                'status' => $session->status,
            ],
        ]);
    }

    /**
     * Get SSH sessions for a specific server
     */
    public function serverSessions(string $serverId, Request $request)
    {
        $query = SshSession::query()
            ->where('server_id', $serverId)
            ->orderBy('started_at', 'desc');

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        $perPage = $request->input('per_page', 10);
        $sessions = $query->paginate($perPage);

        return response()->json([
            'ssh_sessions' => $sessions->through(function ($session) {
                return [
                    'id' => $session->id,
                    'session_id' => $session->session_id,
                    'started_at' => $session->started_at->toIso8601String(),
                    'ended_at' => $session->ended_at?->toIso8601String(),
                    'duration_seconds' => $session->duration_seconds,
                    'duration_formatted' => $session->duration_seconds !== null ? $this->formatDuration($session->duration_seconds) : null,
                    'ip_address' => $session->ip_address,
                    'status' => $session->status,
                    'auth_method' => $session->auth_method,
                    'ssh_username' => $session->ssh_username,
                ];
            }),
            'meta' => [
                'current_page' => $sessions->currentPage(),
                'per_page' => $sessions->perPage(),
                'total' => $sessions->total(),
                'last_page' => $sessions->lastPage(),
            ],
        ]);
    }

    /**
     * Format duration in seconds to human-readable format
     */
    private function formatDuration(int $seconds): string
    {
        if ($seconds < 60) {
            return "{$seconds}s";
        } elseif ($seconds < 3600) {
            $minutes = floor($seconds / 60);
            $secs = $seconds % 60;
            return "{$minutes}m {$secs}s";
        } else {
            $hours = floor($seconds / 3600);
            $minutes = floor(($seconds % 3600) / 60);
            return "{$hours}h {$minutes}m";
        }
    }
}
