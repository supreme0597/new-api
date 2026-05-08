package model

import (
	"time"

	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"
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
			"request_count":    gorm.Expr("request_count + ?", metric.RequestCount),
			"success_count":    gorm.Expr("success_count + ?", metric.SuccessCount),
			"total_latency_ms": gorm.Expr("total_latency_ms + ?", metric.TotalLatencyMs),
			"ttft_sum_ms":      gorm.Expr("ttft_sum_ms + ?", metric.TtftSumMs),
			"ttft_count":       gorm.Expr("ttft_count + ?", metric.TtftCount),
			"output_tokens":    gorm.Expr("output_tokens + ?", metric.OutputTokens),
			"generation_ms":    gorm.Expr("generation_ms + ?", metric.GenerationMs),
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

func GetPerfMetricsSummaryAll(startTs int64, endTs int64) ([]PerfMetricSummary, error) {
	var summaries []PerfMetricSummary
	err := DB.Model(&PerfMetric{}).
		Select("model_name, SUM(request_count) as request_count, SUM(success_count) as success_count, SUM(total_latency_ms) as total_latency_ms, SUM(output_tokens) as output_tokens, SUM(generation_ms) as generation_ms").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs).
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
func GetLeaderboardData(startTs int64, endTs int64, vendorId int) ([]LeaderboardItem, error) {
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

		// 计算指标
		avgTps := 0.0
		if row.GenerationMs > 0 {
			avgTps = float64(row.OutputTokens) / (float64(row.GenerationMs) / 1000.0)
		}
		avgTtftMs := int64(0)
		if row.TtftCount > 0 {
			avgTtftMs = row.TtftSumMs / row.TtftCount
		}
		successRate := 0.0
		if row.RequestCount > 0 {
			successRate = float64(row.SuccessCount) / float64(row.RequestCount) * 100
		}

		// 计算评分
		tpsScore := calcTpsScore(avgTps)
		ttftScore := calcTtftScore(int(avgTtftMs))
		score := tpsScore*0.6 + ttftScore*0.4

		vendorName := ""
		if exists {
			vendorName = mv.VendorName
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

	// Step 4: 按 score 降序排序，填充 rank
	sortLeaderboardItems(items)
	for i := range items {
		items[i].Rank = i + 1
	}

	return items, nil
}

// sortLeaderboardItems 按 score 降序排序
func sortLeaderboardItems(items []LeaderboardItem) {
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if items[j].Score > items[i].Score {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
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

// RecordSamplingMetric 直接将采样性能数据写入 perf_metrics 表
// 这是采样任务专用的写入路径，绕过 pkg/perf_metrics 的内存缓冲
func RecordSamplingMetric(modelName string, group string, latencyMs int64, ttftMs int64, outputTokens int64, generationMs int64) error {
	now := time.Now().Unix()
	bucketSeconds := perf_metrics_setting.GetBucketSeconds()
	if bucketSeconds <= 0 {
		bucketSeconds = 3600
	}
	bucketTs := now - (now % bucketSeconds)

	if group == "" {
		group = "default"
	}

	metric := &PerfMetric{
		ModelName:      modelName,
		Group:          group,
		BucketTs:       bucketTs,
		RequestCount:   1,
		SuccessCount:   1,
		TotalLatencyMs: latencyMs,
		TtftSumMs:      ttftMs,
		TtftCount:      1,
		OutputTokens:   outputTokens,
		GenerationMs:   generationMs,
	}
	return UpsertPerfMetric(metric)
}
