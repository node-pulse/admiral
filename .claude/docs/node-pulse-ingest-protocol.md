# 🧭 Node Pulse Envelope Protocol (NPI v1)

**Status**: Draft 1
**Author**: Yumin
**Version**: 1.0
**Date**: 2025-10-14

---

## 1. Overview

**Node Pulse Envelope Protocol (NPI)** defines a unified, extensible message format used by Node Pulse agents to transmit telemetry, probe results, and security events to a control plane.

NPI is **transport-agnostic** — it can operate over HTTP, WebSocket, gRPC stream, or other reliable protocols. All payloads share a common **Envelope** structure, enabling consistent parsing, storage, and version evolution.

---

## 2. Envelope Structure

Each message sent by an agent consists of a single **Envelope**, which may contain one or more **Items** (individual events).

### 2.1 Example Envelope

```json
{
  "protocol": "npi",
  "version": "1.0",
  "agent": {
    "id": "agt_7Yp2",
    "capabilities": ["metrics", "probe", "sec_log"],
    "labels": {
      "region": "us",
      "env": "prod"
    }
  },
  "seq": 4182,
  "ts": 1739452800123,
  "signature": "v1=8c7f2a...",
  "items": [
    { "type": "heartbeat", "..." },
    { "type": "metrics", "..." },
    { "type": "probe_result", "..." },
    { "type": "sec_log", "..." }
  ]
}
```

### 2.2 Envelope Fields

| Field       | Type    | Required | Description                                             |
| ----------- | ------- | -------- | ------------------------------------------------------- |
| `protocol`  | string  | Yes      | Must be `"npi"`                                         |
| `version`   | string  | Yes      | Protocol version (e.g., `"1.0"`)                        |
| `agent`     | object  | Yes      | Agent metadata (ID, capabilities, labels)               |
| `seq`       | integer | Yes      | Monotonic sequence number per agent (for deduplication) |
| `ts`        | integer | Yes      | Client timestamp (Unix milliseconds)                    |
| `signature` | string  | No       | Optional HMAC signature (`v1=<hex>`)                    |
| `items`     | array   | Yes      | List of individual event objects (minimum 1 item)       |

### 2.3 Agent Metadata

```json
{
  "id": "agt_7Yp2",
  "capabilities": ["metrics", "probe", "sec_log"],
  "labels": {
    "region": "us",
    "env": "prod",
    "datacenter": "us-east-1"
  }
}
```

| Field          | Type   | Required | Description                                         |
| -------------- | ------ | -------- | --------------------------------------------------- |
| `id`           | string | Yes      | Unique agent identifier (e.g., `agt_xxx`)           |
| `capabilities` | array  | No       | List of supported features                          |
| `labels`       | object | No       | Arbitrary key-value metadata for grouping/filtering |

---

## 3. Item Types

Items represent individual events or data points. Each item **must** have a `type` field.

### 3.1 Heartbeat

Minimal periodic signal containing basic host information.

```json
{
  "type": "heartbeat",
  "ts": 1739452800123,
  "host": {
    "hostname": "vm-01",
    "os": "linux",
    "arch": "amd64",
    "uptime_sec": 123456
  },
  "net": {
    "ips": ["10.0.0.2"],
    "tx_kb": 8345,
    "rx_kb": 10234
  }
}
```

**Fields**:

| Field             | Type    | Required | Description                        |
| ----------------- | ------- | -------- | ---------------------------------- |
| `type`            | string  | Yes      | Must be `"heartbeat"`              |
| `ts`              | integer | Yes      | Event timestamp (Unix ms)          |
| `host`            | object  | No       | Host metadata                      |
| `host.hostname`   | string  | No       | Server hostname                    |
| `host.os`         | string  | No       | Operating system (e.g., `"linux"`) |
| `host.arch`       | string  | No       | Architecture (e.g., `"amd64"`)     |
| `host.uptime_sec` | integer | No       | System uptime in seconds           |
| `net`             | object  | No       | Network information                |
| `net.ips`         | array   | No       | IP addresses                       |
| `net.tx_kb`       | integer | No       | Transmitted KB                     |
| `net.rx_kb`       | integer | No       | Received KB                        |

