package controller

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetChannelAnalyticsOverview 获取渠道供应商分析概览
func GetChannelAnalyticsOverview(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	overview, err := model.GetChannelVendorOverview(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, overview)
}

// GetChannelAnalyticsVendors 获取各供应商统计列表
func GetChannelAnalyticsVendors(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	stats, err := model.GetChannelVendorStats(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}

// GetChannelAnalyticsTrend 获取各供应商使用趋势
func GetChannelAnalyticsTrend(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	granularity := c.DefaultQuery("granularity", "day")
	vendorIdStr := c.Query("vendor_id")
	vendorId := 0
	if vendorIdStr != "" {
		vendorId, _ = strconv.Atoi(vendorIdStr)
	}

	points, err := model.GetChannelVendorTrend(startTimestamp, endTimestamp, granularity, vendorId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, points)
}

// GetChannelAnalyticsVendorDetail 获取单个供应商详情
func GetChannelAnalyticsVendorDetail(c *gin.Context) {
	vendorIdStr := c.Param("vendor_id")
	if vendorIdStr == "" {
		common.ApiErrorMsg(c, "vendor_id is required")
		return
	}
	vendorId, err := strconv.Atoi(vendorIdStr)
	if err != nil || vendorId <= 0 {
		common.ApiErrorMsg(c, "invalid vendor_id")
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	detail, err := model.GetChannelVendorDetail(vendorId, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, detail)
}

// GetChannelAnalyticsUserRanking 获取供应商活跃用户排行
func GetChannelAnalyticsUserRanking(c *gin.Context) {
	vendorIdStr := c.Param("vendor_id")
	if vendorIdStr == "" {
		common.ApiErrorMsg(c, "vendor_id is required")
		return
	}
	vendorId, err := strconv.Atoi(vendorIdStr)
	if err != nil || vendorId <= 0 {
		common.ApiErrorMsg(c, "invalid vendor_id")
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	modelName := c.Query("model_name")
	sortBy := c.DefaultQuery("sort_by", "token_count")
	if sortBy != "token_count" && sortBy != "call_count" {
		sortBy = "token_count"
	}

	rankings, err := model.GetChannelVendorUserRanking(vendorId, startTimestamp, endTimestamp, limit, modelName, sortBy)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rankings)
}

// GetChannelAnalyticsModels 获取供应商下各模型统计
func GetChannelAnalyticsModels(c *gin.Context) {
	vendorIdStr := c.Param("vendor_id")
	if vendorIdStr == "" {
		common.ApiErrorMsg(c, "vendor_id is required")
		return
	}
	vendorId, err := strconv.Atoi(vendorIdStr)
	if err != nil || vendorId <= 0 {
		common.ApiErrorMsg(c, "invalid vendor_id")
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	stats, err := model.GetChannelModelStats(vendorId, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}

// GetChannelAnalyticsModelTrend 获取供应商下各模型趋势
func GetChannelAnalyticsModelTrend(c *gin.Context) {
	vendorIdStr := c.Param("vendor_id")
	if vendorIdStr == "" {
		common.ApiErrorMsg(c, "vendor_id is required")
		return
	}
	vendorId, err := strconv.Atoi(vendorIdStr)
	if err != nil || vendorId <= 0 {
		common.ApiErrorMsg(c, "invalid vendor_id")
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	granularity := c.DefaultQuery("granularity", "day")

	points, err := model.GetChannelModelTrend(vendorId, startTimestamp, endTimestamp, granularity)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, points)
}

// GetChannelAnalyticsModelComparisonItems 获取模型对比选项列表
func GetChannelAnalyticsModelComparisonItems(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	items, err := model.GetChannelModelComparisonItems(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

// GetChannelAnalyticsModelComparisonTrend 获取模型对比趋势数据
func GetChannelAnalyticsModelComparisonTrend(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	granularity := c.DefaultQuery("granularity", "day")

	var vendorNames []string
	if vn := c.Query("vendor_names"); vn != "" {
		vendorNames = strings.Split(vn, ",")
	}
	var modelNames []string
	if mn := c.Query("model_names"); mn != "" {
		modelNames = strings.Split(mn, ",")
	}

	points, err := model.GetChannelModelComparisonTrend(startTimestamp, endTimestamp, granularity, vendorNames, modelNames)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, points)
}
