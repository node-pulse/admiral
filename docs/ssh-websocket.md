# SSH WebSocket - Future Improvements

This document tracks planned enhancements for the SSH WebSocket service (`submarines-sshws`).

## Current Status

✅ **Completed (October 2025)**

- SSH WebSocket service implemented in Go
- Integrated with submarines architecture
- Private key decryption using shared `/secrets/master.key`
- Terminal input/output working correctly
- WebSocket endpoint: `ws://localhost:6001/ssh/{server-id}`
- Service: `submarines-sshws` (port 6001, localhost only)

---

## Priority 0: Authentication

### 0.1 Password SSH Authentication (Session-Only)

**Status:** ✅ COMPLETED (October 2025)
**Priority:** Critical
**Issue:** Users who haven't added SSH keys to their servers yet need password-based authentication to initially set up key-based auth.

**Implementation:**

- ✅ Accept optional password parameter in WebSocket auth message
- ✅ Support both authentication methods:
  - **Option A: Private Key** (preferred, secure)
  - **Option B: Password** (temporary, for initial setup only)
- ✅ Passwords are **session-only** - never stored in database
- ✅ Frontend has password input field in SSH terminal component
- ✅ Fixed authentication priority bug (October 2025)

**Authentication Priority Logic:**
The system uses the following priority order:

1. **If user explicitly provides password** → Use password authentication (even if key exists in DB)
2. **Else if SSH key exists in database** → Use key authentication
3. **Else** → Show error (no authentication method available)

**Rationale:**

- User explicitly entering a password indicates intent to use it
- Allows testing password access even when keys are configured
- Enables password-based fallback if keys fail
- Respects user choice while maintaining flexibility

**Important:** The SSH server itself (`sshd_config`) is the ultimate authority on allowed authentication methods. If the server has `PasswordAuthentication no`, password attempts will fail regardless of client configuration. This is proper separation of concerns:

- **Client side** (NodePulse): Respects user's choice of auth method
- **Server side** (sshd): Enforces security policy

**Design Decision:**
Passwords are **NOT stored** in the database for security reasons. Passwordless SSH (key-based) is more secure and easier to manage. Password authentication is only provided as a temporary mechanism to allow users to:

1. Connect to a new server via password
2. Set up SSH key authentication (`ssh-copy-id` or manual key installation)
3. Use key-based auth for all future connections

**Security Considerations:**

- ✅ Passwords transmitted via WSS (secure WebSocket) only
- ✅ Passwords never logged in plaintext
- ✅ Passwords never stored in database
- ✅ User-provided password always takes priority (explicit intent)
- ✅ Server-side SSH configuration enforces final auth policy
- ⚠️ Password is only valid for the current WebSocket session
- ⚠️ Users must set up SSH keys for permanent access

**Files Modified:**

- `submarines/internal/sshws/handler.go:166-211` - Authentication priority logic
- `submarines/internal/sshws/crypto.go` - Already has decryption for private keys
- Frontend: `flagship/resources/js/components/servers/ssh-terminal.tsx:409-442` - Password input field

**Usage:**

1. User opens SSH terminal for a server without SSH key configured
2. User enters password in the optional password field
3. Password is sent in WebSocket auth message: `{"type": "auth", "password": "...", ...}`
4. SSH connection established using password
5. User runs `ssh-copy-id` or manually installs SSH key on server
6. Future connections use key-based auth (no password needed)

**Bug Fix (October 2025):**
Fixed authentication priority issue where database key would always be used even when user explicitly provided a password. Now password input takes precedence, allowing users to:

- Test password authentication on key-configured servers
- Use password as fallback if key fails
- Override default key authentication when needed

**References:**

- Go SSH password auth: `ssh.Password(password)` at `handler.go:176`
- Go SSH key auth: `ssh.PublicKeys(signer)` at `handler.go:204`
- Frontend password input: `ssh-terminal.tsx:438-442`

---

## Priority 1: Security

### 1.1 Implement Proper Host Key Verification

**Status:** ✅ COMPLETED (October 2025)
**Priority:** High
**Issue:** Previously used `ssh.InsecureIgnoreHostKey()` which was vulnerable to MITM attacks.

**Implementation: Trust On First Use (TOFU)**

- ✅ Store SSH host key fingerprint in `servers` table on first connection
- ✅ Verify fingerprint matches on subsequent connections
- ✅ Alert admin if fingerprint mismatch detected (possible MITM or server rebuild)
- ✅ API endpoint to reset host key when server is legitimately rebuilt

**Database Changes:**

```sql
ALTER TABLE admiral.servers
ADD COLUMN ssh_host_key_fingerprint VARCHAR(255);
```

