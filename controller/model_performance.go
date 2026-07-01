package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetModelPerformanceList 获取性能排行榜
func GetModelPerformanceList(c *gin.Context) {
	vendorId, _ := strconv.Atoi(c.DefaultQuery("vendor_id", "0"))
	source := c.DefaultQuery("source", "")
	hours, _ := strconv.Atoi(c.DefaultQuery("hours", "24"))
	startTimeMs, _ := strconv.ParseInt(c.Query("start_time"), 10, 64)
	endTimeMs, _ := strconv.ParseInt(c.Query("end_time"), 10, 64)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	sortBy := c.DefaultQuery("sort_by", "score")
	sortOrder := c.DefaultQuery("sort_order", "desc")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	if hours < 1 {
		hours = 24
	}

	// 如果传了 source（供应商名称），查询对应 vendorId
	if source != "" && vendorId == 0 {
		if v, err := model.GetVendorByName(source); err == nil {
			vendorId = v.Id
		}
	}

	// 计算时间范围
	var startTs, endTs int64
	if startTimeMs > 0 && endTimeMs > 0 && endTimeMs > startTimeMs {
		// 优先使用绝对时间（毫秒时间戳）
		startTs = startTimeMs / 1000
		endTs = endTimeMs / 1000
	} else {
		// 回退到 hours 相对时间（向后兼容）
		endTs = time.Now().Unix()
		startTs = endTs - int64(hours)*3600
	}

	items, err := model.GetLeaderboardData(startTs, endTs, vendorId, sortBy, sortOrder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	total := int64(len(items))

	// 分页
	offset := (page - 1) * pageSize
	if offset > len(items) {
		offset = len(items)
	}
	endIdx := offset + pageSize
	if endIdx > len(items) {
		endIdx = len(items)
	}

	pagedItems := items[offset:endIdx]

	// 获取基准配置（供前端动态计算颜色阈值）
	tpsBenchmark, ttftBenchmark := model.GetBenchmarkSettings()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"list":          pagedItems,
			"total":         total,
			"page":          page,
			"pageSize":      pageSize,
			"tpsBenchmark":  tpsBenchmark,
			"ttftBenchmark": ttftBenchmark,
		},
	})
}

// GetModelPerformanceVendors 获取供应商列表
func GetModelPerformanceVendors(c *gin.Context) {
	vendors, err := model.GetDistinctVendorNames()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    vendors,
	})
}

// RefreshModelPerformance 手动刷新性能数据（仅超级管理员）
func RefreshModelPerformance(c *gin.Context) {
	// 触发采样任务
	go func() {
		if err := model.RunSamplingTask(); err != nil {
			common.SysError(fmt.Sprintf("[Sampling] 任务执行异常: %v", err))
		}
	}()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "采样任务已触发",
	})
}

// GetSamplingTaskStatus 获取采样任务执行状态
func GetSamplingTaskStatus(c *gin.Context) {
	status := model.GetSamplingTaskStatus()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    status,
	})
}

// StopSamplingTask 停止正在运行的采样任务
func StopSamplingTask(c *gin.Context) {
	if err := model.StopSamplingTask(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "已发送停止请求",
	})
}

// GetModelPerformanceDetail 获取指定模型的性能详情
func GetModelPerformanceDetail(c *gin.Context) {
	modelName := c.Query("model_name")
	if modelName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "model_name is required",
		})
		return
	}

	hours, _ := strconv.Atoi(c.DefaultQuery("hours", "24"))
	startTimeMs, _ := strconv.ParseInt(c.Query("start_time"), 10, 64)
	endTimeMs, _ := strconv.ParseInt(c.Query("end_time"), 10, 64)

	if hours < 1 {
		hours = 24
	}

	// 计算时间范围
	var startTs, endTs int64
	if startTimeMs > 0 && endTimeMs > 0 && endTimeMs > startTimeMs {
		// 优先使用绝对时间（毫秒时间戳），与 GetModelPerformanceList 一致
		startTs = startTimeMs / 1000
		endTs = endTimeMs / 1000
	} else {
		// 回退到 hours 相对时间
		endTs = time.Now().Unix()
		startTs = endTs - int64(hours)*3600
	}

	detail, err := model.GetModelPerformanceDetail(modelName, startTs, endTs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    detail,
	})
}
