package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetModelPerformanceList 获取模型性能排行榜
func GetModelPerformanceList(c *gin.Context) {
	source := c.Query("source")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	items, total, err := model.GetModelPerformanceList(source, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	// 获取最后采样时间
	lastSamplingTime := model.GetLastSamplingTime()

	// 获取基准配置（供前端动态计算颜色阈值）
	tpsBenchmark, ttftBenchmark := model.GetBenchmarkSettings()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"list":             items,
			"total":            total,
			"page":             page,
			"pageSize":         pageSize,
			"lastSamplingTime": lastSamplingTime,
			"tpsBenchmark":     tpsBenchmark,
			"ttftBenchmark":    ttftBenchmark,
		},
	})
}

// GetModelPerformanceSources 获取渠道来源列表
func GetModelPerformanceSources(c *gin.Context) {
	sources, err := model.GetDistinctSources()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    sources,
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

// GetChannelSourceMappings 获取渠道来源映射列表
func GetChannelSourceMappings(c *gin.Context) {
	mappings, err := model.GetChannelSourceMappings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    mappings,
	})
}

// AddChannelSourceMapping 创建渠道来源映射
func AddChannelSourceMapping(c *gin.Context) {
	var mapping model.ChannelSourceMapping
	if err := c.ShouldBindJSON(&mapping); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if mapping.SourceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "来源名称不能为空",
		})
		return
	}

	if err := model.CreateChannelSourceMapping(&mapping); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    mapping,
	})
}

// UpdateChannelSourceMapping 更新渠道来源映射
func UpdateChannelSourceMapping(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的ID",
		})
		return
	}

	var mapping model.ChannelSourceMapping
	if err := c.ShouldBindJSON(&mapping); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	mapping.Id = id
	if err := model.UpdateChannelSourceMapping(&mapping); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    mapping,
	})
}

// DeleteChannelSourceMapping 删除渠道来源映射
func DeleteChannelSourceMapping(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的ID",
		})
		return
	}

	if err := model.DeleteChannelSourceMapping(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
	})
}
