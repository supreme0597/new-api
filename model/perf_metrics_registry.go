package model

import (
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
)

// RegisterPerfMetricsDB registers database functions with the perf_metrics
// package to avoid import cycles. This must be called before perfmetrics.Init().
func RegisterPerfMetricsDB() {
	perfmetrics.DBFuncs.UpsertPerfMetric = func(metric *perfmetrics.PerfMetricData) error {
		return UpsertPerfMetric(&PerfMetric{
			ModelName:      metric.ModelName,
			Group:          metric.Group,
			BucketTs:       metric.BucketTs,
			RequestCount:   metric.RequestCount,
			SuccessCount:   metric.SuccessCount,
			TotalLatencyMs: metric.TotalLatencyMs,
			TtftSumMs:      metric.TtftSumMs,
			TtftCount:      metric.TtftCount,
			OutputTokens:   metric.OutputTokens,
			GenerationMs:   metric.GenerationMs,
		})
	}

	perfmetrics.DBFuncs.DeleteBefore = func(cutoffTs int64) error {
		return DeletePerfMetricsBefore(cutoffTs)
	}

	perfmetrics.DBFuncs.GetPerfMetrics = func(modelName string, group string, startTs int64, endTs int64, timeField string) ([]perfmetrics.PerfMetricRow, error) {
		rows, err := GetPerfMetrics(modelName, group, startTs, endTs, timeField)
		if err != nil {
			return nil, err
		}
		result := make([]perfmetrics.PerfMetricRow, len(rows))
		for i, row := range rows {
			result[i] = perfmetrics.PerfMetricRow{
				ModelName:      row.ModelName,
				Group:          row.Group,
				BucketTs:       row.BucketTs,
				RequestCount:   row.RequestCount,
				SuccessCount:   row.SuccessCount,
				TotalLatencyMs: row.TotalLatencyMs,
				TtftSumMs:      row.TtftSumMs,
				TtftCount:      row.TtftCount,
				OutputTokens:   row.OutputTokens,
				GenerationMs:   row.GenerationMs,
			}
		}
		return result, nil
	}

	perfmetrics.DBFuncs.GetPerfMetricsSummary = func(startTs int64, endTs int64, groups []string, timeField string) ([]perfmetrics.PerfMetricSummaryRow, error) {
		rows, err := GetPerfMetricsSummaryAll(startTs, endTs, groups, timeField)
		if err != nil {
			return nil, err
		}
		result := make([]perfmetrics.PerfMetricSummaryRow, len(rows))
		for i, row := range rows {
			result[i] = perfmetrics.PerfMetricSummaryRow{
				ModelName:      row.ModelName,
				RequestCount:   row.RequestCount,
				SuccessCount:   row.SuccessCount,
				TotalLatencyMs: row.TotalLatencyMs,
				OutputTokens:   row.OutputTokens,
				GenerationMs:   row.GenerationMs,
			}
		}
		return result, nil
	}
}
