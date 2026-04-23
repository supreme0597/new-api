package controller

import (
	"net/http"
	"strconv"

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

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"list":             items,
			"total":            total,
			"page":             page,
			"pageSize":         pageSize,
			"lastSamplingTime": lastSamplingTime,
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
			return
		}
	}()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "采样任务已触发",
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

// GetSamplingConfigs 获取采样配置列表
func GetSamplingConfigs(c *gin.Context) {
	configs, err := model.GetSamplingConfigs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    configs,
	})
}

// AddSamplingConfig 创建采样配置
func AddSamplingConfig(c *gin.Context) {
	var config model.SamplingConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if config.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "配置名称不能为空",
		})
		return
	}

	if config.Prompt == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Prompt不能为空",
		})
		return
	}

	userId := c.GetInt("id")
	config.CreatedBy = userId

	if err := model.CreateSamplingConfig(&config); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    config,
	})
}

// UpdateSamplingConfig 更新采样配置
func UpdateSamplingConfig(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的ID",
		})
		return
	}

	var config model.SamplingConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	config.Id = id
	if err := model.UpdateSamplingConfig(&config); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    config,
	})
}

// DeleteSamplingConfig 删除采样配置
func DeleteSamplingConfig(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的ID",
		})
		return
	}

	if err := model.DeleteSamplingConfig(id); err != nil {
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

// ToggleSamplingConfig 切换采样配置的启用/禁用状态
func ToggleSamplingConfig(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的ID",
		})
		return
	}

	if err := model.ToggleSamplingConfig(id); err != nil {
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
