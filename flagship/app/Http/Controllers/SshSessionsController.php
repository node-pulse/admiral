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
        return Inertia::render('ssh-sessions', [
            'translations' => [
                'common' => __('common'),
                'nav' => __('nav'),
                'ssh_sessions' => __('ssh_sessions'),
            ],
        ]);
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

        // Filter by server (single or multiple)
        if ($request->has('server_id')) {
            $query->where('server_id', $request->input('server_id'));
        }

        // Filter by multiple servers
        if ($request->has('server_ids')) {
            $serverIds = $request->input('server_ids');
            if (is_array($serverIds) && count($serverIds) > 0) {
                $query->whereIn('server_id', $serverIds);
            }
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

        // Search filter (username, IP, session ID, SSH host)
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('session_id', 'ilike', "%{$search}%")
                    ->orWhere('ssh_username', 'ilike', "%{$search}%")
                    ->orWhere('ip_address', 'ilike', "%{$search}%")
                    ->orWhere('ssh_host', 'ilike', "%{$search}%");
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
        // For now, just mark as terminated in database (does not actually kill the connection)
        //
        // Advanced Feature - Full Implementation Requirements:
        // 1. Maintain registry of active WebSocket connections in submarines-sshws (session_id -> ws connection map)
        // 2. Add API endpoint: POST /v1/ssh/sessions/:session_id/terminate in submarines-sshws
        // 3. When terminate() is called from Flagship:
        //    - Update database (current implementation) ✓
        //    - Send HTTP POST to submarines-sshws terminate endpoint
        //    - submarines-sshws closes WebSocket + SSH connection
        //    - User sees "Connection terminated by administrator" message
        //
        // Access Control Considerations (Multi-tenancy):
        // - Add organization_id/team_id to ssh_sessions table
        // - Admins can only terminate sessions within their organization/team
        // - Super admins can terminate any session (security incidents)
        // - Audit log: who terminated which session (compliance requirement)
        // - Optional: Require termination reason (e.g., "Security incident", "Policy violation")
        //
        // Use Cases:
        // - Security: Detected compromised account, need immediate disconnect
        // - Compliance: Emergency kill switch for audit/regulatory requirements
        // - Policy: Enforce session time limits (auto-terminate after X hours)
        // - Maintenance: Kick all users before server maintenance window
        //
        // IMPORTANT LIMITATION - Visibility Scope:
        // This system ONLY tracks SSH connections made through the Admiral web terminal.
        // It does NOT see:
        // - Direct SSH connections (ssh user@server from local terminal)
        // - SFTP/SCP file transfers
        // - SSH tunnels or port forwarding
        // - Connections from other SSH clients (PuTTY, iTerm, etc.)
        //
        // For complete SSH session visibility and security monitoring, consider integrating
        // a host-based security agent like Syntra (https://github.com/SyntraSecurity/SyntraAgent) which:
        // - Monitors all SSH connections at the OS level (reads /var/log/auth.log, wtmp, etc.)
        // - Detects unauthorized direct SSH access
        // - Reports failed login attempts and brute force attacks
        // - Tracks session activity for all users (not just web terminal users)
        // - Provides real-time alerts for suspicious SSH activity
        //
        // Architecture for full SSH visibility:
        // Admiral Web Terminal -> This system (web-based SSH audit log)
        // Direct SSH Access -> Syntra Agent -> Central Security Dashboard
        // Combined view gives complete picture of all server access
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
