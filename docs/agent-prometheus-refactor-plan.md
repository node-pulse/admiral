# Node Pulse Agent Prometheus Refactor Plan

**Date:** 2025-10-27
**Status:** Ready for Implementation

---

## Overview

Refactor the Node Pulse Agent from **custom metrics collection** to **Prometheus scraping**. The agent will scrape `node_exporter` running on `localhost:9100` and forward Prometheus text format to Submarines Ingest.

---

## Current Architecture (Before Refactor)

```
Agent (Go Binary)
├── Collects custom metrics (CPU, memory, network, etc.)
│   └── Reads /proc filesystem directly
├── Creates JSON report
├── Sends to Submarines /metrics endpoint (JSON format)
└── Buffers failed reports as JSONL files
```

**Problems:**
1. Duplicates work that node_exporter already does better
2. Limited to ~10 metrics vs. node_exporter's 100+ metrics
3. Custom JSON format doesn't match Prometheus ecosystem

---

## New Architecture (After Refactor)

```
node_exporter (:9100)  →  Agent (Go Binary)  →  Submarines (:8080/metrics/prometheus)
                          ├── Scrapes localhost:9100
                          ├── Gets Prometheus text format
                          ├── Forwards to Submarines
                          └── Buffers failed sends
```

**Benefits:**
1. Battle-tested metrics from node_exporter (100+ metrics)
2. Standard Prometheus format (interoperable)
3. Agent becomes a simple forwarder (simpler code)
4. Easy to add more exporters later (postgres_exporter, redis_exporter)

---

## Implementation Tasks

### Task 1: Create Prometheus Scraper Module

**File:** `internal/prometheus/scraper.go`

**Purpose:** Scrape Prometheus exporters via HTTP

```go
package prometheus

import (
    "fmt"
    "io"
    "net/http"
    "time"
)

type ScraperConfig struct {
    Endpoint string        // e.g., "http://localhost:9100/metrics"
    Timeout  time.Duration // e.g., 3s
}

type Scraper struct {
    config *ScraperConfig
    client *http.Client
}

func NewScraper(cfg *ScraperConfig) *Scraper {
    return &Scraper{
        config: cfg,
        client: &http.Client{Timeout: cfg.Timeout},
    }
}

// Scrape fetches Prometheus text format from the exporter
func (s *Scraper) Scrape() ([]byte, error) {
    resp, err := s.client.Get(s.config.Endpoint)
    if err != nil {
        return nil, fmt.Errorf("failed to scrape: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("scrape returned status %d", resp.StatusCode)
    }

    data, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, fmt.Errorf("failed to read response: %w", err)
    }

    return data, nil
}
```

---

### Task 2: Update Configuration

**File:** `internal/config/config.go`

**Changes:**

```go
type Config struct {
    Server      ServerConfig      `mapstructure:"server"`
    Agent       AgentConfig       `mapstructure:"agent"`
    Prometheus  PrometheusConfig  `mapstructure:"prometheus"` // NEW
    Buffer      BufferConfig      `mapstructure:"buffer"`
    Logging     logger.Config     `mapstructure:"logging"`
    ConfigFile  string            `mapstructure:"-"`
}

// PrometheusConfig represents Prometheus scraping settings
type PrometheusConfig struct {
    Enabled   bool          `mapstructure:"enabled"`   // Enable Prometheus scraping (default: true)
    Endpoint  string        `mapstructure:"endpoint"`  // e.g., "http://localhost:9100/metrics"
    Timeout   time.Duration `mapstructure:"timeout"`   // Default: 3s
}

var defaultConfig = Config{
    Server: ServerConfig{
        Endpoint: "https://api.nodepulse.io/metrics/prometheus", // CHANGED
        Timeout:  3 * time.Second,
    },
    Agent: AgentConfig{
        Interval: 15 * time.Second, // CHANGED: Prometheus scrapes typically 15s-1m
    },
    Prometheus: PrometheusConfig{ // NEW
        Enabled:  true,
        Endpoint: "http://localhost:9100/metrics",
        Timeout:  3 * time.Second,
    },
    Buffer: BufferConfig{
        Path:           "/var/lib/node-pulse/buffer",
        RetentionHours: 48,
        BatchSize:      5,
    },
    // ... logging stays same
}
```