---

### 3.2 Metrics

System resource metrics snapshot.

```json
{
  "type": "metrics",
  "ts": 1739452800123,
  "cpu_pct": 7.2,
  "mem_pct": 61.3,
  "load1": 0.42,
  "disk_used_pct": 71.5,
  "net": {
    "tx_bps": 12000,
    "rx_bps": 18000
  }
}
```

**Fields**:

| Field           | Type    | Required | Description                     |
| --------------- | ------- | -------- | ------------------------------- |
| `type`          | string  | Yes      | Must be `"metrics"`             |
| `ts`            | integer | Yes      | Event timestamp (Unix ms)       |
| `cpu_pct`       | number  | No       | CPU usage percentage (0-100)    |
| `mem_pct`       | number  | No       | Memory usage percentage (0-100) |
| `load1`         | number  | No       | 1-minute load average           |
| `disk_used_pct` | number  | No       | Disk usage percentage (0-100)   |
| `net`           | object  | No       | Network I/O                     |
| `net.tx_bps`    | integer | No       | Upload bytes per second         |
| `net.rx_bps`    | integer | No       | Download bytes per second       |

---

### 3.3 Probe Result

Active probe outcome for HTTP/TCP/ICMP checks.

```json
{
  "type": "probe_result",
  "ts": 1739452801456,
  "probe_id": "tsk_http_123",
  "kind": "http",
  "target": "https://example.com",
  "ok": true,
  "duration_ms": 198,
  "http": {
    "code": 200,
    "tls": true
  }
}
```

**Fields**:

| Field         | Type    | Required | Description                              |
| ------------- | ------- | -------- | ---------------------------------------- |
| `type`        | string  | Yes      | Must be `"probe_result"`                 |
| `ts`          | integer | Yes      | Event timestamp (Unix ms)                |
| `probe_id`    | string  | Yes      | Task/probe identifier                    |
| `kind`        | string  | Yes      | Probe type: `http`, `tcp`, or `icmp`     |
| `target`      | string  | Yes      | Target URL or address                    |
| `ok`          | boolean | Yes      | Whether probe succeeded                  |
| `duration_ms` | integer | No       | Time taken (milliseconds)                |
| `http`        | object  | No       | HTTP-specific data (if `kind` is `http`) |
| `http.code`   | integer | No       | HTTP status code                         |
| `http.tls`    | boolean | No       | Whether TLS was used                     |

---

### 3.4 Security Log

Security-related event, normalized as structured key-value data.

```json
{
  "type": "sec_log",
  "ts": 1739452802100,
  "category": "auth_fail",
  "severity": "warn",
  "summary": "3 SSH failures within 5m",
  "kv": {
    "username": "root",
    "src_ip": "203.0.113.10",
    "count": 3,
    "window_sec": 300
  }
}
```

**Fields**:

| Field      | Type    | Required | Description                         |
| ---------- | ------- | -------- | ----------------------------------- |
| `type`     | string  | Yes      | Must be `"sec_log"`                 |
| `ts`       | integer | Yes      | Event timestamp (Unix ms)           |
| `category` | string  | Yes      | Event category (see below)          |
| `severity` | string  | Yes      | Severity: `info`, `warn`, or `crit` |
| `summary`  | string  | Yes      | Human-readable summary              |
| `kv`       | object  | No       | Category-specific structured data   |

**Category Examples**:

- `auth_fail` — Authentication failures (SSH, sudo, etc.)
- `port_change` — Opened/closed port lists
- `file_hash` — File integrity drift
- `proc_anomaly` — Unexpected process detection
- `fw_event` — Firewall/iptables activity

---

## 4. Transport Layer

### 4.1 HTTP Ingest (Recommended Baseline)

**Endpoint**: `POST /v1/ingest`

**Headers**:

