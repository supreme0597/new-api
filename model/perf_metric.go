package model

import (
	"fmt"
	"sort"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// PerfMetric stores aggregated relay performance metrics for the model square.
type PerfMetric struct {
	Id             int    `json:"id" gorm:"primaryKey"`
	ModelName      string `json:"model_name" gorm:"size:128;uniqueIndex:idx_perf_model_group_bucket,priority:1"`
	Group          string `json:"group" gorm:"column:group;size:64;uniqueIndex:idx_perf_model_group_bucket,priority:2"`
	BucketTs       int64  `json:"bucket_ts" gorm:"uniqueIndex:idx_perf_model_group_bucket,priority:3;index:idx_perf_bucket_ts"`
	RequestCount   int64  `json:"-" gorm:"default:0"`
	SuccessCount   int64  `json:"-" gorm:"default:0"`
	TotalLatencyMs int64  `json:"-" gorm:"default:0"`
	TtftSumMs      int64  `json:"-" gorm:"default:0"`
	TtftCount      int64  `json:"-" gorm:"default:0"`
	OutputTokens   int64  `json:"-" gorm:"default:0"`
	GenerationMs   int64  `json:"-" gorm:"default:0"`
}

func (PerfMetric) TableName() string {
	return "perf_metrics"
}

func UpsertPerfMetric(metric *PerfMetric) error {
	if metric == nil || metric.RequestCount == 0 {
		return nil
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "model_name"},
			{Name: "group"},
			{Name: "bucket_ts"},
		},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"request_count":    gorm.Expr("perf_metrics.request_count + ?", metric.RequestCount),
			"success_count":    gorm.Expr("perf_metrics.success_count + ?", metric.SuccessCount),
			"total_latency_ms": gorm.Expr("perf_metrics.total_latency_ms + ?", metric.TotalLatencyMs),
			"ttft_sum_ms":      gorm.Expr("perf_metrics.ttft_sum_ms + ?", metric.TtftSumMs),
			"ttft_count":       gorm.Expr("perf_metrics.ttft_count + ?", metric.TtftCount),
			"output_tokens":    gorm.Expr("perf_metrics.output_tokens + ?", metric.OutputTokens),
			"generation_ms":    gorm.Expr("perf_metrics.generation_ms + ?", metric.GenerationMs),
		}),
	}).Create(metric).Error
}

func GetPerfMetrics(modelName string, group string, startTs int64, endTs int64) ([]PerfMetric, error) {
	var metrics []PerfMetric
	query := DB.Model(&PerfMetric{}).
		Where("model_name = ? AND bucket_ts >= ? AND bucket_ts <= ?", modelName, startTs, endTs)
	if group != "" {
		query = query.Where(commonGroupCol+" = ?", group)
	}
	err := query.Order("bucket_ts ASC").Find(&metrics).Error
	return metrics, err
}

type PerfMetricSummary struct {
	ModelName      string `json:"model_name"`
	RequestCount   int64  `json:"request_count"`
	SuccessCount   int64  `json:"success_count"`
	TotalLatencyMs int64  `json:"total_latency_ms"`
	OutputTokens   int64  `json:"output_tokens"`
	GenerationMs   int64  `json:"generation_ms"`
}

type PerfMetricSummaryBucket struct {
	ModelName      string `json:"model_name"`
	BucketTs       int64  `json:"bucket_ts"`
	RequestCount   int64  `json:"request_count"`
	SuccessCount   int64  `json:"success_count"`
	TotalLatencyMs int64  `json:"total_latency_ms"`
	OutputTokens   int64  `json:"output_tokens"`
	GenerationMs   int64  `json:"generation_ms"`
}

func GetPerfMetricsSummaryAll(startTs int64, endTs int64, groups []string) ([]PerfMetricSummary, error) {
	var summaries []PerfMetricSummary
	query := DB.Model(&PerfMetric{}).
		Select("model_name, SUM(request_count) as request_count, SUM(success_count) as success_count, SUM(total_latency_ms) as total_latency_ms, SUM(output_tokens) as output_tokens, SUM(generation_ms) as generation_ms").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs)
	if groups != nil {
		if len(groups) == 0 {
			return summaries, nil
		}
		query = query.Where(commonGroupCol+" IN ?", groups)
	}
	err := query.
		Group("model_name").
		Having("SUM(request_count) > 0").
		Find(&summaries).Error
	return summaries, err
}