**Configuration file example:**

```yaml
server:
  endpoint: "https://api.nodepulse.io/metrics/prometheus"
  timeout: 3s

agent:
  server_id: "auto-generated-uuid"
  interval: 15s  # Scrape interval (15s, 30s, 1m)

prometheus:
  enabled: true
  endpoint: "http://localhost:9100/metrics"
  timeout: 3s

buffer:
  enabled: true
  path: "/var/lib/node-pulse/buffer"
  retention_hours: 48
  batch_size: 5

logging:
  level: "info"
  output: "stdout"
```

---

### Task 3: Update Buffer to Store Prometheus Text Format

**File:** `internal/report/buffer.go`

**Changes:**

```go
// SavePrometheus saves Prometheus text format data to buffer
func (b *Buffer) SavePrometheus(data []byte, serverID string) error {
    b.mu.Lock()
    defer b.mu.Unlock()

    // Get current hour file
    filePath := b.getCurrentFile()

    // Open file for appending
    f, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
    if err != nil {
        return fmt.Errorf("failed to open buffer file: %w", err)
    }
    defer f.Close()

    // Write as: timestamp|server_id|data\n
    // Format: 2025-10-27T12:00:00Z|uuid|<prometheus metrics>\n
    timestamp := time.Now().UTC().Format(time.RFC3339)
    line := fmt.Sprintf("%s|%s|%s\n", timestamp, serverID, string(data))

    if _, err := f.WriteString(line); err != nil {
        return fmt.Errorf("failed to write to buffer: %w", err)
    }

    return nil
}

// LoadPrometheusFile loads all Prometheus entries from a buffer file
func (b *Buffer) LoadPrometheusFile(filePath string) ([]PrometheusEntry, error) {
    data, err := os.ReadFile(filePath)
    if err != nil {
        return nil, fmt.Errorf("failed to read file: %w", err)
    }

    var entries []PrometheusEntry
    lines := strings.Split(string(data), "\n")

    for _, line := range lines {
        if line == "" {
            continue
        }

        parts := strings.SplitN(line, "|", 3)
        if len(parts) != 3 {
            logger.Warn("Malformed buffer line, skipping", logger.String("line", line))
            continue
        }

        entries = append(entries, PrometheusEntry{
            Timestamp: parts[0],
            ServerID:  parts[1],
            Data:      []byte(parts[2]),
        })
    }

    return entries, nil
}

type PrometheusEntry struct {
    Timestamp string
    ServerID  string
    Data      []byte // Prometheus text format
}
```

---

### Task 4: Update Sender to Send Prometheus Format

**File:** `internal/report/sender.go`

**Changes:**