```http
POST /v1/ingest HTTP/1.1
Host: api.nodepulse.io
Content-Type: application/vnd.nodepulse.npi.v1+json
Content-Encoding: gzip
Authorization: Bearer <jwt>
X-NPI-Seq: 4182
X-NPI-Signature: v1=<hex(hmac_sha256(body, agent_secret))>
```

| Header             | Required | Description                             |
| ------------------ | -------- | --------------------------------------- |
| `Content-Type`     | Yes      | `application/vnd.nodepulse.npi.v1+json` |
| `Content-Encoding` | No       | `gzip` for compression                  |
| `Authorization`    | Yes      | `Bearer <jwt>` token                    |
| `X-NPI-Seq`        | Yes      | Sequence number (idempotency)           |
| `X-NPI-Signature`  | No       | HMAC signature for integrity            |

**Request Body**:

```json
{
  "protocol": "npi",
  "version": "1.0",
  "agent": { "id": "agt_7Yp2" },
  "seq": 4182,
  "ts": 1739452800123,
  "items": [...]
}
```

**Response (200 OK)**:

```json
{
  "ok": true,
  "min_interval_sec": 5,
  "feature_flags": ["probe.icmp.disabled"],
  "server_received_at": 1739452800456
}
```

**Response Fields**:

| Field                | Type    | Description                          |
| -------------------- | ------- | ------------------------------------ |
| `ok`                 | boolean | Whether ingestion succeeded          |
| `min_interval_sec`   | integer | Minimum reporting interval (seconds) |
| `feature_flags`      | array   | Server-side feature flags for agent  |
| `server_received_at` | integer | Server timestamp (Unix ms)           |

**Error Responses**:

| Status | Description                             |
| ------ | --------------------------------------- |
| `400`  | Bad request (validation error)          |
| `401`  | Unauthorized (invalid JWT)              |
| `413`  | Payload too large (split into batches)  |
| `429`  | Rate limited (see `Retry-After` header) |
| `500`  | Server error                            |

---

### 4.2 WebSocket Stream (Optional)

For persistent connections, agents can use WebSocket:

**Endpoint**: `wss://api.nodepulse.io/v1/stream`

**Client → Server**: Send envelopes as JSON messages

**Server → Client**: Send task assignments

```json
{
  "type": "task",
  "id": "tsk_42",
  "kind": "probe.http",
  "params": {
    "url": "https://example.com",
    "timeout_ms": 3000
  }
}
```

---

## 5. Security

| Concern               | Recommendation                                       |
| --------------------- | ---------------------------------------------------- |
| **Transport**         | Always use TLS (HTTPS/WSS)                           |
| **Authentication**    | Short-lived JWT per agent                            |
| **Integrity**         | Optional HMAC signature using `agent_secret`         |
| **Replay Protection** | Reject envelopes older than 2 minutes (configurable) |
| **Data Minimization** | Prefer numeric summaries and hashes over raw logs    |
| **Privacy Redaction** | Configurable regex masking via `feature_flags`       |

### 5.1 HMAC Signature

To verify message integrity, agents can include an HMAC signature:

```
X-NPI-Signature: v1=<hex(hmac_sha256(request_body, agent_secret))>
```

**Algorithm**: HMAC-SHA256
**Secret**: Per-agent shared secret (provisioned during registration)

---

## 6. Server-side Semantics

### 6.1 Deduplication

- `(agent.id, seq)` tuple must be unique
- Duplicate envelopes (same agent + seq) are silently ignored
- Prevents double-processing of retried requests

### 6.2 Latency Measurement

```
latency = server_received_at - envelope.ts
```

Tracks network/processing delay.

### 6.3 Partial Success (HTTP 207)

If some items fail validation, respond with `207 Multi-Status`:

```json
{
  "ok": false,
  "accepted": 2,
  "failed": 1,
  "failed_items": [
    {
      "index": 1,
      "reason": "missing required field 'target'",
      "code": "INVALID_PROBE_RESULT"
    }
  ],
  "server_received_at": 1739452800456
}
```

### 6.4 Rate Limiting

