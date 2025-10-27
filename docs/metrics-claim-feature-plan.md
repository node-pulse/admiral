# Metrics Claim Feature - Implementation Plan

**Status:** Deferred / Low Priority
**ROI:** Low (Ansible-first strategy covers 99% of use cases)
**Implementation Priority:** P3 - Only if users complain

## Problem Statement

When a user manually installs an agent before creating the server in the UI:

- Agent generates its own `server_id` (UUID)
- User later creates server in UI with different `server_id`
- Metrics exist in database but are orphaned (not linked to any server)
- Dashboard shows "no metrics" for the manually-created server

## Current Strategy

**Ansible-first deployment** is the primary workflow:

1. Ansible playbook creates server via API → receives `server_id`
2. Ansible deploys agent with that `server_id` in config
3. Metrics arrive with correct `server_id` from day one
4. No orphaned metrics, no linking needed ✅

## Proposed Solution (Future Enhancement)

### Backend Changes

#### 1. Add API endpoint to find orphaned metrics

```php
// flagship/app/Http/Controllers/MetricsController.php
public function findOrphaned(Request $request)
{
    $ipv4 = $request->input('ipv4');

    // Find metrics with server_id not in servers table
    $orphanedMetrics = DB::table('admiral.metrics as m')
        ->leftJoin('admiral.servers as s', 'm.server_id', '=', 's.server_id')
        ->whereNull('s.id')
        ->where('m.ipv4', $ipv4)
        ->select('m.server_id', DB::raw('COUNT(*) as count'), DB::raw('MIN(m.timestamp) as first_seen'))
        ->groupBy('m.server_id')
        ->get();

    return response()->json(['orphaned_metrics' => $orphanedMetrics]);
}
```

#### 2. Add API endpoint to claim metrics

```php
// flagship/app/Http/Controllers/ServersController.php
public function claimMetrics(Request $request, string $id)
{
    $server = Server::findOrFail($id);

    $validated = $request->validate([
        'agent_server_id' => 'required|string',
    ]);

    // Update server's server_id to match the agent's server_id
    // This links all existing metrics to this server
    $server->server_id = $validated['agent_server_id'];
    $server->save();

    return response()->json([
        'message' => 'Metrics claimed successfully',
        'server' => $server,
    ]);
}
```

Route:

```php
Route::post('/servers/{id}/claim-metrics', [ServersController::class, 'claimMetrics']);
```

### Frontend Changes

#### 1. Update server creation flow

When user creates a server with `ssh_host = "192.xxx.xxx.xxx"`:

1. After server is created, query `/api/metrics/orphaned?ipv4=192.xxx.xxx.xxx`
2. If orphaned metrics found, show dialog:
   ```
   ┌─────────────────────────────────────────────┐
   │ Orphaned Metrics Found                      │
   ├─────────────────────────────────────────────┤
   │ We found 1,234 metrics for this IP address  │
   │ that aren't linked to any server.           │
   │                                              │
   │ Agent ID: agt_7Yp2Xk3m                      │
   │ First seen: 2025-10-20 14:23:11             │
   │ Metric count: 1,234                         │
   │                                              │
   │ [Claim Metrics]  [Ignore]                   │
   └─────────────────────────────────────────────┘
   ```
3. If user clicks "Claim Metrics", call `/api/servers/{id}/claim-metrics`

#### 2. Add "Claim Metrics" button to server details page

For existing servers showing no metrics:

1. Show button: "Search for orphaned metrics"
2. Queries `/api/metrics/orphaned?ipv4={server.ssh_host}`
3. If found, allow claiming

### Migration Strategy

No database schema changes needed - uses existing columns.

## Implementation Checklist

- [ ] Backend: Add `MetricsController::findOrphaned()` endpoint
- [ ] Backend: Add `ServersController::claimMetrics()` endpoint
- [ ] Frontend: Add orphaned metrics detection after server creation
- [ ] Frontend: Add "Claim Metrics" dialog component
- [ ] Frontend: Add "Search orphaned metrics" button to server details
- [ ] Testing: Test with manually-installed agent scenario
- [ ] Docs: Update user documentation with manual installation workflow

## Edge Cases & Considerations

### Multiple orphaned server_ids for same IP

If agent was reinstalled multiple times, there might be multiple orphaned `server_id` values:

- Show all options in UI
- Let user choose which one to claim
- Or: Claim all (merge all metrics)

### IP address changes

If server IP changes after claiming:

- Metrics are already linked by `server_id`, so they remain linked ✅
- New metrics continue to arrive with same `server_id` ✅

### IPv6 and domains

Current plan only matches on `ipv4`. Future enhancement:

- Also check `ipv6` field
- For domains: Can't auto-detect, require manual `server_id` input

### Agent reinstall with new server_id

If user reinstalls agent and it generates a new `server_id`:

- Old metrics stay linked to server (using old `server_id` from claim)
- New metrics are orphaned again
- User must claim again (or reinstall agent with correct `server_id` from UI)

## Why This Is Low Priority

1. **Ansible workflow eliminates the problem** - Server created first, agent deployed with correct ID
2. **Manual installations are rare** - Most users will use Ansible/automation
3. **Workaround exists** - User can manually edit `/etc/node-pulse/nodepulse.yml` with `server_id` from UI
4. **Low impact** - Affects only edge case users who:
   - Manually install agent
   - Don't use Ansible
   - Don't read documentation
   - Don't know how to edit config files

## When to Implement

Implement this feature when:

- Multiple users report the issue (3+ support tickets)
- Users request it in GitHub issues
- We have spare development time

Until then: **Document the Ansible-first workflow** and provide manual workaround in docs.

## Documentation Workaround (Immediate Fix)

Add to user documentation:

```markdown
### Manual Agent Installation

If you manually install the agent before creating the server in the dashboard:

1. **Create server in dashboard first** (recommended)

   - Copy the `server_id` shown in the UI
   - Edit `/etc/node-pulse/nodepulse.yml` and set `server_id: <copied-id>`
   - Restart agent: `systemctl restart nodepulse`

2. **Or use Ansible** (best practice)
   - See `docs/ansible-deployment.md`
   - Ansible automatically handles server creation and agent deployment

If you already installed the agent with a different `server_id`:

- Check agent config: `cat /etc/node-pulse/nodepulse.yml | grep server_id`
- Update server in dashboard to use that `server_id` (API call or database edit)
```

---

**Next Steps:**

1. ✅ Document Ansible-first strategy
2. ✅ Create Ansible playbook for automated deployment
3. ⏸️ Defer "metrics claim" feature until user demand justifies it
