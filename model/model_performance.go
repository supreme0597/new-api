package model

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
)

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
