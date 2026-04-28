package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
)

// ChannelSourceOverview 渠道来源概览统计
type ChannelSourceOverview struct {
	SourceCount int `json:"source_count"`
	TotalCalls  int `json:"total_calls"`
	TotalTokens int `json:"total_tokens"`
	ActiveUsers int `json:"active_users"`
}

// ChannelSourceStat 按来源分组的统计
type ChannelSourceStat struct {
	Source      string `json:"source"`
	ModelCount  int    `json:"model_count"`
	ActiveUsers int    `json:"active_users"`
	CallCount   int    `json:"call_count"`
	TokenCount  int    `json:"token_count"`
}

// ChannelSourceTrendPoint 趋势数据点
type ChannelSourceTrendPoint struct {
	Time       string `json:"time"`
	Source     string `json:"source"`
	CallCount  int    `json:"call_count"`
	TokenCount int    `json:"token_count"`
}

// ChannelSourceUserRanking 用户排行
type ChannelSourceUserRanking struct {
	UserId     int    `json:"user_id"`
	Username   string `json:"username"`
	CallCount  int    `json:"call_count"`
	TokenCount int    `json:"token_count"`
}

// GetChannelSourceOverview 获取渠道来源概览
func GetChannelSourceOverview(startTimestamp, endTimestamp int64) (*ChannelSourceOverview, error) {
	overview := &ChannelSourceOverview{}

	// 来源总数：有 source 值的不同来源数（排除测试渠道）
	var distinctSources []string
	if err := DB.Model(&Channel{}).
		Where("source IS NOT NULL AND source != ''").
		Where("is_test_channel = ?", commonFalseVal).
		Distinct("source").
		Pluck("source", &distinctSources).Error; err != nil {
		return nil, err
	}
	overview.SourceCount = len(distinctSources)

	// 总调用次数、总 Token、活跃用户 — 从 logs JOIN channels 按 source 过滤（排除测试渠道）
	tx := LOG_DB.Table("logs").
		Select("COUNT(*) as total_calls, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as total_tokens, COUNT(DISTINCT logs.user_id) as active_users").
		Joins("JOIN channels ON logs.channel_id = channels.id").
		Where("logs.type = ?", LogTypeConsume).
		Where("channels.source IS NOT NULL AND channels.source != ''").
		Where("channels.is_test_channel = ?", commonFalseVal)

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}

	type overviewResult struct {
		TotalCalls  int `json:"total_calls"`
		TotalTokens int `json:"total_tokens"`
		ActiveUsers int `json:"active_users"`
	}
	var result overviewResult
	if err := tx.Scan(&result).Error; err != nil {
		return nil, err
	}

	overview.TotalCalls = result.TotalCalls
	overview.TotalTokens = result.TotalTokens
	overview.ActiveUsers = result.ActiveUsers

	return overview, nil
}

// GetChannelSourceStats 获取各来源的详细统计
func GetChannelSourceStats(startTimestamp, endTimestamp int64) ([]ChannelSourceStat, error) {
	// 从 logs JOIN channels 获取各来源的模型数（排除测试渠道）
	type sourceModelCount struct {
		Source     string `json:"source"`
		ModelCount int    `json:"model_count"`
	}
	var modelCounts []sourceModelCount
	txModel := LOG_DB.Table("logs").
		Select("channels.source, COUNT(DISTINCT logs.model_name) as model_count").
		Joins("JOIN channels ON logs.channel_id = channels.id").
		Where("logs.type = ?", LogTypeConsume).
		Where("channels.source IS NOT NULL AND channels.source != ''").
		Where("channels.is_test_channel = ?", commonFalseVal)
	if startTimestamp != 0 {
		txModel = txModel.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		txModel = txModel.Where("logs.created_at <= ?", endTimestamp)
	}
	if err := txModel.Group("channels.source").Find(&modelCounts).Error; err != nil {
		return nil, err
	}
	modelCountMap := make(map[string]int, len(modelCounts))
	for _, mc := range modelCounts {
		modelCountMap[mc.Source] = mc.ModelCount
	}

	// 从 logs JOIN channels 获取各来源的调用统计（排除测试渠道）
	type sourceLogStat struct {
		Source      string `json:"source"`
		CallCount   int    `json:"call_count"`
		TokenCount  int    `json:"token_count"`
		ActiveUsers int    `json:"active_users"`
	}
	var logStats []sourceLogStat
	tx := LOG_DB.Table("logs").
		Select("channels.source, COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count, COUNT(DISTINCT logs.user_id) as active_users").
		Joins("JOIN channels ON logs.channel_id = channels.id").
		Where("logs.type = ?", LogTypeConsume).
		Where("channels.source IS NOT NULL AND channels.source != ''").
		Where("channels.is_test_channel = ?", commonFalseVal)

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}

	if err := tx.Group("channels.source").Find(&logStats).Error; err != nil {
		return nil, err
	}

	// 合并数据
	stats := make([]ChannelSourceStat, 0, len(logStats))
	for _, ls := range logStats {
		stats = append(stats, ChannelSourceStat{
			Source:      ls.Source,
			ModelCount:  modelCountMap[ls.Source],
			ActiveUsers: ls.ActiveUsers,
			CallCount:   ls.CallCount,
			TokenCount:  ls.TokenCount,
		})
	}

	return stats, nil
}