```go
// SendPrometheus saves Prometheus text format data to buffer
// The data will be sent asynchronously by the drain goroutine
func (s *Sender) SendPrometheus(data []byte, serverID string) error {
    // Always save to buffer first (WAL pattern)
    if err := s.buffer.SavePrometheus(data, serverID); err != nil {
        return fmt.Errorf("failed to save prometheus data to buffer: %w", err)
    }

    logger.Debug("Prometheus data saved to buffer", logger.String("server_id", serverID), logger.Int("bytes", len(data)))
    return nil
}

// sendPrometheusHTTP sends Prometheus text format to server
func (s *Sender) sendPrometheusHTTP(data []byte, serverID string) error {
    // Build URL with server_id query param
    url := fmt.Sprintf("%s?server_id=%s", s.config.Server.Endpoint, serverID)

    req, err := http.NewRequest("POST", url, bytes.NewReader(data))
    if err != nil {
        return fmt.Errorf("failed to create request: %w", err)
    }

    req.Header.Set("Content-Type", "text/plain; version=0.0.4")
    req.Header.Set("User-Agent", "node-pulse-agent/2.0")

    resp, err := s.client.Do(req)
    if err != nil {
        return fmt.Errorf("HTTP request failed: %w", err)
    }
    defer resp.Body.Close()

    // Read response body
    io.Copy(io.Discard, resp.Body)

    // Check status code
    if resp.StatusCode < 200 || resp.StatusCode >= 300 {
        return fmt.Errorf("server returned status %d", resp.StatusCode)
    }

    return nil
}

// processBatchPrometheus sends a batch of Prometheus buffer files
func (s *Sender) processBatchPrometheus(filePaths []string) error {
    for _, filePath := range filePaths {
        entries, err := s.buffer.LoadPrometheusFile(filePath)
        if err != nil {
            logger.Warn("Corrupted Prometheus buffer file, deleting",
                logger.String("file", filePath), logger.Err(err))
            s.buffer.DeleteFile(filePath)
            continue
        }

        // Send each entry
        allSent := true
        for _, entry := range entries {
            if err := s.sendPrometheusHTTP(entry.Data, entry.ServerID); err != nil {
                logger.Debug("Failed to send Prometheus entry", logger.Err(err))
                allSent = false
                break // Stop processing this file, keep for retry
            }
        }

        // Only delete file if ALL entries were sent successfully
        if allSent {
            if err := s.buffer.DeleteFile(filePath); err != nil {
                logger.Error("Failed to delete buffer file", logger.String("file", filePath), logger.Err(err))
            } else {
                logger.Info("Successfully sent Prometheus batch", logger.String("file", filePath), logger.Int("entries", len(entries)))
            }
        } else {
            // Keep file for retry
            logger.Debug("Keeping buffer file for retry", logger.String("file", filePath))
            break // Stop processing batch, retry later
        }
    }

    return nil
}
```

---

### Task 5: Update Main Agent Loop

**File:** `cmd/start.go`

**Changes:**

Replace custom metrics collection with Prometheus scraping:

```go
func runAgent(cfg *config.Config, log *logger.Logger) error {
    // Create Prometheus scraper
    scraper := prometheus.NewScraper(&prometheus.ScraperConfig{
        Endpoint: cfg.Prometheus.Endpoint,
        Timeout:  cfg.Prometheus.Timeout,
    })

    // Create sender (buffer enabled by default)
    sender, err := report.NewSender(cfg)
    if err != nil {
        return fmt.Errorf("failed to create sender: %w", err)
    }
    defer sender.Close()

    // Start background drain goroutine
    sender.StartDraining()

    // Setup graceful shutdown
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()

    // Scrape immediately on start
    if data, err := scraper.Scrape(); err != nil {
        log.Warn("Initial scrape failed", logger.Err(err))
    } else {
        sender.SendPrometheus(data, cfg.Agent.ServerID)
    }

    // Start ticker for periodic scraping
    ticker := time.NewTicker(cfg.Agent.Interval)
    defer ticker.Stop()

    log.Info("Agent started",
        logger.String("interval", cfg.Agent.Interval.String()),
        logger.String("prometheus_endpoint", cfg.Prometheus.Endpoint),
        logger.String("server_endpoint", cfg.Server.Endpoint))

    for {
        select {
        case <-ctx.Done():
            log.Info("Shutting down gracefully...")
            return nil

        case <-ticker.C:
            // Scrape Prometheus exporter
            data, err := scraper.Scrape()
            if err != nil {
                log.Error("Failed to scrape Prometheus exporter", logger.Err(err))
                continue
            }

            // Save to buffer (non-blocking)
            if err := sender.SendPrometheus(data, cfg.Agent.ServerID); err != nil {
                log.Error("Failed to buffer Prometheus data", logger.Err(err))
            } else {
                log.Debug("Prometheus data buffered", logger.Int("bytes", len(data)))
            }
        }
    }
}
```

---

### Task 6: Deprecate Custom Metrics Collectors

**Strategy:** Keep the files but mark them as deprecated