When an agent exceeds rate limits, respond with `429 Too Many Requests`:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

Agent should backoff for the specified duration.

---

## 7. Extensibility & Versioning

### 7.1 Protocol Version

- Declared via `version` field and MIME type
- Example: `application/vnd.nodepulse.npi.v1+json`

### 7.2 New Item Types

- New item types can be added without breaking existing parsers
- Parsers should ignore unknown item types (forward compatibility)

### 7.3 Deprecated Fields

- Follow **two-release sunset policy**:
  1. Mark as deprecated in v1.1
  2. Remove in v1.3

### 7.4 Backward Compatibility

- Old agents can continue posting minimal envelopes
- Servers must support at least **one prior major version**

---

## 8. Example Batch

Complete example with multiple item types:

```json
{
  "protocol": "npi",
  "version": "1.0",
  "agent": {
    "id": "agt_alpha",
    "capabilities": ["metrics", "heartbeat", "sec_log"],
    "labels": {
      "region": "us-east",
      "env": "prod"
    }
  },
  "seq": 15,
  "ts": 1739452800123,
  "items": [
    {
      "type": "heartbeat",
      "ts": 1739452800123,
      "host": {
        "hostname": "ny-node",
        "os": "linux",
        "arch": "amd64",
        "uptime_sec": 864000
      }
    },
    {
      "type": "metrics",
      "ts": 1739452800123,
      "cpu_pct": 6.1,
      "mem_pct": 53.2,
      "load1": 0.38
    },
    {
      "type": "sec_log",
      "ts": 1739452801123,
      "category": "port_change",
      "severity": "warn",
      "summary": "new port opened 8443",
      "kv": {
        "opened": [8443],
        "closed": []
      }
    }
  ]
}
```

---

## 9. Future Work (v2 Proposals)

The following features are under consideration for NPI v2:

1. **Binary Encoding**

   - Support for Protobuf or CBOR to reduce payload size
   - Maintain JSON as default for compatibility

2. **Differential Compression**

   - Send only changed metrics (delta encoding)
   - Reduce bandwidth for high-frequency metrics

3. **Stream Acknowledgments**

   - Explicit ACKs for WebSocket messages
   - Ensure reliable delivery without HTTP overhead

4. **Task/Result Handshake**

   - Formal protocol for server → agent task assignment
   - Agent reports task results back to server

5. **End-to-End Envelope Signing**

   - Digital signatures for auditability
   - Cryptographic proof of message origin

6. **Multi-Region Support**
   - Region-aware routing
   - Cross-region envelope forwarding

---

## 10. License

This specification is released under the **MIT License** and may be freely implemented by compatible software.

---

## Appendix A: OpenAPI Specification

A formal OpenAPI 3.1.0 specification is available at:

```
.claude/docs/npi.yml
```

This specification defines:

- Complete endpoint schemas
- Request/response examples
- Validation rules
- Authentication flows

Use this for generating:

- API clients
- Server stubs
- Documentation
- Test cases

---

## Appendix B: Implementation Checklist

### For Agent Developers

- [ ] Generate unique agent ID on first run
- [ ] Implement monotonic sequence numbering
- [ ] Handle HTTP 429 rate limiting with backoff
- [ ] Support gzip compression for large payloads
- [ ] Implement JWT refresh logic
- [ ] Add HMAC signature generation (optional)
- [ ] Buffer envelopes locally on network failure
- [ ] Respect `min_interval_sec` from server
- [ ] Parse and apply `feature_flags`

### For Server Developers

- [ ] Validate envelope schema on ingestion
- [ ] Implement deduplication via (agent_id, seq)
- [ ] Store items in appropriate tables/collections
- [ ] Calculate and log latency metrics
- [ ] Implement rate limiting per agent
- [ ] Support partial success (HTTP 207)
- [ ] Add HMAC signature verification (optional)
- [ ] Implement replay attack protection
- [ ] Support gzip Content-Encoding
- [ ] Return appropriate `feature_flags`

---

**End of Specification**
