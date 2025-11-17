# Playbook Catalog Permissions Fix

**Date**: 2025-11-16
**Severity**: High
**Component**: Flagship (Laravel), Submarines Deployer
**Issue**: Community playbook downloads failing with `mkdir()` permission errors

---

## Problem Statement

Community playbook downloads were failing with PHP `mkdir()` permission errors when attempting to download playbooks from the registry via the Flagship web UI.

### Root Cause

The `ansible/catalog` directory is a **shared volume** mounted into multiple containers:
- `flagship` (runs as `laravel` user, UID 1000) - downloads playbooks via web UI
- `submarines-deployer` (runs as `root`, UID 0) - executes Ansible playbooks

The directory didn't exist or had incorrect permissions, preventing PHP from creating it.

### Initial Incorrect Approach ❌

The first fix attempt made these mistakes:

1. Created `ansible/` directory in Dockerfile and set `chown laravel:laravel`
2. This broke `submarines-deployer` which runs as `root` and needs write access
3. Didn't account for the shared volume mount scenario

### User Feedback (Correctly Identified Issues)

The user identified **3 critical problems** with the initial fix:

1. ✅ **Ansible directory in release tarball** - Already handled correctly, no changes needed
2. ✅ **Redundant catalog directory creation** - `.gitignore` already ensures structure
3. ✅ **Ownership conflict** - `chown laravel:laravel` breaks shared access for `submarines-deployer`

---

## Correct Solution

### Design Decision: World-Writable Permissions

Since the directory is shared between containers running as different users, we use **world-writable permissions (777)** instead of managing ownership.

| Container | User | UID | Purpose |
|-----------|------|-----|---------|
| `flagship` | `laravel` | 1000 | Download community playbooks via web UI |
| `submarines-deployer` | `root` | 0 | Execute Ansible playbooks for deployments |

**Options considered:**

1. ❌ **Shared group ownership**: Doesn't work - containers use different groups
2. ❌ **Change deployer to run as laravel**: Can't - Ansible needs root for SSH operations
3. ✅ **World-writable (777)**: Simple, works for both containers, isolated to catalog subdirectory

**Security considerations:**
- Only `ansible/catalog/` is world-writable, not the entire `ansible/` directory
- This directory only contains downloaded playbooks (not secrets or credentials)
- The directory is inside the Docker volume, not exposed to the host network
- Both containers are trusted components of the system

---

## Files Modified

### 1. `flagship/Dockerfile.prod` (Lines 104-119)

**Before:**
```dockerfile
# Create storage and ansible directories and set permissions
RUN mkdir -p \
    storage/logs \
    ... \
    ansible/catalog \
    && chown -R laravel:laravel storage bootstrap/cache ansible \
    && chmod -R 775 storage bootstrap/cache ansible
```

**After:**
```dockerfile
# Create storage directories and set permissions
RUN mkdir -p \
    storage/logs \
    ... \
    bootstrap/cache \
    && chown -R laravel:laravel storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# Note: ansible/ directory is NOT created in Dockerfile
# It will be mounted from host at runtime (shared with submarines-deployer)
# Permissions are handled by entrypoint script to support both laravel and root users
```