**Files to update:**
- `internal/metrics/cpu.go`
- `internal/metrics/memory.go`
- `internal/metrics/network.go`
- `internal/metrics/uptime.go`
- `internal/metrics/disk.go`
- `internal/metrics/process.go`
- `internal/metrics/system.go`
- `internal/metrics/report.go`

**Add deprecation notice at top of each file:**

```go
// DEPRECATED: This file is deprecated in favor of Prometheus node_exporter.
// Custom metric collection is no longer used as of v2.0.
// This code is kept for reference only.
```

**Alternative:** Move to `internal/metrics/legacy/` directory

---

### Task 7: Update TUI Watch Command

**File:** `cmd/watch.go`

**Options:**

**Option 1: Show scrape status (simpler)**
```
Node Pulse Agent (Prometheus Mode)
====================================

Prometheus Scraper:  http://localhost:9100/metrics
Last Scrape:         2025-10-27 12:34:56
Scrape Status:       ✓ Success (150 metrics, 52 KB)
Scrape Interval:     15s

Buffer Status:       3 files pending
Server Endpoint:     https://api.nodepulse.io/metrics/prometheus

Last 5 Scrapes:
12:34:56  ✓  150 metrics  52 KB
12:34:41  ✓  150 metrics  51 KB
12:34:26  ✓  148 metrics  50 KB
12:34:11  ✗  Failed: connection refused
12:33:56  ✓  150 metrics  52 KB
```

**Option 2: Parse and show key metrics (more complex)**
Parse Prometheus text format and display key metrics like before (CPU, memory, etc.)

**Recommendation:** Option 1 (simpler, matches new architecture)

---

### Task 8: Update Tests

**New test file:** `internal/prometheus/scraper_test.go`

```go
package prometheus

import (
    "net/http"
    "net/http/httptest"
    "testing"
    "time"
)

func TestScraper(t *testing.T) {
    // Mock Prometheus exporter
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "text/plain; version=0.0.4")
        w.Write([]byte("# HELP test_metric A test metric\n# TYPE test_metric counter\ntest_metric 42\n"))
    }))
    defer server.Close()

    scraper := NewScraper(&ScraperConfig{
        Endpoint: server.URL,
        Timeout:  3 * time.Second,
    })

    data, err := scraper.Scrape()
    if err != nil {
        t.Fatalf("Scrape failed: %v", err)
    }

    if len(data) == 0 {
        t.Fatal("Expected non-empty data")
    }

    if !strings.Contains(string(data), "test_metric 42") {
        t.Errorf("Expected metric not found in scraped data")
    }
}
```

---

### Task 9: Update Documentation

**Files to update:**

1. **README.md**
   - Update "Metrics Collected" section to mention Prometheus
   - Change JSON example to Prometheus text format
   - Add node_exporter installation instructions
   - Update configuration example

2. **INSTALLATION.md**
   - Add step to install node_exporter
   - Update systemd service dependencies

3. **CLAUDE.md**
   - Update architecture diagram
   - Change "custom metrics" to "Prometheus scraping"
   - Update main loop description

**Example README changes:**

```markdown
## Prerequisites

The Node Pulse Agent requires `node_exporter` to be installed and running on the same server.

### Install node_exporter

```bash
# Ubuntu/Debian
wget https://github.com/prometheus/node_exporter/releases/download/v1.8.2/node_exporter-1.8.2.linux-amd64.tar.gz
tar -xzf node_exporter-1.8.2.linux-amd64.tar.gz
sudo mv node_exporter-1.8.2.linux-amd64/node_exporter /usr/local/bin/
sudo chmod +x /usr/local/bin/node_exporter

# Create systemd service
sudo tee /etc/systemd/system/node_exporter.service <<EOF
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter --web.listen-address=127.0.0.1:9100
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter

# Verify
curl http://localhost:9100/metrics
```

## What the Agent Does

The Node Pulse Agent:
1. Scrapes Prometheus `node_exporter` on `localhost:9100` every 15 seconds
2. Forwards Prometheus text format to your Node Pulse dashboard
3. Buffers metrics locally if the dashboard is unreachable
4. Automatically retries sending buffered metrics

**Metrics collected:** 100+ metrics from node_exporter (CPU, memory, disk, network, filesystem, systemd, etc.)
```

