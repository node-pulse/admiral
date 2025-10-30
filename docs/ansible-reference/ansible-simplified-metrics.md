# Ansible Playbooks Update Summary

**Date**: 2025-10-30
**Context**: Updated Ansible playbooks to support simplified metrics architecture

## Changes Made

### 1. ✅ Updated Agent Configuration Template

**File**: `ansible/roles/nodepulse-agent/templates/nodepulse.yml.j2`

**Changes**:
- Added Prometheus scraper configuration
- Added `format: "prometheus"` to server config
- Added buffer configuration (WAL for reliability)
- Added logging configuration
- Added architectural comments explaining the simplified metrics approach

**Impact**: Agents will now be deployed with proper configuration to:
- Scrape node_exporter on localhost:9100
- Parse metrics locally (98% bandwidth reduction)
- Send compact JSON (39 fields) to Submarines
- Buffer metrics locally for reliability

---

### 2. ✅ Existing node_exporter Deployment (No Changes Needed)

**File**: `ansible/playbooks/prometheus/deploy-node-exporter.yml` (EXISTING)

**Purpose**: Deploy Prometheus node_exporter to target servers

**Note**: This playbook already exists and is properly configured. No changes were needed.

**Features**:
- Downloads and installs node_exporter binary from GitHub releases
- Configures to listen ONLY on localhost:9100 (security - already set in defaults)
- Creates systemd service
- Verifies metrics endpoint is responding
- Supports multiple architectures via the `node-exporter` role

**Usage**:
```bash
ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml \
  -i inventory.yml \
  -e "node_exporter_version=1.8.2"
```

**Role**: Uses the existing `ansible/roles/node-exporter/` role

---

### 3. ✅ Updated README Documentation

**File**: `ansible/playbooks/nodepulse/README.md`

**Changes**:
- Added "Architecture Overview" section explaining simplified metrics
- Added visual diagram of the two-component architecture
- Added deployment order instructions
- Added reference to existing node_exporter playbook (`ansible/playbooks/prometheus/deploy-node-exporter.yml`)
- Updated deployment workflows to include node_exporter step

**Key Additions**:
- Architecture diagram showing node_exporter → Agent → Submarines flow
- Performance benefits (98% bandwidth, 99.8% database reduction)
- Security notes about localhost-only binding
- Step-by-step deployment instructions

---

### 4. ✅ Created Quick Start Guide

**File**: `ansible/playbooks/nodepulse/QUICK_START.md` (NEW)

**Purpose**: Fast reference guide for common deployment tasks

**Contents**:
- Quick deployment commands for dev and production
- Service verification commands
- Troubleshooting guide
- Architecture diagram
- Variables reference

---

### 5. ✅ Enhanced Verification Tasks

**File**: `ansible/roles/nodepulse-agent/tasks/verify.yml`

**Changes**:
- Added node_exporter availability check
- Added metrics endpoint test
- Added warning if node_exporter is not available
- Enhanced output with structured verification results
- Added check for recent scraping activity in logs

**Verification Now Checks**:
1. ✅ node_exporter service is running
2. ✅ node_exporter metrics endpoint is accessible
3. ✅ Agent service is running
4. ✅ Agent process is active
5. ✅ No recent errors in agent logs
6. ✅ Agent is successfully scraping metrics

**Output Example**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verification Results for web-01
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

node_exporter:
  Status: active
  Metrics: accessible

Agent:
  Status: active
  Process ID: 12345
  Recent Errors: 0 errors found

Recent Activity:
  Successfully scraped 39 metrics from node_exporter
  Sent metrics to Submarines endpoint

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Deployment Flow

### New Deployment Order (Production)

```
1. Setup mTLS (one-time)
   └─> ./scripts/setup-mtls.sh

2. Generate certificates (per server)
   └─> Flagship UI

3. Deploy node_exporter (NEW STEP)
   └─> ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml

4. Deploy Node Pulse Agent
   └─> ansible-playbook deploy-agent-mtls.yml
```

### New Deployment Order (Development)

```
1. Deploy node_exporter (NEW STEP)
   └─> ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml

2. Deploy Node Pulse Agent
   └─> ansible-playbook deploy-agent-no-mtls.yml
```

---

## Files Modified

