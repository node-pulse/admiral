package parsers

import (
	"strings"
	"testing"
)

func TestParsePrometheusText(t *testing.T) {
	// Sample Prometheus text format (from node_exporter)
	input := `# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 123456.78
node_cpu_seconds_total{cpu="0",mode="system"} 5678.90
node_cpu_seconds_total{cpu="1",mode="idle"} 234567.89

# HELP node_memory_MemTotal_bytes Memory information field MemTotal_bytes.
# TYPE node_memory_MemTotal_bytes gauge
node_memory_MemTotal_bytes 8589934592

# HELP node_filesystem_size_bytes Filesystem size in bytes.
# TYPE node_filesystem_size_bytes gauge
node_filesystem_size_bytes{device="/dev/sda1",fstype="ext4",mountpoint="/"} 107374182400
`

	reader := strings.NewReader(input)
	metrics, err := ParsePrometheusText(reader)

	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if len(metrics) == 0 {
		t.Fatal("Expected metrics to be parsed, got none")
	}

	// Test 1: Check CPU counter metrics
	cpuMetrics := 0
	for _, m := range metrics {
		if m.Name == "node_cpu_seconds_total" {
			cpuMetrics++
			if m.Type != "counter" {
				t.Errorf("Expected type 'counter', got '%s'", m.Type)
			}
			if _, ok := m.Labels["cpu"]; !ok {
				t.Error("Expected 'cpu' label, not found")
			}
			if _, ok := m.Labels["mode"]; !ok {
				t.Error("Expected 'mode' label, not found")
			}
		}
	}
	if cpuMetrics != 3 {
		t.Errorf("Expected 3 CPU metrics, got %d", cpuMetrics)
	}

	// Test 2: Check memory gauge metric
	memoryMetrics := 0
	for _, m := range metrics {
		if m.Name == "node_memory_MemTotal_bytes" {
			memoryMetrics++
			if m.Type != "gauge" {
				t.Errorf("Expected type 'gauge', got '%s'", m.Type)
			}
			if m.Value != 8589934592 {
				t.Errorf("Expected value 8589934592, got %f", m.Value)
			}
		}
	}
	if memoryMetrics != 1 {
		t.Errorf("Expected 1 memory metric, got %d", memoryMetrics)
	}

	// Test 3: Check filesystem metric with labels
	fsMetrics := 0
	for _, m := range metrics {
		if m.Name == "node_filesystem_size_bytes" {
			fsMetrics++
			if m.Type != "gauge" {
				t.Errorf("Expected type 'gauge', got '%s'", m.Type)
			}
			if m.Labels["device"] != "/dev/sda1" {
				t.Errorf("Expected device '/dev/sda1', got '%s'", m.Labels["device"])
			}
			if m.Labels["mountpoint"] != "/" {
				t.Errorf("Expected mountpoint '/', got '%s'", m.Labels["mountpoint"])
			}
		}
	}
	if fsMetrics != 1 {
		t.Errorf("Expected 1 filesystem metric, got %d", fsMetrics)
	}
}

func TestParsePrometheusHistogram(t *testing.T) {
	input := `# HELP http_request_duration_seconds HTTP request latency
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 24054
http_request_duration_seconds_bucket{le="0.5"} 24300
http_request_duration_seconds_bucket{le="+Inf"} 24588
http_request_duration_seconds_sum 53423.7
http_request_duration_seconds_count 24588
`

	reader := strings.NewReader(input)
	metrics, err := ParsePrometheusText(reader)

	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	// Should have 3 bucket metrics + 1 aggregate (sum/count)
	if len(metrics) != 4 {
		t.Errorf("Expected 4 metrics (3 buckets + 1 aggregate), got %d", len(metrics))
	}

	// Check buckets
	buckets := 0
	for _, m := range metrics {
		if m.Labels["le"] != "" {
			buckets++
			if m.Type != "histogram" {
				t.Errorf("Expected type 'histogram', got '%s'", m.Type)
			}
		}
	}
	if buckets != 3 {
		t.Errorf("Expected 3 buckets, got %d", buckets)
	}

	// Check aggregate (sum/count)
	aggregates := 0
	for _, m := range metrics {
		if m.SampleCount != nil && m.SampleSum != nil {
			aggregates++
			if *m.SampleCount != 24588 {
				t.Errorf("Expected count 24588, got %d", *m.SampleCount)
			}
			if *m.SampleSum != 53423.7 {
				t.Errorf("Expected sum 53423.7, got %f", *m.SampleSum)
			}
		}
	}
	if aggregates != 1 {
		t.Errorf("Expected 1 aggregate, got %d", aggregates)
	}
}

func TestParsePrometheusSummary(t *testing.T) {
	input := `# HELP rpc_duration_seconds RPC latency quantiles
# TYPE rpc_duration_seconds summary
rpc_duration_seconds{quantile="0.5"} 0.232
rpc_duration_seconds{quantile="0.9"} 1.234
rpc_duration_seconds{quantile="0.99"} 4.123
rpc_duration_seconds_sum 53423.7
rpc_duration_seconds_count 24588
`

	reader := strings.NewReader(input)
	metrics, err := ParsePrometheusText(reader)

	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	// Should have 3 quantile metrics + 1 aggregate
	if len(metrics) != 4 {
		t.Errorf("Expected 4 metrics (3 quantiles + 1 aggregate), got %d", len(metrics))
	}

	// Check quantiles
	quantiles := 0
	for _, m := range metrics {
		if m.Labels["quantile"] != "" {
			quantiles++
			if m.Type != "summary" {
				t.Errorf("Expected type 'summary', got '%s'", m.Type)
			}
		}
	}
	if quantiles != 3 {
		t.Errorf("Expected 3 quantiles, got %d", quantiles)
	}
}

func TestParsePrometheusEmpty(t *testing.T) {
	input := ``
	reader := strings.NewReader(input)
	metrics, err := ParsePrometheusText(reader)

	if err != nil {
		t.Fatalf("Expected no error for empty input, got: %v", err)
	}

	if len(metrics) != 0 {
		t.Errorf("Expected 0 metrics for empty input, got %d", len(metrics))
	}
}
