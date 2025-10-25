# Flagship Laravel Dashboard - Implementation Plan

**Date:** 2025-10-22 (Updated: 2025-10-25)
**Goal:** Build a web dashboard in Flagship (Laravel 12 + Inertia.js + React) to display metrics from `backend.metrics` with authentication, CRUD operations, and charts.

---

## Implementation Phases

### Phase 1: Foundation ✅ COMPLETED

- **Authentication** - Laravel Fortify with CAPTCHA support (reCAPTCHA/Turnstile)
- **Frontend Stack** - Inertia.js + React 19 + TypeScript
- **UI Components** - Radix UI + Tailwind CSS
- **Base Layout** - Sidebar navigation, topbar with user info

### Phase 2: Models ✅ COMPLETED

- Created Eloquent models for:
  - `Server` (reads from `backend.servers`)
  - `Metric` (reads from `backend.metrics`)
  - `Alert` (reads from `backend.alerts`)
  - `AlertRule` (reads/writes to `backend.alert_rules`)
  - `PrivateKey` (SSH key management)
  - `SshSession` (SSH session tracking)
- All models use the `backend` schema via database configuration

### Phase 3: Core Features ✅ MOSTLY COMPLETED

- **Dashboard** - Overview stats, server list, recent alerts ✅
- **Servers** - List, detail view with metrics ✅
- **SSH Management** - SSH key management and session handling ✅
- **Metrics/Charts** - Time-series charts (CPU, Memory, Disk, Network) 🚧
- **Alerts** - List, acknowledge, resolve 🚧
- **Alert Rules** - CRUD operations, enable/disable ⏳
- **Settings** - System configuration ⏳

### Phase 4: Polish & Enhancements

- **UI Components** - Radix UI + Tailwind components ✅
- **Real-time** - Optional WebSocket for live updates ⏳
- **Search/Filter** - Filter servers by status, alerts by severity ✅
- **Pagination** - Laravel's built-in pagination ✅
- **SSH Terminal** - Web-based SSH terminal with xterm.js ✅

---

## Key Routes

```php
// routes/web.php
Route::get('/', [DashboardController::class, 'index'])->name('dashboard');

// API routes for dashboard
Route::prefix('api/dashboard')->group(function () {
    Route::get('/stats', [DashboardController::class, 'stats']);
    Route::get('/servers', [DashboardController::class, 'servers']);
    Route::get('/servers-with-metrics', [DashboardController::class, 'serversWithMetrics']);
    Route::get('/metrics', [DashboardController::class, 'metrics']);
});

// Server management
Route::prefix('api/servers')->group(function () {
    Route::get('/', [ServersController::class, 'list']);
    Route::post('/', [ServersController::class, 'store']);
    Route::get('/{id}', [ServersController::class, 'show']);
    Route::patch('/{id}', [ServersController::class, 'update']);
    Route::delete('/{id}', [ServersController::class, 'destroy']);

    // SSH key management
    Route::post('/{id}/keys', [ServersController::class, 'attachKey']);
    Route::delete('/{serverId}/keys/{keyId}', [ServersController::class, 'detachKey']);
    Route::post('/{id}/test-connection', [ServersController::class, 'testConnection']);
    Route::post('/{id}/reset-host-key', [ServersController::class, 'resetHostKey']);
});

// SSH key management
Route::prefix('api/private-keys')->group(function () {
    Route::get('/', [PrivateKeysController::class, 'list']);
    Route::post('/', [PrivateKeysController::class, 'store']);
    Route::get('/{id}', [PrivateKeysController::class, 'show']);
    Route::patch('/{id}', [PrivateKeysController::class, 'update']);
    Route::delete('/{id}', [PrivateKeysController::class, 'destroy']);
});

// SSH sessions
Route::prefix('api/ssh-sessions')->group(function () {
    Route::get('/', [SshSessionsController::class, 'list']);
    Route::post('/', [SshSessionsController::class, 'create']);
    Route::get('/{id}', [SshSessionsController::class, 'show']);
    Route::delete('/{id}', [SshSessionsController::class, 'terminate']);
});
```

---

## Tech Stack

- **Laravel 12** (PHP 8.2+)
- **Inertia.js** - Server-side routing with SPA experience
- **React 19** + TypeScript - Frontend framework
- **Radix UI** - Headless UI components
- **Tailwind CSS 4** - Utility-first styling
- **Recharts** - React charting library for metrics visualization
- **xterm.js** - Web-based terminal for SSH sessions
- **Laravel Fortify** - Authentication
- **PostgreSQL 18** - Database with schema isolation
- **Vite** - Build tool and dev server

---

## MVP Features (Priority 1) ✅ COMPLETED

1. ✅ Basic layout with navigation (Radix UI components)
2. ✅ Dashboard homepage with stats
3. ✅ Servers list and detail pages
4. ✅ SSH key management and sessions
5. ✅ Laravel Fortify authentication with CAPTCHA
6. ✅ Server search and filtering

## Phase 2 Features 🚧 IN PROGRESS

7. 🚧 Charts for CPU/Memory/Disk metrics (Recharts integration)
8. 🚧 Alerts list and management
9. ⏳ Alert rules CRUD
10. ⏳ Time range filtering for charts
11. ✅ Web-based SSH terminal (xterm.js)

## Future Enhancements ⏳ PLANNED

12. ⏳ Real-time updates via WebSocket/Reverb
13. ⏳ Ansible integration for agent deployment
14. ⏳ Background jobs for scheduled tasks
15. ⏳ Email notifications
16. ⏳ Advanced analytics and reporting
17. ⏳ Multi-tenancy (organization/team isolation)

---

## Notes

- **Read-only from backend schema** - Flagship reads metrics written by Submarines digest workers
- **Eloquent models** - All models use Eloquent ORM with `backend` schema configuration
- **Schema isolation** - PostgreSQL has 2 schemas: `admiral`, `better_auth`
- **Inertia.js architecture** - Server-side routing, no client-side router needed
- **Type safety** - TypeScript for all frontend code
- **Component library** - Radix UI provides accessible, unstyled components

## Current Controllers

- `DashboardController` - Dashboard stats and metrics API
- `ServersController` - Server CRUD and SSH management
- `PrivateKeysController` - SSH key management
- `SshSessionsController` - SSH session handling

## Database Schema (backend)

All tables are in the `backend` schema, created and managed by Submarines migrations:

- `servers` - Server/agent registry with SSH configuration
- `metrics` - Time-series metrics data
- `alerts` - Alert records
- `alert_rules` - Alert configurations
- `private_keys` - SSH private keys (encrypted)
- `ssh_sessions` - Active SSH session tracking
- `server_private_key` - Pivot table for server-key relationships

---

**Status:** MVP Complete, Phase 2 in progress
**Next Steps:**
1. Complete Recharts integration for metrics visualization
2. Implement Ansible deployment workflow
3. Add alert management UI
4. Integrate real-time updates via Laravel Reverb
