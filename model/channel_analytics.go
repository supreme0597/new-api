package model

import (
	"fmt"
	"sort"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// ChannelVendorOverview 渠道供应商概览统计
type ChannelVendorOverview struct {
	VendorCount       int `json:"vendor_count"`
	TotalCalls        int `json:"total_calls"`
	TotalTokens       int `json:"total_tokens"`
	ActiveUsers       int `json:"active_users"`
	NoVendorTokens    int `json:"no_vendor_tokens"`    // 无供应商渠道的 Token
	TestChannelTokens int `json:"test_channel_tokens"` // 测试渠道的 Token
	AllTokens         int `json:"all_tokens"`          // 全部消费日志的 Token（不区分渠道）
}

// ChannelVendorStat 按供应商分组的统计
type ChannelVendorStat struct {
	VendorName  string `json:"vendor_name"`
	ModelCount  int    `json:"model_count"`
	ActiveUsers int    `json:"active_users"`
	CallCount   int    `json:"call_count"`
	TokenCount  int    `json:"token_count"`
}

// ChannelVendorTrendPoint 趋势数据点
type ChannelVendorTrendPoint struct {
	Time       string `json:"time"`
	VendorName string `json:"vendor_name"`
	CallCount  int    `json:"call_count"`
	TokenCount int    `json:"token_count"`
}

// ChannelVendorUserRanking 用户排行
type ChannelVendorUserRanking struct {
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

// ChannelModelComparisonItem 模型对比选项（用于选择器）
type ChannelModelComparisonItem struct {
	VendorName string `json:"vendor_name"`
	ModelName  string `json:"model_name"`
	CallCount  int    `json:"call_count"`
	TokenCount int    `json:"token_count"`
}

// ChannelModelComparisonPoint 模型对比趋势数据点
type ChannelModelComparisonPoint struct {
	Time       string `json:"time"`
	VendorName string `json:"vendor_name"`
	ModelName  string `json:"model_name"`
	CallCount  int    `json:"call_count"`
	TokenCount int    `json:"token_count"`
}

// nonTestChannelCondition 返回排除测试渠道的条件
func nonTestChannelCondition() string {
	return "(owner_user_id IS NULL OR owner_user_id != -999)"
}

// testChannelCondition 返回筛选测试渠道的条件
func testChannelCondition() string {
	return "owner_user_id = -999"
}

// getChannelIDsByVendor 获取指定供应商的渠道ID列表（兼容 LOG_DB 与 DB 分离的场景）
func getChannelIDsByVendor(vendorId int) ([]int, error) {
	var channelIDs []int
	tx := DB.Model(&Channel{}).
		Where("vendor_id IS NOT NULL AND vendor_id > 0").
		Where(nonTestChannelCondition())
	if vendorId > 0 {
		tx = tx.Where("vendor_id = ?", vendorId)
	}
	if err := tx.Pluck("id", &channelIDs).Error; err != nil {
		return nil, err
	}
	return channelIDs, nil
}

// getAllVendorChannelIDs 获取所有供应商的渠道ID映射（vendorId → 渠道ID列表）
func getAllVendorChannelIDs() (map[int][]int, error) {
	type vendorChannels struct {
		VendorID int `json:"vendor_id"`
		ID       int `json:"id"`
	}
	var results []vendorChannels
	err := DB.Model(&Channel{}).
		Select("vendor_id, id").
		Where("vendor_id IS NOT NULL AND vendor_id > 0").
		Where(nonTestChannelCondition()).
		Find(&results).Error
	if err != nil {
		return nil, err
	}

	vendorMap := make(map[int][]int)
	for _, r := range results {
		vendorMap[r.VendorID] = append(vendorMap[r.VendorID], r.ID)
	}
	return vendorMap, nil
}

// buildChannelIDFilter 构建渠道ID过滤条件（当 channelIDs 不为空时添加 IN 条件）
func buildChannelIDFilter(tx *gorm.DB, channelIDs []int) *gorm.DB {
	if len(channelIDs) > 0 {
		return tx.Where("logs.channel_id IN ?", channelIDs)
	}
	// 没有 channel 时返回一个不可能匹配的条件
	return tx.Where("1 = 0")
}

// GetChannelVendorOverview 获取渠道供应商概览
func GetChannelVendorOverview(startTimestamp, endTimestamp int64) (*ChannelVendorOverview, error) {
	overview := &ChannelVendorOverview{}

	// 供应商总数：有 vendor_id 值的不同供应商数（排除测试渠道）
	var distinctVendorIDs []int
	if err := DB.Model(&Channel{}).
		Where("vendor_id IS NOT NULL AND vendor_id > 0").
		Where(nonTestChannelCondition()).
		Distinct("vendor_id").
		Pluck("vendor_id", &distinctVendorIDs).Error; err != nil {
		return nil, err
	}
	overview.VendorCount = len(distinctVendorIDs)

	// 获取所有有供应商的渠道ID
	vendorMap, err := getAllVendorChannelIDs()
	if err != nil {
		return nil, err
	}
	var allChannelIDs []int
	for _, ids := range vendorMap {
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

	// 辅助排查：计算无供应商渠道、测试渠道、全部渠道的 Token 消耗
	// 1. 无供应商渠道（非测试）
	var noVendorChannelIDs []int
	if err := DB.Model(&Channel{}).
		Where("vendor_id IS NULL OR vendor_id = 0").
		Where(nonTestChannelCondition()).
		Pluck("id", &noVendorChannelIDs).Error; err != nil {
		return nil, err
	}
	if len(noVendorChannelIDs) > 0 {
		var noVendorRes overviewResult
		txNoVendor := LOG_DB.Table("logs").
			Select("COUNT(*) as total_calls, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as total_tokens, COUNT(DISTINCT logs.user_id) as active_users").
			Where("logs.type = ?", LogTypeConsume).
			Where("logs.channel_id IN ?", noVendorChannelIDs)
		if startTimestamp != 0 {
			txNoVendor = txNoVendor.Where("logs.created_at >= ?", startTimestamp)
		}
		if endTimestamp != 0 {
			txNoVendor = txNoVendor.Where("logs.created_at <= ?", endTimestamp)
		}
		txNoVendor.Scan(&noVendorRes)
		overview.NoVendorTokens = noVendorRes.TotalTokens
	}

	// 2. 测试渠道
	var testChannelIDs []int
	if err := DB.Model(&Channel{}).
		Where(testChannelCondition()).
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

// GetChannelVendorStats 获取各供应商的详细统计
func GetChannelVendorStats(startTimestamp, endTimestamp int64) ([]ChannelVendorStat, error) {
	// 获取所有供应商的渠道ID映射
	vendorMap, err := getAllVendorChannelIDs()
	if err != nil {
		return nil, err
	}

	if len(vendorMap) == 0 {
		return []ChannelVendorStat{}, nil
	}

	// 构建 vendorId → vendorName 映射
	vendorNameByID, err := getVendorNameByVendorID()
	if err != nil {
		return nil, err
	}

	// 按供应商分别查询统计数据
	stats := make([]ChannelVendorStat, 0, len(vendorMap))
	for vendorId, channelIDs := range vendorMap {
		if len(channelIDs) == 0 {
			continue
		}

		vendorName := ""
		if name, ok := vendorNameByID[vendorId]; ok {
			vendorName = name
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
		type vendorLogStat struct {
			CallCount   int `json:"call_count"`
			TokenCount  int `json:"token_count"`
			ActiveUsers int `json:"active_users"`
		}
		var logStat vendorLogStat
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

		stats = append(stats, ChannelVendorStat{
			VendorName:  vendorName,
			ModelCount:  int(modelCount),
			ActiveUsers: logStat.ActiveUsers,
			CallCount:   logStat.CallCount,
			TokenCount:  logStat.TokenCount,
		})
	}

	return stats, nil
}

// GetChannelVendorTrend 获取各供应商的趋势数据
func GetChannelVendorTrend(startTimestamp, endTimestamp int64, granularity string, vendorId int) ([]ChannelVendorTrendPoint, error) {
	// 构建时间分组表达式（跨数据库兼容）
	timeExpr := getTimeBucketExpr(granularity)

	// 获取渠道ID
	var channelIDs []int
	var err error
	if vendorId > 0 {
		channelIDs, err = getChannelIDsByVendor(vendorId)
	} else {
		// 所有供应商
		vendorMap, mapErr := getAllVendorChannelIDs()
		if mapErr != nil {
			return nil, mapErr
		}
		for _, ids := range vendorMap {
			channelIDs = append(channelIDs, ids...)
		}
	}
	if err != nil {
		return nil, err
	}
	if len(channelIDs) == 0 {
		return []ChannelVendorTrendPoint{}, nil
	}

	// 需要供应商信息，构建 channel_id → vendorName 映射
	vendorNameByID, err := getVendorNameByChannelID()
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

	// 按 time_bucket + vendorName 聚合
	type trendKey struct {
		Time       string
		VendorName string
	}
	trendMap := make(map[trendKey]*ChannelVendorTrendPoint)
	for _, rp := range rawPoints {
		vn, ok := vendorNameByID[rp.ChannelID]
		if !ok {
			continue
		}
		key := trendKey{Time: rp.TimeBucket, VendorName: vn}
		if existing, ok := trendMap[key]; ok {
			existing.CallCount += rp.CallCount
			existing.TokenCount += rp.TokenCount
		} else {
			trendMap[key] = &ChannelVendorTrendPoint{
				Time:       rp.TimeBucket,
				VendorName: vn,
				CallCount:  rp.CallCount,
				TokenCount: rp.TokenCount,
			}
		}
	}

	points := make([]ChannelVendorTrendPoint, 0, len(trendMap))
	for _, p := range trendMap {
		points = append(points, *p)
	}

	return points, nil
}

// getVendorNameByChannelID 获取 channel_id → vendorName 的映射
func getVendorNameByChannelID() (map[int]string, error) {
	type channelVendor struct {
		ID         int    `json:"id"`
		VendorName string `json:"vendor_name"`
	}
	var results []channelVendor
	err := DB.Model(&Channel{}).
		Select("id, vendor_name").
		Where("vendor_id IS NOT NULL AND vendor_id > 0").
		Where(nonTestChannelCondition()).
		Where("vendor_name IS NOT NULL AND vendor_name != ''").
		Find(&results).Error
	if err != nil {
		return nil, err
	}

	vendorNameByID := make(map[int]string, len(results))
	for _, r := range results {
		vendorNameByID[r.ID] = r.VendorName
	}
	return vendorNameByID, nil
}

// getVendorNameByVendorID 获取 vendorId → vendorName 的映射
func getVendorNameByVendorID() (map[int]string, error) {
	type vendorInfo struct {
		VendorID   int    `json:"vendor_id"`
		VendorName string `json:"vendor_name"`
	}
	var results []vendorInfo
	err := DB.Model(&Channel{}).
		Select("DISTINCT vendor_id, vendor_name").
		Where("vendor_id IS NOT NULL AND vendor_id > 0").
		Where(nonTestChannelCondition()).
		Where("vendor_name IS NOT NULL AND vendor_name != ''").
		Find(&results).Error
	if err != nil {
		return nil, err
	}

	nameByID := make(map[int]string, len(results))
	for _, r := range results {
		nameByID[r.VendorID] = r.VendorName
	}
	return nameByID, nil
}

// GetChannelVendorUserRanking 获取指定供应商的活跃用户排行
func GetChannelVendorUserRanking(vendorId int, startTimestamp, endTimestamp int64, limit int, modelName string, sortBy string) ([]ChannelVendorUserRanking, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	if sortBy != "token_count" && sortBy != "call_count" {
		sortBy = "token_count"
	}

	// 获取该供应商的渠道ID
	channelIDs, err := getChannelIDsByVendor(vendorId)
	if err != nil {
		return nil, err
	}
	if len(channelIDs) == 0 {
		return []ChannelVendorUserRanking{}, nil
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

	orderCol := "token_count"
	if sortBy == "call_count" {
		orderCol = "call_count"
	}

	if err := tx.Group("logs.user_id, logs.username").Order(orderCol + " DESC").Limit(limit).Find(&rankings).Error; err != nil {
		return nil, err
	}

	result := make([]ChannelVendorUserRanking, 0, len(rankings))
	for _, r := range rankings {
		result = append(result, ChannelVendorUserRanking{
			UserId:     r.UserId,
			Username:   r.Username,
			CallCount:  r.CallCount,
			TokenCount: r.TokenCount,
		})
	}

	return result, nil
}

// GetChannelVendorDetail 获取单个供应商的详情统计
func GetChannelVendorDetail(vendorId int, startTimestamp, endTimestamp int64) (*ChannelVendorStat, error) {
	// 获取该供应商的渠道ID
	channelIDs, err := getChannelIDsByVendor(vendorId)
	if err != nil {
		return nil, err
	}

	// 获取供应商名称
	vendorNameByID, err := getVendorNameByVendorID()
	if err != nil {
		return nil, err
	}
	vendorName := ""
	if name, ok := vendorNameByID[vendorId]; ok {
		vendorName = name
	}

	if len(channelIDs) == 0 {
		return &ChannelVendorStat{VendorName: vendorName}, nil
	}

	// 模型数：该供应商下实际调用过的不同模型数量
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

	return &ChannelVendorStat{
		VendorName:  vendorName,
		ModelCount:  int(modelCount),
		ActiveUsers: result.ActiveUsers,
		CallCount:   result.CallCount,
		TokenCount:  result.TokenCount,
	}, nil
}

// GetChannelModelStats 获取指定供应商下各模型的统计
func GetChannelModelStats(vendorId int, startTimestamp, endTimestamp int64) ([]ChannelModelStat, error) {
	// 获取该供应商的渠道ID
	channelIDs, err := getChannelIDsByVendor(vendorId)
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

// GetChannelModelTrend 获取指定供应商下各模型的趋势数据
func GetChannelModelTrend(vendorId int, startTimestamp, endTimestamp int64, granularity string) ([]ChannelModelTrendPoint, error) {
	timeExpr := getTimeBucketExpr(granularity)

	// 获取该供应商的渠道ID
	channelIDs, err := getChannelIDsByVendor(vendorId)
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

// GetChannelModelComparisonItems 获取所有供应商+模型组合列表（用于选择器）
func GetChannelModelComparisonItems(startTimestamp, endTimestamp int64) ([]ChannelModelComparisonItem, error) {
	// 获取所有有供应商的渠道ID
	vendorMap, err := getAllVendorChannelIDs()
	if err != nil {
		return nil, err
	}
	var allChannelIDs []int
	for _, ids := range vendorMap {
		allChannelIDs = append(allChannelIDs, ids...)
	}
	if len(allChannelIDs) == 0 {
		return []ChannelModelComparisonItem{}, nil
	}

	// 需要供应商信息
	vendorNameByID, err := getVendorNameByChannelID()
	if err != nil {
		return nil, err
	}

	type rawItem struct {
		ChannelID  int    `json:"channel_id"`
		ModelName  string `json:"model_name"`
		CallCount  int    `json:"call_count"`
		TokenCount int    `json:"token_count"`
	}

	tx := LOG_DB.Table("logs").
		Select("logs.channel_id, logs.model_name, COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count").
		Where("logs.type = ?", LogTypeConsume).
		Where("logs.channel_id IN ?", allChannelIDs).
		Where("logs.model_name IS NOT NULL AND logs.model_name != ''")

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}

	var rawItems []rawItem
	if err := tx.Group("logs.channel_id, logs.model_name").Find(&rawItems).Error; err != nil {
		return nil, err
	}

	// 按 vendorName + model_name 聚合
	type itemKey struct {
		VendorName string
		ModelName  string
	}
	itemMap := make(map[itemKey]*ChannelModelComparisonItem)
	for _, ri := range rawItems {
		vn, ok := vendorNameByID[ri.ChannelID]
		if !ok {
			continue
		}
		key := itemKey{VendorName: vn, ModelName: ri.ModelName}
		if existing, ok := itemMap[key]; ok {
			existing.CallCount += ri.CallCount
			existing.TokenCount += ri.TokenCount
		} else {
			itemMap[key] = &ChannelModelComparisonItem{
				VendorName: vn,
				ModelName:  ri.ModelName,
				CallCount:  ri.CallCount,
				TokenCount: ri.TokenCount,
			}
		}
	}

	result := make([]ChannelModelComparisonItem, 0, len(itemMap))
	for _, item := range itemMap {
		result = append(result, *item)
	}

	// 按 token_count 降序排列
	sort.Slice(result, func(i, j int) bool {
		return result[i].TokenCount > result[j].TokenCount
	})

	return result, nil
}

// GetChannelModelComparisonTrend 获取模型对比趋势数据
func GetChannelModelComparisonTrend(startTimestamp, endTimestamp int64, granularity string, vendorNames []string, modelNames []string) ([]ChannelModelComparisonPoint, error) {
	timeExpr := getTimeBucketExpr(granularity)

	// 获取所有有供应商的渠道ID
	vendorMap, err := getAllVendorChannelIDs()
	if err != nil {
		return nil, err
	}
	var allChannelIDs []int
	for _, ids := range vendorMap {
		allChannelIDs = append(allChannelIDs, ids...)
	}
	if len(allChannelIDs) == 0 {
		return []ChannelModelComparisonPoint{}, nil
	}

	// 需要供应商信息
	vendorNameByID, err := getVendorNameByChannelID()
	if err != nil {
		return nil, err
	}

	// 如果指定了供应商，过滤 channelIDs
	var filteredChannelIDs []int
	if len(vendorNames) > 0 {
		vendorNameSet := make(map[string]bool, len(vendorNames))
		for _, vn := range vendorNames {
			vendorNameSet[vn] = true
		}
		for _, ri := range vendorNameByID {
			if vendorNameSet[ri] {
				// 找到所有属于此 vendorName 的 channel
			}
		}
		// 通过 vendorNameByID 找到匹配的 channelIDs
		for chID, vn := range vendorNameByID {
			if vendorNameSet[vn] {
				filteredChannelIDs = append(filteredChannelIDs, chID)
			}
		}
	} else {
		filteredChannelIDs = allChannelIDs
	}
	if len(filteredChannelIDs) == 0 {
		return []ChannelModelComparisonPoint{}, nil
	}

	type rawPoint struct {
		TimeBucket string `json:"time_bucket"`
		ChannelID  int    `json:"channel_id"`
		ModelName  string `json:"model_name"`
		CallCount  int    `json:"call_count"`
		TokenCount int    `json:"token_count"`
	}

	tx := LOG_DB.Table("logs").
		Select(fmt.Sprintf("%s as time_bucket, logs.channel_id, logs.model_name, COUNT(*) as call_count, COALESCE(SUM(logs.prompt_tokens + logs.completion_tokens), 0) as token_count", timeExpr)).
		Where("logs.type = ?", LogTypeConsume).
		Where("logs.channel_id IN ?", filteredChannelIDs).
		Where("logs.model_name IS NOT NULL AND logs.model_name != ''")

	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if len(modelNames) > 0 {
		tx = tx.Where("logs.model_name IN ?", modelNames)
	}

	var rawPoints []rawPoint
	if err := tx.Group("time_bucket, logs.channel_id, logs.model_name").Order("time_bucket ASC").Find(&rawPoints).Error; err != nil {
		return nil, err
	}

	// 按 time_bucket + vendorName + model_name 聚合
	type pointKey struct {
		Time       string
		VendorName string
		ModelName  string
	}
	pointMap := make(map[pointKey]*ChannelModelComparisonPoint)
	for _, rp := range rawPoints {
		vn, ok := vendorNameByID[rp.ChannelID]
		if !ok {
			continue
		}
		key := pointKey{Time: rp.TimeBucket, VendorName: vn, ModelName: rp.ModelName}
		if existing, ok := pointMap[key]; ok {
			existing.CallCount += rp.CallCount
			existing.TokenCount += rp.TokenCount
		} else {
			pointMap[key] = &ChannelModelComparisonPoint{
				Time:       rp.TimeBucket,
				VendorName: vn,
				ModelName:  rp.ModelName,
				CallCount:  rp.CallCount,
				TokenCount: rp.TokenCount,
			}
		}
	}

	result := make([]ChannelModelComparisonPoint, 0, len(pointMap))
	for _, p := range pointMap {
		result = append(result, *p)
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