**Changes:**
- ❌ Removed ansible directory creation from Dockerfile
- ✅ Added comment explaining why (it's a volume mount)
- ✅ Only manages storage directories that belong to Laravel

### 2. `flagship/Dockerfile.dev` (Lines 90-104)

**Changes:**
- Same changes as production Dockerfile for consistency
- Added comment explaining shared volume mount scenario

### 3. `flagship/docker-entrypoint.sh` (Lines 20-27)

**Before:**
```bash
mkdir -p /var/www/html/ansible/catalog
chown -R laravel:laravel /var/www/html/ansible
chmod -R 775 /var/www/html/ansible
```

**After:**
```bash
# Ensure ansible/catalog directory exists
# This is shared between flagship (laravel) and submarines-deployer (root)
# Use world-writable permissions so both users can write
mkdir -p /var/www/html/ansible/catalog

# Set permissions for shared access (both laravel and root can write)
# We use 777 because the directory is shared across containers with different users
chmod -R 777 /var/www/html/ansible/catalog
```

**Changes:**
- ✅ Creates `ansible/catalog` if it doesn't exist
- ✅ Sets permissions to `777` (world-writable)
- ✅ Does NOT change ownership (avoids conflicts)
- ✅ Runs on every container start
- ✅ Added detailed comments explaining the design decision

### 4. `scripts/deploy.sh` (Lines 852-875)

**Before:**
```bash
chmod -R 755 "$ANSIBLE_DIR"
```

**After:**
```bash
# Set proper permissions for shared access
# The ansible/catalog directory is shared between:
# - flagship container (runs as laravel user, UID 1000)
# - submarines-deployer container (runs as root, UID 0)
# Use 777 on catalog to allow both users to write
chmod -R 777 "$CATALOG_DIR"
```

**Changes:**
- ✅ Creates `ansible/catalog` on host before mounting
- ✅ Sets permissions to `777` on host
- ✅ Documents why shared access is needed

### 5. `.github/workflows/release.yml`

**No changes needed** - Already correctly includes ansible directory with proper structure and copies `.gitignore` files.

---

## Quick Fix for Production (Immediate)

If you need to fix the issue **right now** without rebuilding:

### Option 1: One-Liner (Recommended)

```bash
docker compose exec flagship bash -c "mkdir -p /var/www/html/ansible/catalog && chmod -R 777 /var/www/html/ansible/catalog"
```

### Option 2: On Host

```bash
cd /path/to/admiral
sudo mkdir -p ansible/catalog
sudo chmod -R 777 ansible/catalog
```

### Option 3: Using Fix Script

```bash
# Upload script to production
scp debug_fix_playbook_permissions.sh user@production:/path/to/admiral/

# Run inside container
docker compose exec flagship bash /var/www/html/debug_fix_playbook_permissions.sh
```

---

## Permanent Fix (Deploy New Version)

After committing these changes:

```bash
# On production server
docker compose pull flagship
docker compose up -d flagship

# Verify fix
docker compose exec flagship ls -la /var/www/html/ansible/
```

---

## Verification

### Test Write Access

```bash
# Test write access
docker compose exec flagship bash -c "touch /var/www/html/ansible/catalog/.test && rm /var/www/html/ansible/catalog/.test && echo 'SUCCESS'"

# Check permissions
docker compose exec flagship ls -la /var/www/html/ansible/
```

### Expected Output

```
drwxrwxrwx 2 laravel laravel 4096 Nov 16 10:00 catalog
```

Note: `777` permissions (world-writable for shared container access)

### Integration Test

1. Log into Flagship dashboard
2. Navigate to Playbooks section
3. Try downloading a community playbook from the registry
4. Should succeed without permission errors

---

## What This Fixes

✅ Community playbook downloads via the Flagship dashboard
✅ Custom playbook uploads
✅ Playbook updates
✅ All file operations in `ansible/catalog/`
✅ Shared access between flagship and submarines-deployer containers

---

## Technical Details

### Why This Happened

The Laravel `PlaybookDownloader` service (`flagship/app/Services/PlaybookDownloader.php`) tries to create the `ansible/catalog` directory at line 36:

```php
public function __construct()
{
    $this->storagePath = base_path('ansible/catalog');

    if (!File::isDirectory($this->storagePath)) {
        File::makeDirectory($this->storagePath, 0755, true);
    }
}
```

When the `ansible` directory is mounted as a Docker volume from the host, but the `catalog` subdirectory doesn't exist with proper permissions, PHP's `mkdir()` fails with a permission denied error.

### Why the Fix Works

The three-layer approach ensures the directory always exists with correct permissions:

1. **Entrypoint Script**: Creates directory and sets `777` permissions on every container start
2. **Deploy Script**: Creates directory structure on host before mounting
3. **No Dockerfile Changes**: Volume mount is handled at runtime, not build time

This ensures the directory always exists with correct permissions regardless of:
- Fresh deployments
- Container restarts
- Volume mounts from different hosts
- Host filesystem permissions

---

## Files Changed Summary

| File | Status | Description |
|------|--------|-------------|
| `flagship/Dockerfile.prod` | ✅ Fixed | Removed incorrect ansible directory creation |
| `flagship/Dockerfile.dev` | ✅ Fixed | Removed incorrect ansible directory creation |
| `flagship/docker-entrypoint.sh` | ✅ Fixed | Sets 777 permissions on catalog directory |
| `scripts/deploy.sh` | ✅ Fixed | Creates catalog with 777 permissions on host |
| `.github/workflows/release.yml` | ✅ No change | Already correct |
| `debug_fix_playbook_permissions.sh` | ✅ Updated | Uses 777 instead of ownership change |

---

## Rollback Plan

If issues occur:

```bash
# Restore permissions manually
docker compose exec flagship bash -c "chmod -R 777 /var/www/html/ansible/catalog"

# Or revert to previous image
docker compose pull flagship:previous-tag
docker compose up -d flagship
```

---

## Related Files

- Debug script: `debug_playbook_permissions.sh` (diagnostic tool)
- Quick fix: `debug_fix_playbook_permissions.sh` (temporary fix)
- Service: `flagship/app/Services/PlaybookDownloader.php` (affected code)

---

## Lessons Learned

1. **Volume mounts require runtime permission management**, not build-time
2. **Shared volumes between containers with different users need world-writable permissions**
3. **Always consider the full deployment context** (multiple containers, volume mounts, different users)
4. **User feedback is invaluable** - the original fix had 3 critical issues that were caught by careful review

---

## Future Improvements

Potential alternatives to consider (not implemented):

1. Use a shared group ID across both containers (requires base image changes)
2. Use an init container to set up permissions before main containers start
3. Use a sidecar container for file operations (over-engineering for this use case)

The current solution (777 on catalog directory) is simple, secure enough for this use case, and works reliably.