// LeaderboardItem 性能排行榜条目
type LeaderboardItem struct {
	Rank        int     `json:"rank"`
	ModelName   string  `json:"model_name"`
	VendorName  string  `json:"vendor_name"`
	AvgTps      float64 `json:"avg_tps"`
	AvgTtftMs   int64   `json:"avg_ttft_ms"`
	SuccessRate float64 `json:"success_rate"`
	Score       float64 `json:"score"`
	SampleCount int64   `json:"sample_count"`
}

// LeaderboardAggRow 聚合查询的中间结果
type LeaderboardAggRow struct {
	ModelName    string `json:"model_name"`
	RequestCount int64  `json:"request_count"`
	SuccessCount int64  `json:"success_count"`
	TtftSumMs    int64  `json:"ttft_sum_ms"`
	TtftCount    int64  `json:"ttft_count"`
	OutputTokens int64  `json:"output_tokens"`
	GenerationMs int64  `json:"generation_ms"`
}

// GetLeaderboardData 获取排行榜数据（从 perf_metrics 聚合）
// 按 model_name 聚合，再从 models + vendors 表获取 vendor_name
func GetLeaderboardData(startTs int64, endTs int64, vendorId int, sortBy string, sortOrder string) ([]LeaderboardItem, error) {
	// Step 1: 从 perf_metrics 按 model_name 聚合
	var aggRows []LeaderboardAggRow
	query := DB.Model(&PerfMetric{}).
		Select("model_name, SUM(request_count) as request_count, SUM(success_count) as success_count, SUM(ttft_sum_ms) as ttft_sum_ms, SUM(ttft_count) as ttft_count, SUM(output_tokens) as output_tokens, SUM(generation_ms) as generation_ms").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs).
		Group("model_name").
		Having("SUM(request_count) > 0")

	if err := query.Find(&aggRows).Error; err != nil {
		return nil, err
	}

	if len(aggRows) == 0 {
		return []LeaderboardItem{}, nil
	}

	// Step 2: 获取 model_name → (vendor_id, vendor_name) 的映射
	modelNames := make([]string, 0, len(aggRows))
	for _, row := range aggRows {
		modelNames = append(modelNames, row.ModelName)
	}

	type modelVendor struct {
		ModelName  string
		VendorID   int
		VendorName string
	}
	var mvRows []modelVendor
	err := DB.Table("models").
		Select("models.model_name, models.vendor_id, vendors.name as vendor_name").
		Joins("LEFT JOIN vendors ON vendors.id = models.vendor_id").
		Where("models.model_name IN ?", modelNames).
		Scan(&mvRows).Error
	if err != nil {
		return nil, err
	}

	modelVendorMap := make(map[string]modelVendor, len(mvRows))
	for _, mv := range mvRows {
		modelVendorMap[mv.ModelName] = mv
	}

	// Step 3: 如果指定了 vendorId，过滤
	items := make([]LeaderboardItem, 0, len(aggRows))
	for _, row := range aggRows {
		mv, exists := modelVendorMap[row.ModelName]

		// 如果指定了 vendorId，只保留该 vendor 的模型
		if vendorId > 0 {
			if !exists || mv.VendorID != vendorId {
				continue
			}
		}

		avgTps := float64(0)
		if row.GenerationMs > 0 {
			avgTps = float64(row.OutputTokens) / float64(row.GenerationMs) * 1000
		}
		avgTtftMs := int64(0)
		if row.TtftCount > 0 {
			avgTtftMs = row.TtftSumMs / row.TtftCount
		}
		successRate := float64(0)
		if row.RequestCount > 0 {
			successRate = float64(row.SuccessCount) / float64(row.RequestCount) * 100
		}

		tpsScore := calcTpsScore(avgTps)
		ttftScore := calcTtftScore(int(avgTtftMs))
		successRateScore := successRate // successRate 已是 0-100 的百分制
		score := tpsScore*0.4 + ttftScore*0.3 + successRateScore*0.3

		vendorName := mv.VendorName
		if vendorName == "" {
			vendorName = "-"
		}

		items = append(items, LeaderboardItem{
			ModelName:   row.ModelName,
			VendorName:  vendorName,
			AvgTps:      avgTps,
			AvgTtftMs:   avgTtftMs,
			SuccessRate: successRate,
			Score:       score,
			SampleCount: row.RequestCount,
		})
	}

	// Step 4: 按指定字段排序，填充 rank
	desc := sortOrder != "asc"
	sortLeaderboardItemsBy(items, sortBy, desc)
	for i := range items {
		items[i].Rank = i + 1
	}

	return items, nil
}