---

## Migration Strategy

### For Existing Users

1. **Backward Compatibility Period (v2.0-v2.1)**
   - Support both modes: Prometheus (default) + Legacy JSON (via flag)
   - Add config option: `agent.mode: "prometheus"` or `"legacy"`
   - If `prometheus.enabled: false`, fall back to legacy mode

2. **Deprecation (v2.2+)**
   - Remove legacy mode entirely
   - Require node_exporter

### Breaking Changes

1. **Configuration file changes:**
   - New `prometheus` section required
   - `server.endpoint` changes from `/metrics` to `/metrics/prometheus`
   - Default interval changes from 5s to 15s

2. **Data format changes:**
   - JSON → Prometheus text format
   - Single report → 100+ individual metrics

3. **Buffer format changes:**
   - JSONL → Pipe-delimited Prometheus entries
   - Old buffers will be ignored (or migrate with script)

---

## Rollout Plan

### Phase 1: Development (Week 1)
- ✅ Create Prometheus scraper module
- ✅ Update configuration schema
- ✅ Update buffer format
- ✅ Update sender for Prometheus
- ✅ Update main agent loop
- ✅ Update tests

### Phase 2: Testing (Week 1)
- Test scraping from node_exporter
- Test buffering and retry logic
- Test graceful shutdown
- Verify Submarines receives Prometheus format correctly

### Phase 3: Documentation (Week 2)
- Update README with node_exporter install steps
- Update CLAUDE.md with new architecture
- Create migration guide for existing users

### Phase 4: Release (Week 2)
- Release v2.0.0 with Prometheus support
- Update Ansible role to install node_exporter
- Deploy to test servers
- Monitor for issues

---

## Testing Checklist

- [ ] Scraper successfully fetches from node_exporter
- [ ] Scraper handles node_exporter being down
- [ ] Buffer stores Prometheus text format correctly
- [ ] Sender forwards to Submarines with correct URL and headers
- [ ] Submarines Ingest receives and parses Prometheus format
- [ ] Digest worker writes to PostgreSQL metric_samples table
- [ ] Buffered metrics are retried and sent successfully
- [ ] Graceful shutdown works (no data loss)
- [ ] TUI watch command shows scrape status
- [ ] Configuration validation works
- [ ] Unit tests pass
- [ ] Integration test: agent → submarines → database

---

## Success Criteria

1. **Agent successfully scrapes node_exporter** every 15s
2. **Submarines receives Prometheus text format** and stores in DB
3. **Buffering works** when Submarines is down
4. **No data loss** during restarts or network issues
5. **Documentation is complete** and accurate
6. **Existing users can migrate** with clear instructions

---

## Questions to Resolve

1. **Should we keep legacy JSON mode?**
   - Recommendation: No, clean break for v2.0
   - Rationale: Simpler codebase, forces ecosystem alignment

2. **What happens to old buffered JSON reports?**
   - Option A: Ignore them (data loss for <48 hours)
   - Option B: Migration script to convert to Prometheus format
   - Recommendation: Option A (clean break)

3. **Should agent verify node_exporter is running on startup?**
   - Recommendation: Yes, check http://localhost:9100/metrics on startup
   - Fail with helpful error if not running

4. **Should we make node_exporter endpoint configurable?**
   - Recommendation: Yes, default to localhost:9100 but allow override
   - Use case: Remote exporters, custom ports

---

## Summary

This refactor transforms the Node Pulse Agent from a **custom metrics collector** to a **Prometheus forwarder**. The benefits are:

1. **Better metrics** - 100+ from node_exporter vs. 10 custom
2. **Industry standard** - Prometheus format is universal
3. **Simpler code** - Less code to maintain
4. **Ecosystem alignment** - Works with any Prometheus exporter

**Estimated effort:** 1-2 weeks (development + testing + docs)

**Breaking change:** Yes, requires v2.0 major version bump
