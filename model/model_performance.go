package model

import (
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// ModelPerformance 记录模型响应性能数据
type ModelPerformance struct {
	Id         int     `json:"id"`
	ChannelId  int     `json:"channel_id" gorm:"index"`
	Model      string  `json:"model" gorm:"type:varchar(128);index"`
	Tps        float64 `json:"tps"`         // 每秒输出 Token 数
	Ttft       int     `json:"ttft"`        // 首次响应时间（毫秒）
	SampleSize int     `json:"sample_size"` // 累计采样次数
	UpdatedAt  int64   `json:"updated_at" gorm:"bigint"`
}

func (ModelPerformance) TableName() string {
	return "model_performances"
}

// modelPerformanceUpsertMutex 防止并发采样时 UpsertModelPerformance 的读-写竞争
var modelPerformanceUpsertMutex sync.Mutex

// GetModelPerformanceList 获取排行榜数据
func GetModelPerformanceList(vendorId int, page int, pageSize int) ([]*ModelPerformanceItem, int64, error) {
	var total int64

	// 基础查询：只查测试渠道的性能数据
	query := DB.Model(&ModelPerformance{}).
		Joins("JOIN channels ON channels.id = model_performances.channel_id").
		Where("channels.owner_user_id = ?", TestChannelOwnerUserId)

	// 按供应商筛选
	if vendorId > 0 {
		query = query.Where("channels.vendor_id = ?", vendorId)
	}

	// 先统计总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 查询所有数据（在内存中按综合评分排序后再分页）
	var results []struct {
		ModelPerformance
		ChannelName *string `gorm:"column:name"`
		VendorName  *string `gorm:"column:vendor_name"`
	}

	err := query.
		Select("model_performances.*, channels.name, channels.vendor_name").
		Find(&results).Error

	if err != nil {
		return nil, 0, err
	}

	// 计算评分并组装结果
	type scoredItem struct {
		item  *ModelPerformanceItem
		score float64
	}
	scoredItems := make([]scoredItem, 0, len(results))
	for _, r := range results {
		tpsScore := calcTpsScore(r.Tps)
		ttftScore := calcTtftScore(r.Ttft)
		score := tpsScore*0.6 + ttftScore*0.4

		channelName := ""
		if r.ChannelName != nil {
			channelName = *r.ChannelName
		}
		vendorName := ""
		if r.VendorName != nil {
			vendorName = *r.VendorName
		}

		scoredItems = append(scoredItems, scoredItem{
			item: &ModelPerformanceItem{
				Model:       r.Model,
				VendorName:  vendorName,
				Tps:         r.Tps,
				Ttft:        r.Ttft,
				Score:       score,
				SampleSize:  r.SampleSize,
				UpdatedAt:   r.UpdatedAt,
				ChannelId:   r.ChannelId,
				ChannelName: channelName,
			},
			score: score,
		})
	}

	// 按综合评分降序排序
	for i := 0; i < len(scoredItems); i++ {
		for j := i + 1; j < len(scoredItems); j++ {
			if scoredItems[j].score > scoredItems[i].score {
				scoredItems[i], scoredItems[j] = scoredItems[j], scoredItems[i]
			}
		}
	}

	// 手动分页
	offset := (page - 1) * pageSize
	if offset > len(scoredItems) {
		offset = len(scoredItems)
	}
	endIdx := offset + pageSize
	if endIdx > len(scoredItems) {
		endIdx = len(scoredItems)
	}

	items := make([]*ModelPerformanceItem, 0, endIdx-offset)
	for i := offset; i < endIdx; i++ {
		scoredItems[i].item.Rank = i + 1
		items = append(items, scoredItems[i].item)
	}

	return items, total, nil
}

// ModelPerformanceItem 排行榜条目（含计算评分）
type ModelPerformanceItem struct {
	Rank        int     `json:"rank"`
	Model       string  `json:"model"`
	VendorName  string  `json:"vendor_name"`
	Tps         float64 `json:"tps"`
	Ttft        int     `json:"ttft"`
	Score       float64 `json:"score"`
	SampleSize  int     `json:"sample_size"`
	UpdatedAt   int64   `json:"updated_at"`
	ChannelId   int     `json:"channel_id"`
	ChannelName string  `json:"channel_name"`
}

// getBenchmarkValue 从 OptionMap 读取基准值，解析失败时返回默认值
func getBenchmarkValue(key string, defaultVal float64) float64 {
	common.OptionMapRWMutex.RLock()
	valStr, ok := common.OptionMap[key]
	common.OptionMapRWMutex.RUnlock()
	if !ok || valStr == "" {
		return defaultVal
	}
	val, err := strconv.ParseFloat(valStr, 64)
	if err != nil || val <= 0 {
		return defaultVal
	}
	return val
}

// calcTpsScore 计算 TPS 分（满分100）
// TPS分 = min(TPS / 基准TPS, 1) × 100
func calcTpsScore(tps float64) float64 {
	benchmark := getBenchmarkValue("TpsBenchmark", 100.0)
	ratio := tps / benchmark
	if ratio > 1.0 {
		ratio = 1.0
	}
	return ratio * 100
}

// calcTtftScore 计算 TTFT 分（满分100）
// TTFT分 = max(0, (1 - TTFT / 基准TTFT)) × 100
func calcTtftScore(ttft int) float64 {
	benchmark := getBenchmarkValue("TtftBenchmark", 1000.0)
	ratio := 1.0 - float64(ttft)/benchmark
	if ratio < 0 {
		ratio = 0
	}
	return ratio * 100
}

// GetBenchmarkSettings 获取当前的 TPS/TTFT 基准配置
func GetBenchmarkSettings() (tpsBenchmark, ttftBenchmark float64) {
	return getBenchmarkValue("TpsBenchmark", 100.0), getBenchmarkValue("TtftBenchmark", 1000.0)
}

// UpsertModelPerformance 插入或更新性能数据（使用最新值策略）
func UpsertModelPerformance(channelId int, model string, tps float64, ttft int) error {
	// 串行化 upsert，避免并发采样的读-写竞争导致重复插入
	modelPerformanceUpsertMutex.Lock()
	defer modelPerformanceUpsertMutex.Unlock()

	var existing ModelPerformance
	err := DB.Where("channel_id = ? AND model = ?", channelId, model).First(&existing).Error

	if err != nil && !isRecordNotFoundError(err) {
		return err
	}

	if existing.Id > 0 {
		// 更新：使用最新值
		return DB.Model(&existing).Updates(map[string]interface{}{
			"tps":         tps,
			"ttft":        ttft,
			"sample_size": existing.SampleSize + 1,
			"updated_at":  common.GetTimestamp(),
		}).Error
	}

	// 新增
	performance := ModelPerformance{
		ChannelId:  channelId,
		Model:      model,
		Tps:        tps,
		Ttft:       ttft,
		SampleSize: 1,
		UpdatedAt:  common.GetTimestamp(),
	}
	return DB.Create(&performance).Error
}

// CleanOldModelPerformance 清理超过7天的性能数据
func CleanOldModelPerformance() error {
	sevenDaysAgo := common.GetTimestamp() - 7*24*3600
	result := DB.Where("updated_at < ?", sevenDaysAgo).Delete(&ModelPerformance{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		common.SysLog(fmt.Sprintf("cleaned %d old model performance records", result.RowsAffected))
	}
	return nil
}

// GetLastSamplingTime 获取最后一次采样时间（返回格式化字符串）
func GetLastSamplingTime() string {
	var mp ModelPerformance
	err := DB.Order("updated_at DESC").First(&mp).Error
	if err != nil {
		return ""
	}
	return time.Unix(mp.UpdatedAt, 0).Format("2006-01-02 15:04:05")
}

// isRecordNotFoundError 判断是否为记录不存在错误
func isRecordNotFoundError(err error) bool {
	return err != nil && errors.Is(err, gorm.ErrRecordNotFound)
}
