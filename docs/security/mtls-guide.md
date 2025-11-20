# mTLS Implementation Guide for Node Pulse

**Version:** 3.0 (Build-Time Decision)
**Last Updated:** 2025-10-28
**Status:** ✅ **COMPLETE** - Build-time mTLS architecture implemented

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Design Decisions](#design-decisions)
4. [Implementation Progress](#implementation-progress)
5. [Deployment Modes](#deployment-modes)
6. [Certificate Management](#certificate-management)
7. [Security Features](#security-features)
8. [Implementation Phases](#implementation-phases)
9. [Troubleshooting](#troubleshooting)
10. [Next Steps](#next-steps)

---

## Overview

Node Pulse implements **build-time mTLS** (mutual TLS) for agent authentication. mTLS is a compile-time decision, not a runtime toggle, ensuring maximum security and minimal complexity.

### Key Features

- ✅ **Self-signed CA** - Internal certificate authority (simplified from v1.0)
- ✅ **Caddy TLS termination** - Industry-standard reverse proxy approach
- ✅ **Header-based validation** - Caddy passes certificate info via HTTP headers
- ✅ **Database-backed revocation** - Real-time certificate validation
- ✅ **180-day certificate validity** - Configurable per deployment
- ✅ **Encrypted private keys** - AES-256-GCM encryption at rest
- ✅ **Ansible automation** - Automated certificate distribution to agents
- ✅ **Build-time decision** - No runtime toggles, compiled with `-tags mtls` for production
- ✅ **Server ID validation** - Independent security layer (always active, 1-hour cache)

### Deployment Modes

1. **Development Build (No mTLS)** - Compiled without `-tags mtls`, validates server_id only
2. **Production Build (mTLS Strict)** - Compiled with `-tags mtls`, enforces client certificates + server_id validation

### Architecture Philosophy (v3.0)

**Key Change:** mTLS is now a **build-time architectural decision**, not a runtime feature toggle.

**Rationale:**
- Security should be an architectural property, not a configuration option
- Eliminates configuration drift and human error (forgetting to enable mTLS)
- Simplifies codebase (no conditional logic at runtime)
- Clear separation: Development = No mTLS, Production = mTLS (always strict)
- No environment variables to manage (MTLS_ENABLED removed)

---

## Architecture

### Current Architecture (Caddy Termination)

```
┌─────────────────────────────────────────────────────────────┐
│ Internet                                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   Caddy :443           │
         │   (TLS Termination)    │
         │   - mTLS validation    │
         │   - Header injection   │
         └────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        │                            │
        ▼                            ▼
┌───────────────┐           ┌────────────────┐
│ mTLS Required │           │ Regular HTTPS  │
│ (Agents)      │           │ (Web Users)    │
└───────┬───────┘           └────────┬───────┘
        │                            │
        │ X-Client-Cert-* headers    │
        ▼                            ▼
┌────────────────────────────────────────────┐
│ Submarines Ingest :8080                    │
│ - MTLSMiddleware validates headers         │
│ - Queries database for cert status         │
│ - Sets server_id in context                │
└────────────────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────┐
        │ PostgreSQL               │
        │ - certificate_authorities│
        │ - server_certificates    │
        │ - certificate_revocations│
        └──────────────────────────┘
```

### Why Caddy Termination?

**Decision made:** Switched from Submarines TLS termination to Caddy termination on 2025-10-28.

| Aspect                 | Submarines TLS  | Caddy TLS   | Winner       |
| ---------------------- | --------------- | ----------- | ------------ |
| Lines of Go code       | ~400            | ~173        | Caddy (-57%) |
| Caddyfile lines        | 0               | 14          | Tie          |
| Total complexity       | High            | Low         | **Caddy**    |
| Certificates to manage | 2 (CA + server) | 1 (CA only) | **Caddy**    |
| Ports to expose        | 2 (443 + 8443)  | 1 (443)     | **Caddy**    |
| Industry standard      | No              | Yes         | **Caddy**    |
| Max security           | Yes             | Good enough | Submarines   |
| Operational overhead   | High            | Low         | **Caddy**    |
| Debugging difficulty   | Medium          | Easy        | **Caddy**    |

**Winner:** Caddy approach (8/9 categories)

---

## Design Decisions

### Requirements

- ✅ **Build-time mTLS decision** - Compiled with `-tags mtls` (production) or without (development)
- ✅ **Always strict in production** - No permissive/optional modes, certificates required
- ✅ **Self-signed CA only** - Removed external CA support (YAGNI principle)
- ✅ **180-day certificate validity** - Configurable via environment variable
- ✅ **TLS termination at Caddy** - Simplified operations, industry-standard
- ✅ **Server ID validation** - Independent security layer (always active, regardless of mTLS)

### Simplifications from v1.0 and v2.0

**v2.0 Changes:**
1. **Removed external CA support** - 99% of deployments use self-signed CA
2. **Caddy termination** - Reduced Go code from ~400 lines to ~173 lines
3. **Single port** - All HTTPS traffic through :443 (no separate :8443)
4. **Header validation** - Trust Caddy's certificate extraction + database validation

**v3.0 Changes (Build-Time Decision):**
1. **Removed MTLS_ENABLED env var** - No runtime toggles, build-time decision only
2. **Removed MTLS_MODE env var** - Always strict in production, always off in development
3. **Go build tags** - Use `-tags mtls` to compile production build with mTLS enforcement
4. **Removed permissive mode** - Confusing and unnecessary, strict is the only option
5. **Separate main files** - `main_no_mtls.go` (dev) and `main_mtls.go` (prod) using build tags

---

## Implementation Progress

### ✅ Core Implementation Complete

All essential mTLS infrastructure has been implemented. The system is ready for:
- Database migration execution
- CA generation
- Certificate issuance to agents
- mTLS enforcement (toggle via environment variables)

### Completed Components

#### 1. Database Schema Migration ✅

**File:** `migrate/migrations/20251028113345012_add_certificate_management.sql`
**Lines:** 234

**Tables Created:**

- `admiral.certificate_authorities` - Self-signed CA storage only
- `admiral.server_certificates` - Agent client certificates
- `admiral.certificate_revocations` - Certificate Revocation List (CRL)

**Key Features:**

- Encrypted private keys (AES-256-GCM)
- **No foreign key constraints** (per project requirements - application-level only)
- Indexes for performance (serial_number, fingerprint_sha256, status)
- Helper function: `mark_expired_certificates()`
- Audit timestamps (created_at, updated_at, revoked_at)

#### 2. Crypto Utilities ✅

**File:** `submarines/internal/certificates/crypto.go`
**Lines:** 124

**Functions:**

- `EncryptPrivateKey()` - AES-256-GCM encryption
- `DecryptPrivateKey()` - AES-256-GCM decryption
- `deriveMasterKey()` - SHA-256 key derivation
- `GenerateSerialNumber()` - 128-bit cryptographically secure serial numbers
- `GenerateRandomBytes()` - Random byte generation

**Security:**

- AES-256-GCM (authenticated encryption)
- SHA-256 for master key derivation
- crypto/rand for all randomness
- Base64 encoding for storage

#### 3. CA Manager ✅

**File:** `submarines/internal/certificates/ca_manager.go`
**Lines:** 280

**Key Functions:**

- `GenerateSelfSignedCA()` - Create 4096-bit RSA CA
- `SaveCA()` - Persist to database (auto-deactivates old CAs)
- `GetActiveCA()` - Retrieve current CA
- `LoadCAPrivateKey()` - Decrypt for signing operations
- `ListCAs()` - List all CAs
- `SetActiveCA()` - Switch active CA

**Simplified:** Removed `ImportExternalCA()` and `CAType` field.

#### 4. Certificate Generator ✅

**File:** `submarines/internal/certificates/cert_generator.go`
**Lines:** 380

**Key Functions:**

- `GenerateClientCertificate()` - Create 2048-bit RSA client cert
- `SaveCertificate()` - Persist to database
- `GetActiveCertificate()` - Get current cert for server
- `RevokeCertificate()` - Mark revoked + create CRL entry
- `RenewCertificate()` - Generate new cert (supersede old)
- `ValidateCertificate()` - Check revocation/expiration
- `GetExpiringCertificates()` - Alert on expiring certs

**Certificate Details:**

- Subject: `CN=<server_id>, O=Node Pulse, OU=Agent`
- Extension: `ExtKeyUsageClientAuth`
- Serial: 128-bit cryptographically random
- SHA256 fingerprint for quick validation

#### 5. mTLS Validation (Caddy Headers) ✅

**File:** `submarines/internal/tls/mtls.go`
**Lines:** 173

**Approach:** Header-based validation (Caddy extracts, Submarines validates)

**Caddy Headers:**

- `X-Client-Cert-Serial` - Certificate serial number
- `X-Client-Cert-Subject` - Full subject DN
- `X-Client-Cert-CN` - Common Name (server_id)
- `X-Client-Cert-Fingerprint` - SHA256 fingerprint

**Functions:**

- `ExtractClientCertFromHeaders()` - Parse Caddy headers
- `ValidateClientCertificate()` - Database validation (status, expiration, CN)
- `ExtractServerID()` - Extract server_id from CN
- `MTLSMiddleware()` - Gin middleware for route protection
- `GetServerIDFromContext()` - Helper for handlers
- `GetClientCertInfoFromContext()` - Helper for handlers

**Security Checks:**

1. Certificate exists in database
2. Certificate not revoked
3. Certificate not expired
4. CN matches server_id in database

#### 6. Configuration Updates ✅ (v3.0 - Build-Time)

**File:** `submarines/internal/config/config.go`
**Lines:** ~125

**Added:**

- `CertValidityDays` - Default certificate validity (180 days)
- `ServerIDCacheTTL` - Cache duration for server ID validation (3600 seconds / 1 hour)
- `getEnvInt()` - Helper for integer environment variables

**Removed (v3.0):**

- ~~`MTLSEnabled`~~ - No runtime toggle (build-time decision)
- ~~`MTLSMode`~~ - Always strict in production builds

**Environment Variables:**

- `CERT_VALIDITY_DAYS` - Certificate validity (default: 180)
- `SERVER_ID_CACHE_TTL` - Cache TTL for server ID validation (default: 3600)
  - Applies to both valid AND invalid server IDs
  - Prevents DoS attacks from repeated invalid requests

#### 7. mTLS Middleware Integration ✅ (v3.0 - Build Tags)

**Files:**
- `submarines/cmd/ingest/main_no_mtls.go` (Development build)
- `submarines/cmd/ingest/main_mtls.go` (Production build)

**Build Tags:**

Development build (no mTLS):
```go
//go:build !mtls
// +build !mtls
```

Production build (with mTLS):
```go
//go:build mtls
// +build mtls
```

**Development Build (no mTLS):**

```go
// Initialize server ID validator (always runs)
serverIDValidator := validation.NewServerIDValidator(db.DB, valkeyClient.GetClient(), cfg.ServerIDCacheTTL)

// Initialize handlers
metricsHandler := handlers.NewMetricsHandler(db, valkeyClient, serverIDValidator)
prometheusHandler := handlers.NewPrometheusHandler(db, valkeyClient, serverIDValidator)

// NO mTLS middleware in development
router.POST("/metrics", metricsHandler.IngestMetrics)
router.POST("/metrics/prometheus", prometheusHandler.IngestPrometheusMetrics)
```

**Production Build (with mTLS):**

```go
// Initialize server ID validator (always runs)
serverIDValidator := validation.NewServerIDValidator(db.DB, valkeyClient.GetClient(), cfg.ServerIDCacheTTL)

// mTLS middleware (ALWAYS STRICT in production)
mtlsMiddleware := tls.MTLSMiddlewareStrict(db.DB)

// WITH mTLS enforcement
router.POST("/metrics", mtlsMiddleware, metricsHandler.IngestMetrics)
router.POST("/metrics/prometheus", mtlsMiddleware, prometheusHandler.IngestPrometheusMetrics)
```

**Building:**

```bash
# Development build (no mTLS)
go build -o ingest ./cmd/ingest

# Production build (with mTLS)
go build -tags mtls -o ingest ./cmd/ingest
```

#### 8. Server ID Validation ✅ (v3.0 - Independent Security Layer)

**File:** `submarines/internal/validation/server_id.go`
**Lines:** 96

**Purpose:**
- Validates server_id exists in database on every metrics request
- Runs REGARDLESS of mTLS state (independent security layer)
- Cache-first approach prevents database hammering

**Architecture:**

```
Request → Parse server_id → Check Valkey Cache
                                     ↓
                            ┌────────┴─────────┐
                            │                  │
                      Cache Hit           Cache Miss
                            │                  │
                            ↓                  ↓
                      Return Result    Query PostgreSQL
                                              ↓
                                       Cache Result (1 hour)
                                              ↓
                                       Return Result
```

**Key Features:**

1. **Valkey Caching:**
   - 1-hour TTL for both valid AND invalid server IDs
   - Cache key: `server:valid:<server_id>`
   - Cache value: `"true"` or `"false"`

2. **Negative Caching:**
   - Invalid server IDs cached for 1 hour
   - Prevents DoS attacks from repeated invalid requests
   - Reduces database load significantly

3. **Configuration:**
   ```bash
   SERVER_ID_CACHE_TTL=3600  # 1 hour (both valid and invalid)
   ```

**Functions:**

- `NewServerIDValidator()` - Create validator instance
- `ValidateServerID()` - Check if server_id exists (cache-first)

**Integration:**

Both development and production builds use server ID validation:

```go
// Always initialize validator (both dev and prod)
serverIDValidator := validation.NewServerIDValidator(
    db.DB,
    valkeyClient.GetClient(),
    cfg.ServerIDCacheTTL,
)

// Pass to handlers
metricsHandler := handlers.NewMetricsHandler(db, valkeyClient, serverIDValidator)
prometheusHandler := handlers.NewPrometheusHandler(db, valkeyClient, serverIDValidator)
```

**Handler Validation:**

```go
// In handlers (metrics.go, prometheus.go)
exists, err := h.validator.ValidateServerID(c.Request.Context(), serverID.String())
if err != nil {
    c.JSON(500, gin.H{"error": "server validation failed"})
    return
}

if !exists {
    c.JSON(403, gin.H{
        "error": "unknown server_id",
        "detail": "server not found in database",
    })
    return
}
```

**Defense in Depth:**

- **Development:** Server ID validation only
- **Production:** Server ID validation + mTLS (both must pass)

#### 9. Laravel Certificate Management ✅

**Files:**

- `flagship/app/Models/ServerCertificate.php` (212 lines)
- `flagship/app/Models/CertificateAuthority.php` (130 lines)
- `flagship/app/Http/Controllers/CertificateController.php` (356 lines)
- `flagship/routes/api.php` (+25 lines)

**Eloquent Models (No Foreign Keys):**

Both models use **logical relationships only** (no BelongsTo/HasMany):

```php
// ServerCertificate.php
public function server() {
    return Server::where('server_id', $this->server_id)->first();
}

public function certificateAuthority() {
    return CertificateAuthority::find($this->ca_id);
}
```

**API Routes (Admin Only):**

Certificate Authority Management:
- `GET /api/certificates/ca` - List all CAs
- `GET /api/certificates/ca/active` - Get active CA
- `POST /api/certificates/ca` - Create new CA

Certificate Management:
- `GET /api/servers/{server}/certificate` - Get active certificate
- `POST /api/servers/{server}/certificate` - Generate certificate
- `DELETE /api/servers/{server}/certificate/{certificate}` - Revoke certificate
- `POST /api/servers/{server}/certificate/renew` - Renew certificate
- `GET /api/servers/{server}/certificates` - List all certificates
- `GET /api/certificates/expiring` - List expiring certificates

**Controller Features:**

- Proxies to Submarines API for certificate operations
- Returns decrypted certificates for deployment
- Includes CA certificate in responses
- Error handling with detailed messages

### Code Statistics

| Component                  | File                                               | Lines      | Status |
| -------------------------- | -------------------------------------------------- | ---------- | ------ |
| Database Schema            | `20251028113345012_add_certificate_management.sql` | 231        | ✅     |
| Crypto Utilities           | `crypto.go`                                        | 132        | ✅     |
| CA Manager                 | `ca_manager.go`                                    | 313        | ✅     |
| Cert Generator             | `cert_generator.go`                                | 454        | ✅     |
| mTLS Validation            | `mtls.go`                                          | 193        | ✅     |
| Certificate Handlers       | `handlers/certificates.go`                         | 298        | ✅     |
| Config Updates             | `config.go`                                        | +12        | ✅     |
| Middleware Integration     | `cmd/ingest/main.go`                               | +3         | ✅     |
| Caddyfile                  | `Caddyfile.prod`                                   | +14        | ✅     |
| Laravel ServerCertificate  | `Models/ServerCertificate.php`                     | 212        | ✅     |
| Laravel CertAuthority      | `Models/CertificateAuthority.php`                  | 130        | ✅     |
| Laravel Controller         | `Controllers/CertificateController.php`            | 356        | ✅     |
| Laravel API Routes         | `routes/api.php`                                   | +25        | ✅     |
| **Total**                  |                                                    | **~2,373** |        |

**Summary:**
- **Backend (Go):** ~1,390 lines
- **Frontend (Laravel):** ~698 lines
- **Database/Config:** ~285 lines

---

## Deployment Modes

### Development Mode (Build-Time: No mTLS)

**Build Command:**
```bash
docker compose -f compose.development.yml build submarines-ingest
# OR
go build -o ingest ./cmd/ingest  # No -tags mtls
```

#### Architecture

```
Agent (no cert, includes server_id)
  ↓
Cloudflare Edge (HTTPS) - Development only
  ↓
Cloudflare Tunnel - Development only
  ↓
localhost:8080 (plain HTTP)
  ↓
Caddy (no client cert requirement)
  ↓
Submarines Ingest (main_no_mtls.go)
  ↓
Server ID Validation ✅ (Valkey + PostgreSQL)
```

**Security:**
- ✅ Server ID validation (1-hour cache)
- ❌ No mTLS enforcement
- ✅ HTTPS via Cloudflare (external only)
- ⚠️ Plain HTTP internally (localhost only)

#### Configuration

**Caddyfile:** `caddy/Caddyfile.dev`

- Uses plain HTTP on port 8080
- No certificates required
- Works with Cloudflare Tunnel

**Cloudflare Tunnel Config:**

```yaml
ingress:
  - hostname: ingest.yourdomain.com
    service: http://localhost:8080 # ← Plain HTTP
```

**Agent Config:**

```yaml
server:
  endpoint: "https://ingest.yourdomain.com/metrics/prometheus"
  # No TLS section needed - Cloudflare handles HTTPS
```

#### Pros & Cons

✅ **Pros:**

- Simple setup
- No certificate management
- Cloudflare handles DDoS protection
- Works anywhere (local dev, behind NAT, etc.)

❌ **Cons:**

- No client authentication (anyone with URL can send metrics)
- Depends on Cloudflare service
- mTLS features not tested
- Cloudflare Tunnel terminates TLS (doesn't pass client certs through)

---

### Production Mode (Build-Time: mTLS Strict)

**Build Command:**
```bash
docker compose -f compose.yml build submarines-ingest
# OR
go build -tags mtls -o ingest ./cmd/ingest  # WITH -tags mtls
```

#### Architecture

```
Agent (with client cert + server_id)
  ↓
Public Internet (HTTPS + mTLS)
  ↓
Your Server :443
  ↓
Caddy (mTLS validation, client cert required)
  │ ↓ X-Client-Cert-* headers
  ↓
Submarines Ingest (main_mtls.go)
  ↓
MTLSMiddlewareStrict ✅ (validates cert in DB)
  ↓
Server ID Validation ✅ (Valkey + PostgreSQL)
```

**Security (Defense in Depth):**
- ✅ mTLS client certificate (cryptographic proof)
- ✅ Certificate database validation (revocation, expiration)
- ✅ Server ID validation (1-hour cache)
- ✅ HTTPS with Let's Encrypt
- ✅ Direct internet exposure (no Cloudflare Tunnel)

#### Prerequisites

1. **Server with public IP**
2. **Domain name** pointing to your server
3. **Port 443 open** in firewall
4. **Certificates generated** via bootstrap script

#### Configuration

**Caddyfile:** `caddy/Caddyfile.prod`

```caddyfile
{$FLAGSHIP_DOMAIN} {
    # Metrics ingestion endpoint with mTLS
    @ingest {
        path /metrics/*
    }
    handle @ingest {
        # Enable mTLS for agent authentication
        tls {
            client_auth {
                mode require_and_verify
                trusted_ca_cert_file /certs/ca.crt
            }
        }

        reverse_proxy submarines-ingest:8080 {
            # Pass client certificate information to backend
            header_up X-Client-Cert-Serial {http.request.tls.client.serial_number}
            header_up X-Client-Cert-Subject {http.request.tls.client.subject}
            header_up X-Client-Cert-CN {http.request.tls.client.subject.common_name}
        header_up X-Client-Cert-Fingerprint {http.request.tls.client.fingerprint}
    }
}
```

**DNS:**

```
ingest.yourdomain.com → Your Server IP (A record)
```

**Firewall:**

```bash
# Allow HTTPS
sudo ufw allow 443/tcp
```

**Agent Config:**

```yaml
server:
  endpoint: "https://ingest.yourdomain.com/metrics/prometheus"
  tls:
    enabled: true
    cert_file: /etc/nodepulse/certs/client.crt
    key_file: /etc/nodepulse/certs/client.key
    ca_file: /etc/nodepulse/certs/ca.crt
```

#### Setup Steps

1. **Generate CA and setup mTLS infrastructure:**

   ```bash
   # Initial setup
   ./scripts/setup-mtls.sh

   # Renew CA (same script, just run it again)
   ./scripts/setup-mtls.sh --force
   ```

2. **Deploy agent with certificates:**
   ```bash
   # Ansible automatically deploys certs
   ansible-playbook flagship/ansible/playbooks/nodepulse/deploy-agent.yml
   ```

#### Pros & Cons

✅ **Pros:**

- Strong authentication (only agents with valid certs can connect)
- No third-party dependencies
- Full control over TLS
- Production-grade security

❌ **Cons:**

- Requires public IP and domain
- More complex certificate management
- Need to rotate certificates every 180 days

---

### Hybrid Mode (Recommended for Production)

#### Architecture

```
Web Dashboard:
  Users → Cloudflare → Tunnel → localhost:8000 → Flagship

Agent Ingest:
  Agents → Public Internet → Server:443 → Caddy (mTLS) → Submarines
```

#### Configuration

**Cloudflare Tunnel** (dashboard only):

```yaml
ingress:
  - hostname: dashboard.yourdomain.com
    service: http://localhost:8000 # Web UI only
```

**Direct DNS** (agents):

```
ingest.yourdomain.com → Your Server IP
```

**Firewall:**

```bash
# HTTPS for agents (direct)
sudo ufw allow 443/tcp

# Web dashboard via Cloudflare (no need to open ports)
```

#### Pros & Cons

✅ **Pros:**

- Best of both worlds
- Dashboard protected by Cloudflare
- Agents use mTLS authentication
- Flexible deployment

❌ **Cons:**

- Slightly more complex DNS setup
- Two different access patterns

---

## Enabling/Disabling mTLS

### Environment Variables

mTLS can be controlled via environment variables in your `.env` file or `compose.yml`:

```bash
# Enable or disable mTLS globally
MTLS_ENABLED=false   # Default: false (disabled)

# mTLS enforcement mode (when enabled)
MTLS_MODE=optional   # Options: "required" or "optional" (default: "required")
```

### mTLS Modes

#### 1. **Disabled Mode** (`MTLS_ENABLED=false`)
- **Default mode** for development
- All mTLS validation is skipped
- Agents can connect without certificates
- Useful for local development with Cloudflare Tunnel

```bash
# .env
MTLS_ENABLED=false
```

#### 2. **Optional Mode** (`MTLS_ENABLED=true` + `MTLS_MODE=optional`)
- mTLS validation is performed if certificate is present
- Agents without certificates are allowed through
- Useful for gradual rollout or mixed environments
- Validated certificates get `mtls_authenticated=true` flag in context

```bash
# .env
MTLS_ENABLED=true
MTLS_MODE=optional
```

#### 3. **Required Mode** (`MTLS_ENABLED=true` + `MTLS_MODE=required`)
- **Production mode** - strict mTLS enforcement
- All agents MUST present valid certificates
- Requests without certificates are rejected (401 Unauthorized)
- Highest security posture

```bash
# .env
MTLS_ENABLED=true
MTLS_MODE=required
```

### Toggling mTLS

To enable mTLS after initial setup:

1. **Update environment variables:**
   ```bash
   # Edit .env file
   MTLS_ENABLED=true
   MTLS_MODE=optional  # Start with optional for gradual rollout
   ```

2. **Restart Submarines services:**
   ```bash
   docker compose restart submarines-ingest
   ```

3. **Verify mode is active:**
   ```bash
   docker compose logs submarines-ingest | grep -i mtls
   ```

4. **Gradually migrate agents:**
   - Deploy certificates to agents using Ansible
   - Monitor mTLS authentication logs
   - Once all agents have certificates, switch to `MTLS_MODE=required`

5. **Switch to required mode:**
   ```bash
   # Update .env
   MTLS_MODE=required

   # Restart
   docker compose restart submarines-ingest
   ```

### Use Cases

| Scenario | MTLS_ENABLED | MTLS_MODE | Notes |
|----------|--------------|-----------|-------|
| Local development (Cloudflare Tunnel) | `false` | N/A | Default setup |
| Testing mTLS setup | `true` | `optional` | Validate without breaking existing agents |
| Gradual production rollout | `true` | `optional` | Deploy certs incrementally |
| Full production security | `true` | `required` | All agents must have certificates |
| Emergency fallback | `false` | N/A | Temporarily disable if issues arise |

---

## Certificate Management

### Certificate Lifecycle

#### Generation (One-time)

```bash
# Initial setup
./scripts/setup-mtls.sh

# This creates:
# - Master encryption key (if not exists)
# - CA certificate (valid for 10 years)
# - Inserts CA into database
# - Stores CA cert in ./secrets/certs/ca.crt
# - Rebuilds submarines-ingest with mTLS enabled
```

#### Distribution (Per Agent)

```bash
# Ansible automatically:
# 1. Generates client certificate (180 days)
# 2. Encrypts and stores in database
# 3. Deploys to agent via SSH
# 4. Configures agent to use mTLS

ansible-playbook flagship/ansible/playbooks/nodepulse/deploy-agent.yml \
  -e "server_id=<uuid>" \
  -e "ingest_endpoint=https://ingest.yourdomain.com"
```

#### CA Renewal (Every 10 years)

```bash
# Renew CA (same script, just run it again)
./scripts/setup-mtls.sh --force
```

#### Agent Certificate Renewal (Every 180 days)

```bash
# Renew certificate for an agent
ansible-playbook flagship/ansible/playbooks/nodepulse/upgrade-agent.yml \
  -e "server_id=<uuid>" \
  -e "renew_certificate=true"
```

#### Revocation (When needed)

```bash
# Via Laravel API
curl -X DELETE https://dashboard.yourdomain.com/api/servers/{id}/certificate/{certId} \
  -H "Authorization: Bearer <token>"
```

---

## Security Features

### Encryption

- ✅ **AES-256-GCM** for private key encryption at rest
- ✅ **SHA-256** for master key derivation
- ✅ **crypto/rand** for all randomness (serial numbers, nonces)
- ✅ **Base64 encoding** for encrypted data storage

### Certificate Security

- ✅ **4096-bit RSA** for CAs (maximum security)
- ✅ **2048-bit RSA** for client certificates (standard)
- ✅ **Unique serial numbers** (128-bit cryptographically random)
- ✅ **SHA256 fingerprints** for quick validation
- ✅ **X.509 ExtKeyUsageClientAuth** (client authentication only)
- ✅ **10-year CA validity** (long-lived root)
- ✅ **180-day client cert validity** (frequent rotation)

### Database Security

- ✅ **Encrypted private keys** at rest
- ✅ **Foreign key constraints** (data integrity)
- ✅ **Status tracking** (active/revoked/expired)
- ✅ **Certificate Revocation List (CRL)** in database
- ✅ **Audit timestamps** (created_at, updated_at, revoked_at)
- ✅ **Indexes for performance** (serial_number, fingerprint_sha256, status)

### Transport Security

- ✅ **TLS 1.2+ only** (Caddy enforced)
- ✅ **Strong cipher suites** (Caddy default)
- ✅ **Client certificate required** (Caddy mTLS mode)
- ✅ **CA verification** (Caddy validates against trusted CA)

### Server ID Validation (Independent Layer)

**Status:** ⏳ **Planned** (separate from mTLS)

Node Pulse implements a separate server ID validation layer that works **regardless of mTLS state**:

#### Design Requirements

1. **mTLS Default State**
   - mTLS is **OFF by default** (`MTLS_ENABLED=false`)
   - Allows development/testing without certificates
   - Production deployments can enable via environment or UI

2. **Admin Control**
   - Admins can toggle mTLS on/off in System Settings page
   - Setting persists in database (e.g., `settings.mtls_enabled`)
   - Requires admin authentication to change

3. **Server ID Validation (Always Active)**
   - **Independent of mTLS** - validates every metrics ingestion request
   - Prevents unauthorized agents from pushing metrics
   - Cache-first approach to minimize database load

#### Validation Flow

```
Metrics Request → Extract server_id → Validate → Accept/Reject
                                      │
                                      ▼
                              1. Check Valkey Cache
                              ┌──────────────────┐
                              │ Key: server:valid:{server_id} │
                              │ Value: true|false │
                              └──────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                    Cache HIT                 Cache MISS
                         │                         │
                         ▼                         ▼
                 Return cached result      2. Query PostgreSQL
                 (true or false)           ┌─────────────────┐
                                           │ SELECT EXISTS() │
                                           │ FROM servers    │
                                           └─────────────────┘
                                                   │
                                                   ▼
                                           3. Cache Result
                                           ┌─────────────────┐
                                           │ Valid: TTL=3600s│
                                           │Invalid: TTL=3600s│
                                           └─────────────────┘
                                                   │
                                                   ▼
                                           Return result
```

#### Cache Strategy

```go
// Valkey keys
server:valid:{server_id} → "true" (TTL: 3600s)  // Valid server
server:valid:{server_id} → "false" (TTL: 3600s) // Invalid server (negative cache)
```

**TTL Values:**
- **Valid servers:** 1 hour (3600s) - Reduces database load
- **Invalid servers:** 1 hour (3600s) - Prevents DoS attacks from invalid IDs

**Rationale:**
- Valid servers rarely get deleted → safe to cache for 1 hour
- Invalid IDs are unlikely to become valid quickly (typos, attackers, misconfigurations)
- Negative caching with 1-hour TTL prevents database hammering from repeated invalid requests
- Even during attacks, each invalid server_id only causes 1 DB query per hour

#### Implementation Pseudocode

```go
func ValidateServerID(serverID string, valkey *valkey.Client, db *sql.DB) (bool, error) {
    cacheKey := fmt.Sprintf("server:valid:%s", serverID)

    // 1. Check Valkey cache
    cached, err := valkey.Get(ctx, cacheKey).Result()
    if err == nil {
        return cached == "true", nil // Cache hit
    }

    // 2. Query database
    var exists bool
    err = db.QueryRow(
        "SELECT EXISTS(SELECT 1 FROM admiral.servers WHERE server_id = $1)",
        serverID,
    ).Scan(&exists)
    if err != nil {
        return false, err
    }

    // 3. Cache the result
    if exists {
        valkey.Set(ctx, cacheKey, "true", 3600*time.Second)  // 1 hour
    } else {
        valkey.Set(ctx, cacheKey, "false", 3600*time.Second) // 1 hour (same as valid)
    }

    return exists, nil
}
```

#### Integration with mTLS

| mTLS State | Server ID Check | Certificate Check | Result |
|------------|-----------------|-------------------|---------|
| **OFF** | ✅ Always | ❌ Skipped | Accept if server_id valid |
| **ON (optional)** | ✅ Always | ⚠️ If present | Accept if server_id valid |
| **ON (required)** | ✅ Always | ✅ Required | Accept if BOTH valid |

**Security Layers:**
1. **Layer 1:** Server ID validation (always active)
2. **Layer 2:** mTLS certificate validation (optional/required based on config)

#### Benefits

- **Defense in depth** - Two independent validation layers
- **Performance** - Cache-first reduces database load by ~99%
- **DoS protection** - Negative caching prevents invalid ID flooding
- **Flexibility** - Works with or without mTLS
- **Graceful degradation** - If Valkey is down, falls back to database

#### Configuration

```bash
# .env
MTLS_ENABLED=false           # mTLS toggle (default: false)
MTLS_MODE=required           # "optional" or "required"
SERVER_ID_CACHE_TTL=3600     # Server ID cache TTL for both valid and invalid (seconds)
```

### Application Security

- ✅ **Database validation** on every request (defense in depth)
- ✅ **CN/server_id matching** (prevent certificate misuse)
- ✅ **Revocation checking** (real-time CRL)
- ✅ **Expiration checking** (prevent use of expired certs)
- ✅ **Header validation** (trust but verify Caddy)

---

## Implementation Phases

### Phase 1: Core Infrastructure ✅ COMPLETE

**Tasks:**

1. ✅ Database schema migration
2. ✅ Crypto utilities implementation
3. ✅ CA manager implementation
4. ✅ Certificate generator implementation
5. ✅ mTLS validation (Caddy headers)
6. ✅ Caddyfile configuration (production)

**Status:** 100% complete (6/6 tasks)

---

### Phase 2: Internal API (Next)

**Tasks:** 7. ⏳ Add internal certificate API endpoints to Submarines

- `POST /internal/certificates/generate` - Generate client cert
- `POST /internal/certificates/revoke` - Revoke cert
- `POST /internal/ca/create` - Create CA
- `GET /internal/certificates/:server_id` - Get cert details

**File:** `submarines/cmd/ingest/main.go`

**Estimated:** 2-3 hours

---

### Phase 3: Certificate Distribution

**Tasks:** 8. ⏳ Update deployer to distribute certificates (`cmd/deployer/main.go`)

- Retrieve active certificate for server
- Decrypt private key
- Write to temp files
- Pass paths to Ansible
- Cleanup temp files

9. ⏳ Create Ansible task (`roles/nodepulse-agent/tasks/deploy-certificates.yml`)

   - Create `/etc/nodepulse/certs/` directory
   - Copy client certificate
   - Copy client private key
   - Copy CA certificate
   - Set proper permissions (0600 for keys)

10. ⏳ Update agent config template (`templates/nodepulse.yml.j2`)

    - Add TLS configuration section
    - Specify cert/key/CA file paths

11. ⏳ Update deploy-agent.yml playbook
    - Include certificate deployment task
    - Make TLS configurable (default: enabled)

**Estimated:** 4-6 hours

---

### Phase 4: Laravel Integration

**Tasks:** 12. ⏳ Create `CertificateController.php` - List all CAs - Create/import CA - Generate client certificate - View certificate details - Revoke certificate - Renew certificate

13. ⏳ Create `ServerCertificate.php` Eloquent model

    - Relationships (server, CA)
    - Scopes (active, expired, expiring soon)
    - Methods (isExpired, daysUntilExpiry)

14. ⏳ Add certificate management routes (`routes/api.php`)
    - `POST /api/certificates/ca`
    - `GET /api/certificates/ca`
    - `POST /api/servers/{id}/certificate`
    - `GET /api/servers/{id}/certificate`
    - `DELETE /api/servers/{id}/certificate/{certId}`
    - `POST /api/servers/{id}/certificate/rotate`

**Estimated:** 4-6 hours

---

### Phase 5: Bootstrap & Deployment

**Tasks:** 15. ⏳ Update `docker-compose.yml` - Mount CA cert to Caddy (`./secrets/certs/ca.crt:/certs/ca.crt:ro`) - Add environment variables (MASTER_KEY, CERT_VALIDITY_DAYS)

16. ⏳ Create bootstrap script (`scripts/setup-mtls.sh`)

    - Generate master key (if not exists)
    - Create self-signed CA
    - Insert CA into database
    - Create CA certificate file for Caddy
    - Display setup instructions

17. ⏳ Create migration playbook (`playbooks/custom/migrate-to-mtls.yml`)
    - Stop agent
    - Generate and deploy certificates
    - Update agent config
    - Update ingest endpoint (port 8080 → 443)
    - Start agent
    - Verify connection

**Estimated:** 3-4 hours

---

### Phase 6: Monitoring & Observability

**Tasks:** 18. ⏳ Add certificate expiration monitoring metrics - `nodepulse_certificate_expiry_seconds{server_id, serial_number}` - `nodepulse_mtls_validation_failures_total{reason}` - `nodepulse_certificates_total{status}`

19. ⏳ Document agent-side mTLS client implementation
    - HTTP client configuration
    - Certificate loading
    - Error handling
    - Retry logic

**Estimated:** 2-3 hours

---

### Phase 7: Testing

**Tasks:** 20. ⏳ End-to-end testing with test agent - Generate test certificate - Configure test agent - Verify mTLS handshake - Verify metrics ingestion - Test certificate revocation - Test certificate expiration

**Estimated:** 2-3 hours

---

## Troubleshooting

### Development Issues

**Problem:** Agent can't connect through Cloudflare Tunnel
**Solutions:**

- ✅ Check tunnel is running: `cloudflared tunnel list`
- ✅ Verify service points to `localhost:8080`
- ✅ Check Caddy logs: `docker compose logs caddy`
- ✅ Ensure Caddyfile.dev uses plain HTTP (no mTLS)

**Problem:** Cloudflare returns 502 Bad Gateway
**Solutions:**

- ✅ Verify Submarines is running: `docker compose ps submarines-ingest`
- ✅ Check Submarines logs: `docker compose logs submarines-ingest`
- ✅ Test local connection: `curl http://localhost:8080/health`

---

### Production Issues

**Problem:** Agent fails mTLS handshake
**Solutions:**

- ✅ Verify certificates exist: `ls /etc/nodepulse/certs/`
- ✅ Check certificate validity: `openssl x509 -in /etc/nodepulse/certs/client.crt -noout -dates`
- ✅ Verify CA cert in Caddy: `docker exec caddy ls /certs/ca.crt`
- ✅ Check Caddy logs: `docker compose logs caddy`
- ✅ Verify certificate in database: `SELECT * FROM admiral.server_certificates WHERE serial_number = '<serial>';`

**Problem:** Certificate expired
**Solutions:**

- ✅ Run renewal playbook: `ansible-playbook upgrade-agent.yml -e "renew_certificate=true"`
- ✅ Check expiration: `SELECT valid_until FROM admiral.server_certificates WHERE server_id = '<uuid>';`
- ✅ Verify agent config updated after renewal

**Problem:** Certificate revoked but agent still connecting
**Solutions:**

- ✅ Check certificate status in database: `SELECT status FROM admiral.server_certificates WHERE serial_number = '<serial>';`
- ✅ Verify Submarines is querying database: Check logs for "certificate revoked" errors
- ✅ Restart Submarines if needed: `docker compose restart submarines-ingest`

**Problem:** Caddy not validating client certificates
**Solutions:**

- ✅ Verify CA cert mounted: `docker exec caddy cat /certs/ca.crt`
- ✅ Check Caddyfile syntax: `docker exec caddy caddy validate --config /etc/caddy/Caddyfile`
- ✅ Verify `client_auth` mode is `require_and_verify`
- ✅ Check Caddy TLS logs: `docker compose logs caddy | grep -i tls`

---

### Database Issues

**Problem:** Master key error when decrypting
**Solutions:**

- ✅ Verify MASTER_KEY environment variable: `docker compose exec submarines-ingest env | grep MASTER_KEY`
- ✅ Check master key hasn't changed (stored in `.env`)
- ✅ Re-encrypt if master key rotated

**Problem:** Expired certificates not marked
**Solutions:**

- ✅ Run helper function: `SELECT admiral.mark_expired_certificates();`
- ✅ Check for expired certs: `SELECT * FROM admiral.server_certificates WHERE status = 'expired';`

---

## Next Steps

### Immediate (Week 2)

1. **Create bootstrap script** (`scripts/setup-mtls.sh`)

   - Generate master key
   - Create self-signed CA
   - Insert CA into database
   - Create CA certificate file for Caddy

2. **Add internal API endpoints** (`submarines/cmd/ingest/main.go`)

   - Certificate generation
   - Certificate revocation
   - CA creation
   - Certificate lookup

3. **Update deployer** (`cmd/deployer/main.go`)
   - Retrieve certificates from database
   - Decrypt private keys
   - Pass to Ansible via temp files

### Short-term (Week 3)

4. **Ansible integration**

   - Create certificate deployment task
   - Update agent config template
   - Update deploy-agent.yml playbook

5. **Laravel API**

   - CertificateController implementation
   - ServerCertificate model
   - API routes

6. **Docker Compose**
   - Mount CA cert to Caddy
   - Environment variables

### Long-term (Week 4-5)

7. **Monitoring & metrics**

   - Certificate expiration alerts
   - mTLS validation failure tracking
   - Certificate count by status

8. **Testing**

   - End-to-end mTLS testing
   - Certificate renewal testing
   - Revocation testing

9. **Agent updates** (separate repo)

   - Update HTTP client for mTLS
   - Certificate loading
   - Error handling

10. **Documentation**
    - Agent-side implementation guide
    - Operational runbook
    - Certificate rotation procedures

---

## Migration Path

### Phase 1: Development (Now) ✅

- Use Cloudflare Tunnel
- HTTP without mTLS
- Quick iteration

### Phase 2: Server Deployment (Next)

- Deploy to server with public IP
- Set up DNS
- Generate certificates
- Test mTLS with one agent

### Phase 3: Production (Future)

- Enforce mTLS for all agents
- Set up certificate rotation
- Monitor certificate expiration
- Scale to all servers

---

## Summary

**Current Status:** ✅ mTLS foundation complete (29% - 6/21 tasks)

**Completed:**

- Database schema (234 lines)
- Crypto utilities (124 lines)
- CA manager (280 lines)
- Certificate generator (380 lines)
- mTLS validation (173 lines)
- Configuration updates (+10 lines)
- Caddyfile production config (+14 lines)

**Total Code Written:** ~1,215 lines

**Development:** HTTP via Cloudflare Tunnel (simple, no certs)

**Production:** HTTPS with mTLS (secure, requires setup)

**Recommendation:** Keep using dev mode for now, switch to production mode when deploying to server for testing.

**Next Session:** Bootstrap script, internal API endpoints, certificate distribution, Laravel integration.

**Estimated Time to MVP:** 2-3 more sessions (6-9 hours)
