package parsers

import (
	"fmt"
	"io"
	"time"

	"github.com/prometheus/common/expfmt"
	"github.com/prometheus/common/model"
)

// PrometheusMetric represents a single parsed Prometheus metric sample
type PrometheusMetric struct {
	Name      string
	Type      string
	Labels    map[string]string
	Value     float64
	Timestamp time.Time

	// For histograms/summaries
	SampleCount *int64
	SampleSum   *float64

	// For exemplars
	Exemplar          map[string]string
	ExemplarValue     *float64
	ExemplarTimestamp *time.Time

	// Metadata
	HelpText string
	Unit     string
}

// ParsePrometheusText parses Prometheus text format metrics
func ParsePrometheusText(reader io.Reader) ([]*PrometheusMetric, error) {
	var parser expfmt.TextParser
	metricFamilies, err := parser.TextToMetricFamilies(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Prometheus text format: %w", err)
	}

	var metrics []*PrometheusMetric

	for metricName, mf := range metricFamilies {
		metricType := getMetricType(mf.GetType())
		helpText := mf.GetHelp()
		unit := mf.GetUnit()

		for _, m := range mf.GetMetric() {
			// Extract labels
			labels := make(map[string]string)
			for _, lp := range m.GetLabel() {
				labels[lp.GetName()] = lp.GetValue()
			}

			// Handle different metric types
			switch mf.GetType() {
			case model.MetricTypeCounter:
				metrics = append(metrics, &PrometheusMetric{
					Name:      metricName,
					Type:      metricType,
					Labels:    labels,
					Value:     m.GetCounter().GetValue(),
					Timestamp: getTimestamp(m),
					HelpText:  helpText,
					Unit:      unit,
				})

			case model.MetricTypeGauge:
				metrics = append(metrics, &PrometheusMetric{
					Name:      metricName,
					Type:      metricType,
					Labels:    labels,
					Value:     m.GetGauge().GetValue(),
					Timestamp: getTimestamp(m),
					HelpText:  helpText,
					Unit:      unit,
				})

			case model.MetricTypeHistogram:
				// Parse histogram buckets
				h := m.GetHistogram()

				// Store bucket samples
				for _, bucket := range h.GetBucket() {
					bucketLabels := copyLabels(labels)
					bucketLabels["le"] = fmt.Sprintf("%v", bucket.GetUpperBound())

					metric := &PrometheusMetric{
						Name:      metricName,
						Type:      metricType,
						Labels:    bucketLabels,
						Value:     float64(bucket.GetCumulativeCount()),
						Timestamp: getTimestamp(m),
						HelpText:  helpText,
						Unit:      unit,
					}

					// Add exemplar if present
					if exemplar := bucket.GetExemplar(); exemplar != nil {
						metric.Exemplar = make(map[string]string)
						for _, lp := range exemplar.GetLabel() {
							metric.Exemplar[lp.GetName()] = lp.GetValue()
						}
						exemplarValue := exemplar.GetValue()
						metric.ExemplarValue = &exemplarValue

						if exemplar.Timestamp != nil {
							ts := exemplar.Timestamp.AsTime()
							metric.ExemplarTimestamp = &ts
						}
					}

					metrics = append(metrics, metric)
				}

				// Store sum and count
				sampleCount := int64(h.GetSampleCount())
				sampleSum := h.GetSampleSum()
				metrics = append(metrics, &PrometheusMetric{
					Name:        metricName,
					Type:        metricType,
					Labels:      copyLabels(labels),
					Value:       0, // Not used for aggregates
					SampleCount: &sampleCount,
					SampleSum:   &sampleSum,
					Timestamp:   getTimestamp(m),
					HelpText:    helpText,
					Unit:        unit,
				})

			case model.MetricTypeSummary:
				// Parse summary quantiles
				s := m.GetSummary()

				// Store quantile samples
				for _, quantile := range s.GetQuantile() {
					quantileLabels := copyLabels(labels)
					quantileLabels["quantile"] = fmt.Sprintf("%v", quantile.GetQuantile())

					metrics = append(metrics, &PrometheusMetric{
						Name:      metricName,
						Type:      metricType,
						Labels:    quantileLabels,
						Value:     quantile.GetValue(),
						Timestamp: getTimestamp(m),
						HelpText:  helpText,
						Unit:      unit,
					})
				}

				// Store sum and count
				sampleCount := int64(s.GetSampleCount())
				sampleSum := s.GetSampleSum()
				metrics = append(metrics, &PrometheusMetric{
					Name:        metricName,
					Type:        metricType,
					Labels:      copyLabels(labels),
					Value:       0, // Not used for aggregates
					SampleCount: &sampleCount,
					SampleSum:   &sampleSum,
					Timestamp:   getTimestamp(m),
					HelpText:    helpText,
					Unit:        unit,
				})

			default:
				// Untyped metrics
				if m.GetUntyped() != nil {
					metrics = append(metrics, &PrometheusMetric{
						Name:      metricName,
						Type:      "untyped",
						Labels:    labels,
						Value:     m.GetUntyped().GetValue(),
						Timestamp: getTimestamp(m),
						HelpText:  helpText,
						Unit:      unit,
					})
				}
			}
		}
	}

	return metrics, nil
}

// getMetricType converts Prometheus metric type to string
func getMetricType(mt model.MetricType) string {
	switch mt {
	case model.MetricTypeCounter:
		return "counter"
	case model.MetricTypeGauge:
		return "gauge"
	case model.MetricTypeHistogram:
		return "histogram"
	case model.MetricTypeSummary:
		return "summary"
	default:
		return "untyped"
	}
}

// getTimestamp extracts timestamp from metric, defaults to current time
func getTimestamp(m *model.Metric) time.Time {
	if m.TimestampMs != nil {
		return time.UnixMilli(*m.TimestampMs)
	}
	return time.Now()
}

// copyLabels creates a copy of the labels map
func copyLabels(labels map[string]string) map[string]string {
	copy := make(map[string]string, len(labels))
	for k, v := range labels {
		copy[k] = v
	}
	return copy
}
