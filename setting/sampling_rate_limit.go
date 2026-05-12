package setting

import (
	"encoding/json"
	"fmt"
	"math"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// SamplingGroupRateLimit 单个分组的采样限流配置
type SamplingGroupRateLimit struct {
	DurationMinutes int // 限制周期（分钟），0 表示使用全局默认值
	TotalCount      int // 每周期最大总请求数
	SuccessCount    int // 每周期最大成功请求数
}

var (
	SamplingDefaultDurationMinutes = 1 // 全局默认限制周期（分钟）
	SamplingDefaultMaxRequests     = 4 // 全局默认每周期最大请求数
	SamplingDefaultMaxSuccess      = 3 // 全局默认每周期最大成功请求数
	SamplingRateLimitGroup         = map[string][3]int{}
	SamplingRateLimitMutex         sync.RWMutex
)

func SamplingRateLimitGroup2JSONString() string {
	SamplingRateLimitMutex.RLock()
	defer SamplingRateLimitMutex.RUnlock()

	jsonBytes, err := json.Marshal(SamplingRateLimitGroup)
	if err != nil {
		common.SysLog("error marshalling sampling rate limit group: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateSamplingRateLimitGroupByJSONString(jsonStr string) error {
	SamplingRateLimitMutex.Lock()
	defer SamplingRateLimitMutex.Unlock()

	SamplingRateLimitGroup = make(map[string][3]int)
	if jsonStr == "" || jsonStr == "{}" {
		return nil
	}
	return json.Unmarshal([]byte(jsonStr), &SamplingRateLimitGroup)
}

// GetSamplingGroupRateLimit 获取分组的采样限流配置
// 返回该分组的 (duration, totalCount, successCount) 和是否找到
func GetSamplingGroupRateLimit(group string) (duration, totalCount, successCount int, found bool) {
	SamplingRateLimitMutex.RLock()
	defer SamplingRateLimitMutex.RUnlock()

	if SamplingRateLimitGroup == nil {
		return SamplingDefaultDurationMinutes, SamplingDefaultMaxRequests, SamplingDefaultMaxSuccess, false
	}

	limits, found := SamplingRateLimitGroup[group]
	if !found {
		return SamplingDefaultDurationMinutes, SamplingDefaultMaxRequests, SamplingDefaultMaxSuccess, false
	}

	duration = limits[0]
	if duration <= 0 {
		duration = SamplingDefaultDurationMinutes
	}
	totalCount = limits[1]
	if totalCount <= 0 {
		totalCount = SamplingDefaultMaxRequests
	}
	successCount = limits[2]
	if successCount <= 0 {
		successCount = SamplingDefaultMaxSuccess
	}
	return duration, totalCount, successCount, true
}

func CheckSamplingRateLimitGroup(jsonStr string) error {
	checkGroup := make(map[string][3]int)
	err := json.Unmarshal([]byte(jsonStr), &checkGroup)
	if err != nil {
		return err
	}
	for group, limits := range checkGroup {
		if limits[0] < 0 {
			return fmt.Errorf("group %s has negative duration: %d", group, limits[0])
		}
		if limits[1] < 0 {
			return fmt.Errorf("group %s has negative total count: %d", group, limits[1])
		}
		if limits[2] < 1 {
			return fmt.Errorf("group %s success count must be >= 1, got %d", group, limits[2])
		}
		if limits[0] > math.MaxInt32 || limits[1] > math.MaxInt32 || limits[2] > math.MaxInt32 {
			return fmt.Errorf("group %s has values exceeding max int32", group)
		}
	}
	return nil
}