// sortLeaderboardItemsBy 按指定字段排序
func sortLeaderboardItemsBy(items []LeaderboardItem, sortBy string, desc bool) {
	sort.SliceStable(items, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "tps":
			less = items[i].AvgTps < items[j].AvgTps
		case "ttft":
			less = items[i].AvgTtftMs < items[j].AvgTtftMs
		case "success_rate":
			less = items[i].SuccessRate < items[j].SuccessRate
		default: // "score"
			less = items[i].Score < items[j].Score
		}
		if desc {
			return !less
		}
		return less
	})
}

func GetPerfMetricsSummaryBucketsAll(startTs int64, endTs int64, groups []string) ([]PerfMetricSummaryBucket, error) {
	var summaries []PerfMetricSummaryBucket
	query := DB.Model(&PerfMetric{}).
		Select("model_name, bucket_ts, SUM(request_count) as request_count, SUM(success_count) as success_count, SUM(total_latency_ms) as total_latency_ms, SUM(output_tokens) as output_tokens, SUM(generation_ms) as generation_ms").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs)
	if groups != nil {
		if len(groups) == 0 {
			return summaries, nil
		}
		query = query.Where(commonGroupCol+" IN ?", groups)
	}
	err := query.
		Group("model_name, bucket_ts").
		Having("SUM(request_count) > 0").
		Order("bucket_ts ASC").
		Find(&summaries).Error
	return summaries, err
}

func DeletePerfMetricsBefore(cutoffTs int64) error {
	if cutoffTs <= 0 {
		return nil
	}
	return DB.Where("bucket_ts < ?", cutoffTs).Delete(&PerfMetric{}).Error
}

func PerfMetricStartTime(hours int) int64 {
	if hours <= 0 {
		hours = 24
	}
	return time.Now().Add(-time.Duration(hours) * time.Hour).Unix()
}

type ModelPerformanceDetailRecord struct {
	Group        string  `json:"group"`
	BucketTs     int64   `json:"bucket_ts"`
	RequestCount int64   `json:"request_count"`
	SuccessCount int64   `json:"success_count"`
	SuccessRate  float64 `json:"success_rate"`
	AvgTps       float64 `json:"avg_tps"`
	AvgTtftMs    int64   `json:"avg_ttft_ms"`
	AvgLatencyMs int64   `json:"avg_latency_ms"`
	TotalTokens  int64   `json:"total_tokens"`
}

type ModelPerformanceDetail struct {
	ModelName          string                         `json:"model_name"`
	VendorName         string                         `json:"vendor_name"`
	TotalRequests      int64                          `json:"total_requests"`
	TotalSuccess       int64                          `json:"total_success"`
	TotalFailed        int64                          `json:"total_failed"`
	OverallSuccessRate float64                        `json:"overall_success_rate"`
	AvgTps             float64                        `json:"avg_tps"`
	AvgTtftMs          int64                          `json:"avg_ttft_ms"`
	Records            []ModelPerformanceDetailRecord `json:"records"`
	TimeRange          struct {
		StartTs int64 `json:"start_ts"`
		EndTs   int64 `json:"end_ts"`
	} `json:"time_range"`
}