// GetChannelSourceTrend 获取各来源的趋势数据
func GetChannelSourceTrend(startTimestamp, endTimestamp int64, granularity string, source string) ([]ChannelSourceTrendPoint, error) {
	// 构建时间分组表达式（跨数据库兼容）
	timeExpr := getTimeBucketExpr(granularity)

	tx := LOG_DB.Table("logs").
		Select(fmt.Sprintf("%s as time_bucket, channels.source, COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count", timeExpr)).
		Joins("JOIN channels ON logs.channel_id = channels.id").
		Where("logs.type = ?", LogTypeConsume).
		Where("channels.source IS NOT NULL AND channels.source != ''").
		Where("channels.is_test_channel = ?", commonFalseVal)

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if source != "" {
		tx = tx.Where("channels.source = ?", source)
	}

	type rawTrendPoint struct {
		TimeBucket string `json:"time_bucket"`
		Source     string `json:"source"`
		CallCount  int    `json:"call_count"`
		TokenCount int    `json:"token_count"`
	}
	var rawPoints []rawTrendPoint
	if err := tx.Group("time_bucket, channels.source").Order("time_bucket ASC").Find(&rawPoints).Error; err != nil {
		return nil, err
	}

	points := make([]ChannelSourceTrendPoint, 0, len(rawPoints))
	for _, rp := range rawPoints {
		points = append(points, ChannelSourceTrendPoint{
			Time:       rp.TimeBucket,
			Source:     rp.Source,
			CallCount:  rp.CallCount,
			TokenCount: rp.TokenCount,
		})
	}

	return points, nil
}

// GetChannelSourceUserRanking 获取指定来源的活跃用户排行
func GetChannelSourceUserRanking(source string, startTimestamp, endTimestamp int64, limit int) ([]ChannelSourceUserRanking, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	type rawRanking struct {
		UserId     int    `json:"user_id"`
		Username   string `json:"username"`
		CallCount  int    `json:"call_count"`
		TokenCount int    `json:"token_count"`
	}
	var rankings []rawRanking

	tx := LOG_DB.Table("logs").
		Select("logs.user_id, logs.username, COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count").
		Joins("JOIN channels ON logs.channel_id = channels.id").
		Where("logs.type = ?", LogTypeConsume).
		Where("channels.source = ?", source).
		Where("channels.is_test_channel = ?", commonFalseVal).
		Where("logs.user_id > 0") // 排除系统用户（如采样的 user_id=0）

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}

	if err := tx.Group("logs.user_id, logs.username").Order("call_count DESC").Limit(limit).Find(&rankings).Error; err != nil {
		return nil, err
	}

	result := make([]ChannelSourceUserRanking, 0, len(rankings))
	for _, r := range rankings {
		result = append(result, ChannelSourceUserRanking{
			UserId:     r.UserId,
			Username:   r.Username,
			CallCount:  r.CallCount,
			TokenCount: r.TokenCount,
		})
	}

	return result, nil
}

// GetChannelSourceDetail 获取单个来源的详情统计
func GetChannelSourceDetail(source string, startTimestamp, endTimestamp int64) (*ChannelSourceStat, error) {
	// 模型数：该来源下实际调用过的不同模型数量（排除测试渠道）
	var modelCount int64
	txModel := LOG_DB.Table("logs").
		Select("COUNT(DISTINCT logs.model_name) as model_count").
		Joins("JOIN channels ON logs.channel_id = channels.id").
		Where("logs.type = ?", LogTypeConsume).
		Where("channels.source = ?", source).
		Where("channels.is_test_channel = ?", commonFalseVal)
	if startTimestamp != 0 {
		txModel = txModel.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		txModel = txModel.Where("logs.created_at <= ?", endTimestamp)
	}
	if err := txModel.Scan(&modelCount).Error; err != nil {
		return nil, err
	}

	// 调用统计（排除测试渠道）
	type detailResult struct {
		CallCount   int `json:"call_count"`
		TokenCount  int `json:"token_count"`
		ActiveUsers int `json:"active_users"`
	}
	var result detailResult
	tx := LOG_DB.Table("logs").
		Select("COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count, COUNT(DISTINCT logs.user_id) as active_users").
		Joins("JOIN channels ON logs.channel_id = channels.id").
		Where("logs.type = ?", LogTypeConsume).
		Where("channels.source = ?", source).
		Where("channels.is_test_channel = ?", commonFalseVal)

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}

	if err := tx.Scan(&result).Error; err != nil {
		return nil, err
	}

	return &ChannelSourceStat{
		Source:      source,
		ModelCount:  int(modelCount),
		ActiveUsers: result.ActiveUsers,
		CallCount:   result.CallCount,
		TokenCount:  result.TokenCount,
	}, nil
}

// getTimeBucketExpr 获取跨数据库兼容的时间分组表达式
func getTimeBucketExpr(granularity string) string {
	switch granularity {
	case "hour":
		if common.UsingPostgreSQL {
			return "to_char(to_timestamp(logs.created_at), 'YYYY-MM-DD HH24:00')"
		} else if common.UsingSQLite {
			return "strftime('%Y-%m-%d %H:00', logs.created_at, 'unixepoch')"
		}
		return "DATE_FORMAT(FROM_UNIXTIME(logs.created_at), '%Y-%m-%d %H:00')"
	case "day":
		if common.UsingPostgreSQL {
			return "to_char(to_timestamp(logs.created_at), 'YYYY-MM-DD')"
		} else if common.UsingSQLite {
			return "strftime('%Y-%m-%d', logs.created_at, 'unixepoch')"
		}
		return "DATE(FROM_UNIXTIME(logs.created_at))"
	case "week":
		if common.UsingPostgreSQL {
			return "to_char(date_trunc('week', to_timestamp(logs.created_at)), 'YYYY-MM-DD')"
		} else if common.UsingSQLite {
			return "strftime('%Y-W%W', logs.created_at, 'unixepoch')"
		}
		return "DATE_FORMAT(FROM_UNIXTIME(logs.created_at), '%Y-%u')"
	default:
		return getTimeBucketExpr("day")
	}
}
