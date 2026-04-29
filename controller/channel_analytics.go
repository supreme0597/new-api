package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetChannelAnalyticsOverview 获取渠道来源分析概览
func GetChannelAnalyticsOverview(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	overview, err := model.GetChannelSourceOverview(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, overview)
}

// GetChannelAnalyticsSources 获取各来源统计列表
func GetChannelAnalyticsSources(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	stats, err := model.GetChannelSourceStats(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}

// GetChannelAnalyticsTrend 获取各来源使用趋势
func GetChannelAnalyticsTrend(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	granularity := c.DefaultQuery("granularity", "day")
	source := c.Query("source")

	points, err := model.GetChannelSourceTrend(startTimestamp, endTimestamp, granularity, source)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, points)
}

// GetChannelAnalyticsSourceDetail 获取单个来源详情
func GetChannelAnalyticsSourceDetail(c *gin.Context) {
	source := c.Param("source")
	if source == "" {
		common.ApiErrorMsg(c, "source is required")
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	detail, err := model.GetChannelSourceDetail(source, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, detail)
}

// GetChannelAnalyticsUserRanking 获取来源活跃用户排行
func GetChannelAnalyticsUserRanking(c *gin.Context) {
	source := c.Param("source")
	if source == "" {
		common.ApiErrorMsg(c, "source is required")
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	modelName := c.Query("model_name")

	rankings, err := model.GetChannelSourceUserRanking(source, startTimestamp, endTimestamp, limit, modelName)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rankings)
}

// GetChannelAnalyticsModels 获取来源下各模型统计
func GetChannelAnalyticsModels(c *gin.Context) {
	source := c.Param("source")
	if source == "" {
		common.ApiErrorMsg(c, "source is required")
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	stats, err := model.GetChannelModelStats(source, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}

// GetChannelAnalyticsModelTrend 获取来源下各模型趋势
func GetChannelAnalyticsModelTrend(c *gin.Context) {
	source := c.Param("source")
	if source == "" {
		common.ApiErrorMsg(c, "source is required")
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	granularity := c.DefaultQuery("granularity", "day")

	points, err := model.GetChannelModelTrend(source, startTimestamp, endTimestamp, granularity)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, points)
}