| File | Type | Change |
|------|------|--------|
| `ansible/roles/nodepulse-agent/templates/nodepulse.yml.j2` | Modified | Added Prometheus scraper, buffer, logging config |
| `ansible/playbooks/nodepulse/README.md` | Modified | Added architecture docs, deployment order |
| `ansible/playbooks/nodepulse/QUICK_START.md` | **NEW** | Created quick reference guide |
| `ansible/roles/nodepulse-agent/tasks/verify.yml` | Modified | Added node_exporter checks, enhanced output |
| `ansible/playbooks/prometheus/deploy-node-exporter.yml` | Existing | No changes needed (already properly configured) |

---

## Compatibility

### Backward Compatibility

**✅ Existing playbooks still work**:
- `deploy-agent-mtls.yml` - No changes needed, uses updated template
- `deploy-agent-no-mtls.yml` - No changes needed, uses updated template
- `upgrade-agent.yml` - No changes needed
- `rollback-agent.yml` - No changes needed
- `uninstall-agent.yml` - No changes needed

**⚠️ New requirement**:
- node_exporter must be deployed BEFORE the agent
- Agents deployed without node_exporter will log warnings

### Agent Requirements

**NEW Requirements**:
- node_exporter must be running on localhost:9100
- Agent must be able to reach http://127.0.0.1:9100/metrics

**Existing Requirements** (unchanged):
- SSH access to target servers
- mTLS certificates (production only)
- Network access to Submarines endpoint

---

## Testing Checklist

### Before Production Deployment

- [ ] Test node_exporter deployment on staging server
- [ ] Verify node_exporter is accessible on localhost:9100
- [ ] Test agent deployment on staging server
- [ ] Verify agent can scrape node_exporter
- [ ] Verify metrics appear in Submarines/PostgreSQL
- [ ] Verify dashboard displays metrics correctly
- [ ] Test upgrade path (existing agents → new config)
- [ ] Test rollback scenario

### Production Rollout

1. **Pilot**: Deploy to 1-2 production servers
2. **Monitor**: Check metrics for 24 hours
3. **Validate**: Confirm 98% bandwidth reduction
4. **Gradual Rollout**: Deploy to 10% → 50% → 100% of fleet

---

## Rollback Plan

If issues arise:

1. **Agent Issues**:
   ```bash
   ansible-playbook rollback-agent.yml -i inventory.yml
   ```

2. **Configuration Issues**:
   - Old agents can still send legacy JSON format
   - Submarines supports both formats during transition

3. **node_exporter Issues**:
   ```bash
   # Stop and disable node_exporter
   systemctl stop node_exporter
   systemctl disable node_exporter
   ```

---

## Performance Impact

### Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Network per scrape | 61KB | 1KB | 98.32% reduction |
| Database rows per scrape | 1100+ | 1 | 99.8% reduction |
| Query performance | 150ms | 5-15ms | 10-30x faster |
| Agent CPU usage | Low | Lower | Agent parses locally |
| Submarines CPU usage | High | Minimal | Just deserializes JSON |

### Bandwidth Savings (100 servers)

- **Before**: 860GB/month
- **After**: 12GB/month
- **Savings**: 848GB/month (98.6% reduction)

---

## Next Steps

1. **Test on staging**:
   ```bash
   # Deploy node_exporter
   ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml \
     -i staging-inventory.yml

   # Deploy agent
   ansible-playbook ansible/playbooks/nodepulse/deploy-agent-no-mtls.yml \
     -i staging-inventory.yml
   ```

2. **Verify metrics flow**:
   - Check Submarines logs for incoming metrics
   - Check PostgreSQL `metrics` table for new rows
   - Check Flagship dashboard for updated charts

3. **Production rollout**:
   - Start with pilot servers
   - Monitor for 24 hours
   - Gradually roll out to full fleet

4. **Monitor key metrics**:
   - Bandwidth usage (should drop 98%)
   - Database size growth (should drop 99%)
   - Query performance (should improve 10-30x)
   - Agent error rates

---

## Support

If you encounter issues:

1. Check verification output from playbook
2. Review agent logs: `journalctl -u nodepulse -f`
3. Review node_exporter logs: `journalctl -u node_exporter -f`
4. Test node_exporter manually: `curl http://127.0.0.1:9100/metrics`
5. Check Submarines logs for incoming metrics

---

## References

- [Simplified Metrics Schema](./simplified-metrics-schema.md) - Complete implementation details
- [Agent Refactor Summary](./agent-refactor-summary.md) - Agent architecture changes
- [Playbooks README](../ansible/playbooks/nodepulse/README.md) - Detailed playbook documentation

---

**Status**: ✅ **READY FOR TESTING**
**Last Updated**: 2025-10-30
