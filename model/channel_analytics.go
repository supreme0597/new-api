package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// ChannelSourceOverview 渠道来源概览统计
type ChannelSourceOverview struct {
	SourceCount       int `json:"source_count"`
	TotalCalls        int `json:"total_calls"`
	TotalTokens       int `json:"total_tokens"`
	ActiveUsers       int `json:"active_users"`
	UntaggedTokens    int `json:"untagged_tokens"`     // 无来源渠道的 Token
	TestChannelTokens int `json:"test_channel_tokens"` // 测试渠道的 Token
	AllTokens         int `json:"all_tokens"`          // 全部消费日志的 Token（不区分渠道）
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

// ChannelModelStat 按模型分组的统计
type ChannelModelStat struct {
	ModelName   string `json:"model_name"`
	CallCount   int    `json:"call_count"`
	TokenCount  int    `json:"token_count"`
	ActiveUsers int    `json:"active_users"`
}

// ChannelModelTrendPoint 模型趋势数据点
type ChannelModelTrendPoint struct {
	Time       string `json:"time"`
	ModelName  string `json:"model_name"`
	CallCount  int    `json:"call_count"`
	TokenCount int    `json:"token_count"`
}

// getChannelIDsBySource 获取指定来源的渠道ID列表（兼容 LOG_DB 与 DB 分离的场景）
func getChannelIDsBySource(source string) ([]int, error) {
	var channelIDs []int
	tx := DB.Model(&Channel{}).
		Where("source IS NOT NULL AND source != ''").
		Where("is_test_channel = ?", commonFalseVal)
	if source != "" {
		tx = tx.Where("source = ?", source)
	}
	if err := tx.Pluck("id", &channelIDs).Error; err != nil {
		return nil, err
	}
	return channelIDs, nil
}

// getAllSourceChannelIDs 获取所有来源的渠道ID映射（来源 → 渠道ID列表）
func getAllSourceChannelIDs() (map[string][]int, error) {
	type sourceChannels struct {
		Source string `json:"source"`
		ID     int    `json:"id"`
	}
	var results []sourceChannels
	err := DB.Model(&Channel{}).
		Select("source, id").
		Where("source IS NOT NULL AND source != ''").
		Where("is_test_channel = ?", commonFalseVal).
		Find(&results).Error
	if err != nil {
		return nil, err
	}

	sourceMap := make(map[string][]int)
	for _, r := range results {
		sourceMap[r.Source] = append(sourceMap[r.Source], r.ID)
	}
	return sourceMap, nil
}

// buildChannelIDFilter 构建渠道ID过滤条件（当 channelIDs 不为空时添加 IN 条件）
func buildChannelIDFilter(tx *gorm.DB, channelIDs []int) *gorm.DB {
	if len(channelIDs) > 0 {
		return tx.Where("logs.channel_id IN ?", channelIDs)
	}
	// 没有 channel 时返回一个不可能匹配的条件
	return tx.Where("1 = 0")
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

	// 获取所有有来源的渠道ID
	sourceMap, err := getAllSourceChannelIDs()
	if err != nil {
		return nil, err
	}
	var allChannelIDs []int
	for _, ids := range sourceMap {
		allChannelIDs = append(allChannelIDs, ids...)
	}

	if len(allChannelIDs) == 0 {
		return overview, nil
	}

	// 总调用次数、总 Token、活跃用户 — 使用 channel_id IN 过滤（兼容 LOG_DB 与 DB 分离）
	tx := LOG_DB.Table("logs").
		Select("COUNT(*) as total_calls, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as total_tokens, COUNT(DISTINCT logs.user_id) as active_users").
		Where("logs.type = ?", LogTypeConsume).
		Where("logs.channel_id IN ?", allChannelIDs)

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

	// 辅助排查：计算无来源渠道、测试渠道、全部渠道的 Token 消耗
	// 1. 无来源渠道（非测试）
	var noSourceChannelIDs []int
	if err := DB.Model(&Channel{}).
		Where("source IS NULL OR source = ''").
		Where("is_test_channel = ?", commonFalseVal).
		Pluck("id", &noSourceChannelIDs).Error; err != nil {
		return nil, err
	}
	if len(noSourceChannelIDs) > 0 {
		var untaggedRes overviewResult
		txUntagged := LOG_DB.Table("logs").
			Select("COUNT(*) as total_calls, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as total_tokens, COUNT(DISTINCT logs.user_id) as active_users").
			Where("logs.type = ?", LogTypeConsume).
			Where("logs.channel_id IN ?", noSourceChannelIDs)
		if startTimestamp != 0 {
			txUntagged = txUntagged.Where("logs.created_at >= ?", startTimestamp)
		}
		if endTimestamp != 0 {
			txUntagged = txUntagged.Where("logs.created_at <= ?", endTimestamp)
		}
		txUntagged.Scan(&untaggedRes)
		overview.UntaggedTokens = untaggedRes.TotalTokens
	}

	// 2. 测试渠道
	var testChannelIDs []int
	if err := DB.Model(&Channel{}).
		Where("is_test_channel = ?", commonTrueVal).
		Pluck("id", &testChannelIDs).Error; err != nil {
		return nil, err
	}
	if len(testChannelIDs) > 0 {
		var testRes overviewResult
		txTest := LOG_DB.Table("logs").
			Select("COUNT(*) as total_calls, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as total_tokens, COUNT(DISTINCT logs.user_id) as active_users").
			Where("logs.type = ?", LogTypeConsume).
			Where("logs.channel_id IN ?", testChannelIDs)
		if startTimestamp != 0 {
			txTest = txTest.Where("logs.created_at >= ?", startTimestamp)
		}
		if endTimestamp != 0 {
			txTest = txTest.Where("logs.created_at <= ?", endTimestamp)
		}
		txTest.Scan(&testRes)
		overview.TestChannelTokens = testRes.TotalTokens
	}

	// 3. 全部渠道（不限制 channel_id，仅限制 type 和时间）
	var allRes overviewResult
	txAll := LOG_DB.Table("logs").
		Select("COUNT(*) as total_calls, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as total_tokens, COUNT(DISTINCT logs.user_id) as active_users").
		Where("logs.type = ?", LogTypeConsume)
	if startTimestamp != 0 {
		txAll = txAll.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		txAll = txAll.Where("logs.created_at <= ?", endTimestamp)
	}
	txAll.Scan(&allRes)
	overview.AllTokens = allRes.TotalTokens

	return overview, nil
}

// GetChannelSourceStats 获取各来源的详细统计
func GetChannelSourceStats(startTimestamp, endTimestamp int64) ([]ChannelSourceStat, error) {
	// 获取所有来源的渠道ID映射
	sourceMap, err := getAllSourceChannelIDs()
	if err != nil {
		return nil, err
	}

	if len(sourceMap) == 0 {
		return []ChannelSourceStat{}, nil
	}

	// 按来源分别查询统计数据
	stats := make([]ChannelSourceStat, 0, len(sourceMap))
	for source, channelIDs := range sourceMap {
		if len(channelIDs) == 0 {
			continue
		}

		// 模型数
		var modelCount int64
		txModel := LOG_DB.Table("logs").
			Select("COUNT(DISTINCT logs.model_name)").
			Where("logs.type = ?", LogTypeConsume).
			Where("logs.channel_id IN ?", channelIDs)
		if startTimestamp != 0 {
			txModel = txModel.Where("logs.created_at >= ?", startTimestamp)
		}
		if endTimestamp != 0 {
			txModel = txModel.Where("logs.created_at <= ?", endTimestamp)
		}
		if err := txModel.Scan(&modelCount).Error; err != nil {
			return nil, err
		}

		// 调用统计
		type sourceLogStat struct {
			CallCount   int `json:"call_count"`
			TokenCount  int `json:"token_count"`
			ActiveUsers int `json:"active_users"`
		}
		var logStat sourceLogStat
		tx := LOG_DB.Table("logs").
			Select("COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count, COUNT(DISTINCT logs.user_id) as active_users").
			Where("logs.type = ?", LogTypeConsume).
			Where("logs.channel_id IN ?", channelIDs)
		if startTimestamp != 0 {
			tx = tx.Where("logs.created_at >= ?", startTimestamp)
		}
		if endTimestamp != 0 {
			tx = tx.Where("logs.created_at <= ?", endTimestamp)
		}
		if err := tx.Scan(&logStat).Error; err != nil {
			return nil, err
		}

		stats = append(stats, ChannelSourceStat{
			Source:      source,
			ModelCount:  int(modelCount),
			ActiveUsers: logStat.ActiveUsers,
			CallCount:   logStat.CallCount,
			TokenCount:  logStat.TokenCount,
		})
	}

	return stats, nil
}

// GetChannelSourceTrend 获取各来源的趋势数据
func GetChannelSourceTrend(startTimestamp, endTimestamp int64, granularity string, source string) ([]ChannelSourceTrendPoint, error) {
	// 构建时间分组表达式（跨数据库兼容）
	timeExpr := getTimeBucketExpr(granularity)

	// 获取渠道ID
	var channelIDs []int
	var err error
	if source != "" {
		channelIDs, err = getChannelIDsBySource(source)
	} else {
		// 所有来源
		sourceMap, mapErr := getAllSourceChannelIDs()
		if mapErr != nil {
			return nil, mapErr
		}
		for _, ids := range sourceMap {
			channelIDs = append(channelIDs, ids...)
		}
	}
	if err != nil {
		return nil, err
	}
	if len(channelIDs) == 0 {
		return []ChannelSourceTrendPoint{}, nil
	}

	// 需要来源信息，构建 channel_id → source 映射
	sourceByID, err := getSourceByChannelID()
	if err != nil {
		return nil, err
	}

	tx := LOG_DB.Table("logs").
		Select(fmt.Sprintf("%s as time_bucket, logs.channel_id, COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count", timeExpr)).
		Where("logs.type = ?", LogTypeConsume).
		Where("logs.channel_id IN ?", channelIDs)

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}

	type rawTrendPoint struct {
		TimeBucket string `json:"time_bucket"`
		ChannelID  int    `json:"channel_id"`
		CallCount  int    `json:"call_count"`
		TokenCount int    `json:"token_count"`
	}
	var rawPoints []rawTrendPoint
	if err := tx.Group("time_bucket, logs.channel_id").Order("time_bucket ASC").Find(&rawPoints).Error; err != nil {
		return nil, err
	}

	// 按 time_bucket + source 聚合
	type trendKey struct {
		Time   string
		Source string
	}
	trendMap := make(map[trendKey]*ChannelSourceTrendPoint)
	for _, rp := range rawPoints {
		src, ok := sourceByID[rp.ChannelID]
		if !ok {
			continue
		}
		key := trendKey{Time: rp.TimeBucket, Source: src}
		if existing, ok := trendMap[key]; ok {
			existing.CallCount += rp.CallCount
			existing.TokenCount += rp.TokenCount
		} else {
			trendMap[key] = &ChannelSourceTrendPoint{
				Time:       rp.TimeBucket,
				Source:     src,
				CallCount:  rp.CallCount,
				TokenCount: rp.TokenCount,
			}
		}
	}

	points := make([]ChannelSourceTrendPoint, 0, len(trendMap))
	for _, p := range trendMap {
		points = append(points, *p)
	}

	return points, nil
}