**Files Modified:**

- `submarines/internal/sshws/handler.go:132-137` - Replaced `ssh.InsecureIgnoreHostKey()` with TOFU verification
- `submarines/internal/sshws/hostkey.go` - New host key verification module
- `flagship/app/Http/Controllers/ServersController.php:340-357` - Reset host key endpoint
- `flagship/routes/web.php:37` - Route for host key reset
- `migrate/migrations/20251024000002000_add_ssh_host_key_fingerprint.sql` - Database migration

**How It Works:**

1. **First Connection (TOFU)**:

   - Server presents host key
   - Fingerprint calculated (SHA256 base64)
   - Fingerprint stored in database
   - Connection proceeds

2. **Subsequent Connections**:

   - Server presents host key
   - Fingerprint compared to stored value
   - Connection allowed if match, rejected if mismatch

3. **Host Key Mismatch**:
   - Error message: "host key verification failed: fingerprint mismatch (possible MITM attack or server rebuild)"
   - Admin must verify server identity
   - Use reset endpoint: `POST /servers/{id}/reset-host-key`
   - Next connection will re-establish trust (TOFU)

**API Endpoints:**

- `POST /servers/{id}/reset-host-key` - Reset stored host key fingerprint

**Security Benefits:**

- ✅ Protects against MITM attacks after first connection
- ✅ Detects server compromise or unauthorized replacement
- ✅ Aligns with OpenSSH behavior (known_hosts)
- ✅ SHA256 fingerprint format matches OpenSSH default

**References:**

- Go SSH docs: https://pkg.go.dev/golang.org/x/crypto/ssh#HostKeyCallback
- SSH fingerprint format: SHA256 base64 encoded (matches `ssh-keygen -lf`)

---

## Priority 2: Compliance & Auditing

### 2.1 Add SSH Session Logging (Metadata)

**Status:** ✅ COMPLETED (October 2025)
**Priority:** High (required for compliance)
**Description:** Track who accessed which servers, when, and for how long. Provides audit trail for PCI-DSS, SOC2, HIPAA compliance.

**Database Schema:**

```sql
CREATE TABLE admiral.ssh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL UNIQUE,
    server_id UUID NOT NULL REFERENCES admiral.servers(id),
    user_id UUID, -- From Better Auth (Flagship user who opened terminal)
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'failed', 'terminated'
    disconnect_reason TEXT,
    auth_method VARCHAR(50), -- 'private_key', 'password', 'unknown'
    ssh_username VARCHAR(255),
    ssh_host VARCHAR(255),
    ssh_port INTEGER,
    host_key_fingerprint VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Implementation:**

- ✅ Log session start when SSH connection established
- ✅ Log session end when WebSocket closes
- ✅ Capture auth method (private_key/password)
- ✅ Calculate duration on session end
- ✅ Track connection details (host, port, username)
- ✅ Capture client IP address
- ✅ Capture user agent
- ⚠️ User ID capture pending (requires auth middleware integration)
- ⚠️ Better Auth ID capture pending (requires auth middleware integration)

**Files Modified:**

- `submarines/internal/sshws/handler.go:132-223, 383-386` - Session logging integration
- `submarines/internal/sshws/session.go` - Session logging module
- `migrate/migrations/20251024000003000_create_ssh_sessions_table.sql` - Database schema

**Logged Information:**

- ✅ Session ID (WebSocket session identifier)
- ✅ Server ID (which server was accessed)
- ✅ Start/end timestamps
- ✅ Duration (calculated automatically)
- ✅ Auth method (private_key or password)
- ✅ SSH connection details (username, host, port)
- ✅ Status (active, completed, failed, terminated)
- ✅ Disconnect reason
- ✅ Client IP address
- ✅ User agent (browser/client info)
- ⏳ User ID (pending auth middleware)
- ⏳ Better Auth ID (pending auth middleware)

**Usage:**
Sessions are logged automatically. Query examples:

```sql
-- List all sessions for a server
SELECT * FROM admiral.ssh_sessions WHERE server_id = 'uuid' ORDER BY started_at DESC;

-- Find active sessions
SELECT * FROM admiral.ssh_sessions WHERE status = 'active';