// GetModelPerformanceDetail 获取指定模型在指定时间范围内的性能详情
// 按 group + bucket_ts 分组返回详细记录
func GetModelPerformanceDetail(modelName string, startTs int64, endTs int64) (*ModelPerformanceDetail, error) {
	var metrics []PerfMetric
	err := DB.Where("model_name = ? AND bucket_ts >= ? AND bucket_ts <= ?", modelName, startTs, endTs).
		Order(fmt.Sprintf("bucket_ts DESC, %s ASC", commonGroupCol)).
		Find(&metrics).Error
	if err != nil {
		return nil, err
	}

	if len(metrics) == 0 {
		return &ModelPerformanceDetail{
			ModelName:  modelName,
			VendorName: "-",
			Records:    []ModelPerformanceDetailRecord{},
		}, nil
	}

	// 获取供应商名称
	var vendorName string
	type modelVendor struct {
		VendorID   int
		VendorName string
	}
	var mv modelVendor
	err = DB.Table("models").
		Select("models.vendor_id, vendors.name as vendor_name").
		Joins("LEFT JOIN vendors ON vendors.id = models.vendor_id").
		Where("models.model_name = ?", modelName).
		Scan(&mv).Error
	if err != nil || mv.VendorName == "" {
		vendorName = "-"
	} else {
		vendorName = mv.VendorName
	}

	// 计算汇总数据
	var totalRequests, totalSuccess int64
	records := make([]ModelPerformanceDetailRecord, 0, len(metrics))

	for _, m := range metrics {
		successRate := 0.0
		if m.RequestCount > 0 {
			successRate = float64(m.SuccessCount) / float64(m.RequestCount) * 100
		}

		avgTps := 0.0
		if m.GenerationMs > 0 {
			avgTps = float64(m.OutputTokens) / (float64(m.GenerationMs) / 1000.0)
		}

		avgTtftMs := int64(0)
		if m.TtftCount > 0 {
			avgTtftMs = m.TtftSumMs / m.TtftCount
		}

		avgLatencyMs := int64(0)
		if m.RequestCount > 0 {
			avgLatencyMs = m.TotalLatencyMs / m.RequestCount
		}

		records = append(records, ModelPerformanceDetailRecord{
			Group:        m.Group,
			BucketTs:     m.BucketTs,
			RequestCount: m.RequestCount,
			SuccessCount: m.SuccessCount,
			SuccessRate:  successRate,
			AvgTps:       avgTps,
			AvgTtftMs:    avgTtftMs,
			AvgLatencyMs: avgLatencyMs,
			TotalTokens:  m.OutputTokens,
		})

		totalRequests += m.RequestCount
		totalSuccess += m.SuccessCount
	}

	detail := &ModelPerformanceDetail{
		ModelName:     modelName,
		VendorName:    vendorName,
		TotalRequests: totalRequests,
		TotalSuccess:  totalSuccess,
		TotalFailed:   totalRequests - totalSuccess,
		Records:       records,
	}

	if totalRequests > 0 {
		detail.OverallSuccessRate = float64(totalSuccess) / float64(totalRequests) * 100
	}

	// 计算平均TPS和TTFT（加权平均）
	var totalTpsWeight, totalTpsSum float64
	var totalTtftWeight, totalTtftSum int64
	for _, r := range records {
		if r.AvgTps > 0 {
			totalTpsWeight += float64(r.RequestCount)
			totalTpsSum += r.AvgTps * float64(r.RequestCount)
		}
		if r.AvgTtftMs > 0 {
			totalTtftWeight += r.RequestCount
			totalTtftSum += r.AvgTtftMs * r.RequestCount
		}
	}
	if totalTpsWeight > 0 {
		detail.AvgTps = totalTpsSum / totalTpsWeight
	}
	if totalTtftWeight > 0 {
		detail.AvgTtftMs = totalTtftSum / totalTtftWeight
	}

	detail.TimeRange.StartTs = startTs
	detail.TimeRange.EndTs = endTs

	return detail, nil
}