// getSourceByChannelID 获取 channel_id → source 的映射
func getSourceByChannelID() (map[int]string, error) {
	type channelSource struct {
		ID     int    `json:"id"`
		Source string `json:"source"`
	}
	var results []channelSource
	err := DB.Model(&Channel{}).
		Select("id, source").
		Where("source IS NOT NULL AND source != ''").
		Where("is_test_channel = ?", commonFalseVal).
		Find(&results).Error
	if err != nil {
		return nil, err
	}

	sourceByID := make(map[int]string, len(results))
	for _, r := range results {
		sourceByID[r.ID] = r.Source
	}
	return sourceByID, nil
}

// GetChannelSourceUserRanking 获取指定来源的活跃用户排行
func GetChannelSourceUserRanking(source string, startTimestamp, endTimestamp int64, limit int, modelName string) ([]ChannelSourceUserRanking, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	// 获取该来源的渠道ID
	channelIDs, err := getChannelIDsBySource(source)
	if err != nil {
		return nil, err
	}
	if len(channelIDs) == 0 {
		return []ChannelSourceUserRanking{}, nil
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
		Where("logs.type = ?", LogTypeConsume).
		Where("logs.channel_id IN ?", channelIDs).
		Where("logs.user_id > 0") // 排除系统用户（如采样的 user_id=0）

	if modelName != "" {
		tx = tx.Where("logs.model_name = ?", modelName)
	}

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
	// 获取该来源的渠道ID
	channelIDs, err := getChannelIDsBySource(source)
	if err != nil {
		return nil, err
	}
	if len(channelIDs) == 0 {
		return &ChannelSourceStat{Source: source}, nil
	}

	// 模型数：该来源下实际调用过的不同模型数量
	var modelCount int64
	txModel := LOG_DB.Table("logs").
		Select("COUNT(DISTINCT logs.model_name)").
		Where("logs.type = ?", LogTypeConsume).
		Where("logs.channel_id IN ?", channelIDs)
	if startTimestamp != 0 {
		txModel = txModel.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		txModel = txModel.Where("logs.created_at <= ?", endTimestamp)
	}
	if err := txModel.Scan(&modelCount).Error; err != nil {
		return nil, err
	}

	// 调用统计
	type detailResult struct {
		CallCount   int `json:"call_count"`
		TokenCount  int `json:"token_count"`
		ActiveUsers int `json:"active_users"`
	}
	var result detailResult
	tx := LOG_DB.Table("logs").
		Select("COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count, COUNT(DISTINCT logs.user_id) as active_users").
		Where("logs.type = ?", LogTypeConsume).
		Where("logs.channel_id IN ?", channelIDs)

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

// GetChannelModelStats 获取指定来源下各模型的统计
func GetChannelModelStats(source string, startTimestamp, endTimestamp int64) ([]ChannelModelStat, error) {
	// 获取该来源的渠道ID
	channelIDs, err := getChannelIDsBySource(source)
	if err != nil {
		return nil, err
	}
	if len(channelIDs) == 0 {
		return []ChannelModelStat{}, nil
	}

	type rawModelStat struct {
		ModelName   string `json:"model_name"`
		CallCount   int    `json:"call_count"`
		TokenCount  int    `json:"token_count"`
		ActiveUsers int    `json:"active_users"`
	}
	var rawStats []rawModelStat

	tx := LOG_DB.Table("logs").
		Select("logs.model_name, COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count, COUNT(DISTINCT logs.user_id) as active_users").
		Where("logs.type = ?", LogTypeConsume).
		Where("logs.channel_id IN ?", channelIDs).
		Where("logs.model_name IS NOT NULL AND logs.model_name != ''")

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}

	if err := tx.Group("logs.model_name").Order("call_count DESC").Find(&rawStats).Error; err != nil {
		return nil, err
	}

	result := make([]ChannelModelStat, 0, len(rawStats))
	for _, r := range rawStats {
		result = append(result, ChannelModelStat{
			ModelName:   r.ModelName,
			CallCount:   r.CallCount,
			TokenCount:  r.TokenCount,
			ActiveUsers: r.ActiveUsers,
		})
	}
	return result, nil
}

// GetChannelModelTrend 获取指定来源下各模型的趋势数据
func GetChannelModelTrend(source string, startTimestamp, endTimestamp int64, granularity string) ([]ChannelModelTrendPoint, error) {
	timeExpr := getTimeBucketExpr(granularity)

	// 获取该来源的渠道ID
	channelIDs, err := getChannelIDsBySource(source)
	if err != nil {
		return nil, err
	}
	if len(channelIDs) == 0 {
		return []ChannelModelTrendPoint{}, nil
	}

	type rawTrendPoint struct {
		TimeBucket string `json:"time_bucket"`
		ModelName  string `json:"model_name"`
		CallCount  int    `json:"call_count"`
		TokenCount int    `json:"token_count"`
	}
	var rawPoints []rawTrendPoint

	tx := LOG_DB.Table("logs").
		Select(fmt.Sprintf("%s as time_bucket, logs.model_name, COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count", timeExpr)).
		Where("logs.type = ?", LogTypeConsume).
		Where("logs.channel_id IN ?", channelIDs).
		Where("logs.model_name IS NOT NULL AND logs.model_name != ''")

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}

	if err := tx.Group("time_bucket, logs.model_name").Order("time_bucket ASC").Find(&rawPoints).Error; err != nil {
		return nil, err
	}

	result := make([]ChannelModelTrendPoint, 0, len(rawPoints))
	for _, rp := range rawPoints {
		result = append(result, ChannelModelTrendPoint{
			Time:       rp.TimeBucket,
			ModelName:  rp.ModelName,
			CallCount:  rp.CallCount,
			TokenCount: rp.TokenCount,
		})
	}
	return result, nil
}

// getTimeBucketExpr 获取跨数据库兼容的时间分组表达式
// 注意：MySQL 的 DATE() 返回 DATE 类型，配合 parseTime=true 时会被驱动转为 time.Time，
// 导致 JSON 序列化后变成 ISO 格式（2026-04-25T00:00:00Z）。
// 因此统一使用 DATE_FORMAT 返回 VARCHAR 字符串，避免类型转换问题。
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
		return "DATE_FORMAT(FROM_UNIXTIME(logs.created_at), '%Y-%m-%d')"
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