-- Calculate average session duration
SELECT AVG(duration_seconds) FROM admiral.ssh_sessions WHERE status = 'completed';
```

### 2.2 Implement Full Session Recording

**Status:** 🔧 INFRASTRUCTURE READY (October 2025)
**Priority:** Medium (required for PCI-DSS, SOC2, HIPAA in some industries)
**Description:** Record all terminal input/output for compliance and troubleshooting.

**Database Schema:**

```sql
CREATE TABLE admiral.ssh_session_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES admiral.ssh_sessions(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL, -- Order of events
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    event_type VARCHAR(20) NOT NULL, -- 'input', 'output', 'resize', 'disconnect'
    data TEXT NOT NULL, -- Terminal data (could be binary-safe base64)
    data_size INTEGER, -- Size in bytes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ssh_recordings_session ON admiral.ssh_session_recordings(session_id, sequence);
CREATE INDEX idx_ssh_recordings_timestamp ON admiral.ssh_session_recordings(timestamp);
```

**Current Status:**

- ✅ Database schema created (`ssh_session_recordings` table)
- ✅ Session logging module supports recording (`RecordEvent()` method)
- ✅ Recording infrastructure in place
- ✅ **Recording DISABLED by default** for privacy and performance (handler.go:152)
- ✅ RecordEvent has safety check - returns immediately if disabled (session.go:155-157)
- ❌ **I/O loop integration NOT implemented** - RecordEvent() is never called
- ❌ **Keystroke/output recording is completely inactive**

**Implementation:**

- ✅ Database schema and indexes
- ✅ SessionLogger.RecordEvent() method
- ⏳ Record SSH output (stdout/stderr) in I/O loops
- ⏳ Optionally record input (privacy concern - passwords!)
- ⏳ Store in chunks to avoid huge single records
- ⏳ Consider compression for large sessions

**To Enable Recording (NOT RECOMMENDED):**

⚠️ **WARNING:** This will record EVERY keystroke including passwords, API keys, and sensitive data!

1. Update database setting (via Flagship admin UI or SQL):

   ```sql
   UPDATE admiral.settings
   SET value = 'true'
   WHERE key = 'ssh_session_recording_enabled';
   ```

2. The handler checks this setting from database automatically (handler.go:154, 430-446)

3. Currently does nothing because RecordEvent() is never called in I/O loops

4. To make it actually record, you would need to add (NOT IMPLEMENTED):
   - `sessionLogger.RecordEvent("output", data)` in stdout/stderr loops
   - `sessionLogger.RecordEvent("input", data)` in input loop

**Current Behavior:**

- Default: `ssh_session_recording_enabled = false` (set in migration) → Recording OFF ✅
- If changed to `true` → Prints warning log but still doesn't record (I/O integration missing)
- If setting missing → Defaults to false (safe mode)

**Settings Added to Database:**

- `ssh_session_logging_enabled = true` (session metadata logging - ENABLED)
- `ssh_session_recording_enabled = false` (keystroke recording - DISABLED)

**Privacy Considerations:**

- ⚠️ Can capture passwords, API keys, sensitive data
- ⚠️ **Disabled by default** to protect user privacy
- Encrypt recordings at rest (database-level encryption recommended)
- Allow opt-out where compliance permits
- Consider redacting patterns (e.g., `password=****`)
- Log disclaimer: "This session may be recorded for compliance purposes"

**Files Modified:**

- `migrate/migrations/20251024000004000_create_ssh_session_recordings_table.sql` - Database schema
- `submarines/internal/sshws/session.go:143-157` - RecordEvent method
- `submarines/internal/sshws/handler.go:137` - Recording disabled by default

**Files Pending:**

- `submarines/internal/sshws/handler.go` - Add RecordEvent calls in I/O loops
- Add recording retrieval/playback API
- Add recording viewer UI

### 2.3 Add Session Recording Retention Policy

**Status:** TODO
**Priority:** Medium
**Description:** Automatically delete old session recordings to save space and comply with data retention policies.

**Implementation:**

- Add cleanup worker (similar to `submarines-cleaner`)
- Configurable retention period (default: 90 days)
- Keep session metadata longer than recordings
- Add manual "purge old recordings" admin action

**Configuration:**

```env
SSH_SESSION_RETENTION_DAYS=90
SSH_RECORDING_RETENTION_DAYS=30
```

**Files to Create:**

- `submarines/cmd/cleaner/ssh_sessions.go` - Add cleanup logic
- Or create separate `submarines/cmd/ssh-cleaner/main.go`

---

## Priority 3: User Interface

### 3.1 Add Web UI for SSH Session History

**Status:** ✅ COMPLETED (October 2025)
**Priority:** Medium
**Description:** View past SSH sessions in Flagship dashboard with filtering and playback.

**Implemented Features:**

- ✅ List all SSH sessions (filterable by server, status, date range)
- ✅ Show session details (duration, user, IP, status)
- ✅ Search sessions by session ID, username, IP address
- ✅ Terminate active sessions (marks as terminated)
- ✅ Stats cards showing active/completed/failed session counts
- ✅ Session details dialog with full metadata
- ✅ Server-specific session list endpoint
- ⏳ Playback recorded sessions (pending - recording disabled)
- ⏳ Export session logs (future enhancement)

**Pages Created:**

- ✅ `/ssh-sessions` - Global session list with filters and pagination
- ✅ Session details dialog (modal)
- ✅ Terminate session dialog (confirmation modal)
- ⏳ `/ssh-sessions/{id}/replay` - Playback recording (not implemented - recording disabled)

**Files Created:**

- ✅ `flagship/app/Http/Controllers/SshSessionsController.php` - API endpoints
- ✅ `flagship/app/Models/SshSession.php` - Eloquent model
- ✅ `flagship/resources/js/pages/ssh-sessions.tsx` - Frontend page
- ✅ `flagship/routes/web.php` - Routes added
- ✅ `flagship/resources/js/components/app-sidebar.tsx` - Navigation link added
- ⏳ `flagship/resources/js/components/SessionPlayer.tsx` - Terminal replay component (pending)

**API Endpoints Implemented:**

```
✅ GET  /ssh-sessions           (page route)
✅ GET  /ssh-sessions/list      (API: list with filters)
✅ GET  /ssh-sessions/{id}      (API: single session details)
✅ POST /ssh-sessions/{id}/terminate (force close active session)
⏳ GET  /ssh-sessions/{id}/recording (pending - recording disabled)
```

**UI Features:**

- Stats cards: Active Sessions, Completed Sessions, Failed Sessions
- Filters: Server dropdown, Status dropdown, Date range, Search input
- Table columns: Server, Username, Started At, Duration, Status, IP Address, Actions
- Status badges: Active (green), Completed (gray), Failed (red), Terminated (outline)
- Actions: View Details (info icon), Terminate (X icon, only for active sessions)
- Pagination with page size selector (10, 20, 50, 100)
- Responsive design with proper loading states

---

## Priority 4: Reliability & Performance

### 4.1 Improve Error Handling

**Status:** ✅ COMPLETED (October 2025)
**Priority:** Medium
**Description:** Better error messages and recovery from failures.

**Implemented Improvements:**

- ✅ Connection status indicator showing real-time connection state
- ✅ Context-aware error messages using toast notifications
- ✅ Clear manual reconnect button with explanatory messaging
- ✅ Specific error type detection (auth, network, websocket, server)
- ✅ Helpful guidance for each error type
- ✅ Better visual feedback for disconnected sessions
- ❌ Auto-reconnect deliberately NOT implemented (see reasoning below)

**Why No Auto-Reconnect:**
Auto-reconnect was intentionally skipped because SSH sessions cannot be resumed after disconnection. Auto-reconnecting would:

- Create a false sense of continuity (new session, different state)
- Be dangerous for running commands (users need to know session ended)
- Violate user expectations (SSH disconnection = session over)

Instead, we provide:

- Clear "Connection closed" message in terminal
- Visual reconnect prompt with amber warning styling
- Easy one-click manual reconnection

**Features Added:**

1. **Connection Status Indicator** (`ssh-terminal.tsx:358-392`)

   - Badge showing current state: Disconnected, Connecting, Connected, Connection Failed
   - Icons with status (WifiOff, Loader2, CheckCircle)
   - Display SSH connection details (username@host:port)

2. **Smart Error Detection** (`ssh-terminal.tsx:254-294`)

   - Detects error types from message content:
     - `auth` - Authentication/password/key errors
     - `network` - Network/timeout/unreachable errors
     - `server` - Host key verification/MITM warnings
     - `websocket` - WebSocket service failures
   - Provides contextual help for each error type

3. **Toast Notifications** (using sonner)

   - Error title and description
   - Helpful guidance based on error type
   - 6-second display duration for reading

4. **Enhanced Reconnect UI** (`ssh-terminal.tsx:451-467`)
   - Amber warning box when disconnected
   - Clear messaging: "Your SSH session has ended"
   - Full-width "Reconnect to Server" button
   - Resets state properly on reconnect

**Error Messages by Type:**

| Error Type     | Help Message                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Authentication | "Check that your SSH key is correct or try entering the password."                             |
| Network        | "Check that the server is reachable and the SSH port is accessible."                           |
| Host Key       | "SSH host key verification failed. The server may have been rebuilt or compromised."           |
| WebSocket      | "The SSH WebSocket service (submarines-sshws) may not be running. Contact your administrator." |
| Generic        | "Please verify your connection settings and try again."                                        |

**Files Modified:**

- ✅ `flagship/resources/js/components/servers/ssh-terminal.tsx` - All improvements implemented
- ⏳ `submarines/internal/sshws/handler.go` - Backend error messages already clear
- ⏳ `submarines/internal/sshws/crypto.go` - Decryption errors already handled

**User Experience Flow:**

1. **Before Connection:**

   - Status: Disconnected badge
   - Password prompt visible
   - "Connect to SSH Terminal" button

2. **During Connection:**

   - Status: Connecting badge with spinner
   - Button shows "Connecting..."

3. **Connection Success:**

   - Status: Connected badge (green)
   - Terminal receives focus
   - Password prompt hidden

4. **Connection Error:**

   - Status: Connection Failed badge (red)
   - Toast with specific error and help
   - Password prompt remains visible
   - User can fix issue and try again

5. **Disconnection:**
   - Status: Disconnected badge
   - Amber warning box appears
   - Clear "Reconnect to Server" button
   - Terminal shows closure message

**Next Steps (if needed):**

- Monitor error messages from production usage
- Add more specific error handling based on user feedback
- Consider logging client-side errors for debugging

### 4.2 Test Multiple Simultaneous Connections

**Status:** ⏸️ NOT NEEDED (October 2025)
**Priority:** Low (Deferred indefinitely)
**Description:** Load testing for multiple concurrent SSH sessions.

**Decision:** Load testing is not needed at this stage. The service is designed to handle typical production loads (10-50 concurrent sessions). Advanced load testing would only be necessary if the service experiences performance issues in production, which is not expected for the foreseeable future.

**If Load Testing Becomes Necessary (Future Reference):**

Testing would involve:
- Load test with 10, 50, 100 concurrent WebSocket connections
- Verify no connection leaks
- Check memory usage under load
- Test connection limits (file descriptors, etc.)
- Benchmark throughput (KB/s per session)

Tools:
- Go benchmarking: `go test -bench`
- WebSocket load testing: `github.com/tsenart/vegeta` or custom Go script
- Monitor with: `docker stats submarines-sshws`

Files to create:
- `submarines/internal/sshws/handler_test.go` - Unit tests
- `submarines/test/load/websocket_load_test.go` - Load tests

---

## Priority 5: Advanced Features (Deferred)

**Status:** ⏸️ DEFERRED
**Priority:** Low (Future enhancements only)
**Description:** Advanced features that are not currently needed but may be implemented in the future if there is demand.

### 5.1 Add Session Sharing (Optional)

**Status:** Deferred
**Description:** Allow multiple users to view/collaborate on the same SSH session.

**Use Cases:**
- Training: Instructor shows commands to students
- Troubleshooting: Expert helps junior admin
- Pair programming on remote servers

**Implementation:**
- Broadcast SSH output to multiple WebSocket clients
- Control: Only one user can type (session owner)
- View-only mode for observers
- Session invitation/access control

### 5.2 Add Session Recording Playback Speed Control

**Status:** Deferred
**Description:** Allow 1x, 2x, 4x playback speed when reviewing recordings.

**Note:** Requires Priority 2.2 (Session Recording) to be implemented first.

### 5.3 Add Command History Extraction

**Status:** Deferred
**Description:** Extract list of commands run during session for quick review.

**Note:** Difficult to implement reliably due to terminal control sequences, multi-line commands, etc. Would require sophisticated parsing logic.

---

## Migration Notes

### Breaking Changes

None expected - these are all additive features.

### Database Migrations Required

- Add `ssh_host_key_fingerprint` to `servers` table
- Create `ssh_sessions` table
- Create `ssh_session_recordings` table

### Configuration Changes

- Add retention policy environment variables
- Add session recording enable/disable flag

---

## Related Documentation

- Main project docs: `/CLAUDE.md`
- SSH terminal implementation: `/docs/ssh-terminal.md`
- Deployment guide: `/docs/DEPLOYMENT.md`
- Database access: `/docs/DATABASE_ACCESS.md`

---

## Notes

**Compliance Requirements:**

- PCI-DSS 3.2: Requires logging of all access to cardholder data
- SOC2: Requires audit trail for privileged access
- HIPAA: Requires tracking who accessed PHI systems

**Privacy Laws:**

- GDPR: Session logs may contain personal data - need retention limits
- CCPA: Users may request deletion of their session logs

**Performance Considerations:**

- Session recordings can grow very large (1 MB per hour is typical)
- Consider object storage (S3) instead of PostgreSQL for recordings
- Implement pagination for session lists
- Add background job for recording compression

---

**Last Updated:** October 24, 2025
**Maintained By:** Node Pulse Team
