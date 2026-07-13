package controller

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func GetAllLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	logType, _ := strconv.Atoi(c.Query("type"))
	timeField := c.DefaultQuery("time_field", "created_at")
	if timeField != "created_at" && timeField != "request_time" && timeField != "model_start_time" && timeField != "model_end_time" {
		timeField = "created_at"
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	username := c.Query("username")
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	sessionId := c.Query("session_id")
	logs, total, err := model.GetAllLogs(logType, timeField, startTimestamp, endTimestamp, modelName, username, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), channel, group, requestId, upstreamRequestId, sessionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

func GetUserLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId := c.GetInt("id")
	logType, _ := strconv.Atoi(c.Query("type"))
	timeField := c.DefaultQuery("time_field", "created_at")
	if timeField != "created_at" && timeField != "request_time" && timeField != "model_start_time" && timeField != "model_end_time" {
		timeField = "created_at"
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	sessionId := c.Query("session_id")
	logs, total, err := model.GetUserLogs(userId, logType, timeField, startTimestamp, endTimestamp, modelName, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), group, requestId, upstreamRequestId, sessionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

// Deprecated: SearchAllLogs 已废弃，前端未使用该接口。
func SearchAllLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

// Deprecated: SearchUserLogs 已废弃，前端未使用该接口。
func SearchUserLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

func GetLogDetail(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的日志 ID",
		})
		return
	}

	log, err := model.GetLogById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if log == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "日志不存在",
		})
		return
	}

	// 普通用户路由（/self/:id）需要校验归属权
	if c.FullPath() == "/api/log/self/:id" {
		userId := c.GetInt("id")
		if log.UserId != userId {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"message": "日志不存在",
			})
			return
		}
	}

	// 解析 request_body，拆分为请求头和请求体
	var requestHeaders map[string]string
	var requestBody string
	if log.RequestBody != "" {
		var raw struct {
			Headers map[string]string `json:"headers"`
			Body    interface{}       `json:"body"`
		}
		if err := json.Unmarshal([]byte(log.RequestBody), &raw); err == nil && raw.Headers != nil {
			requestHeaders = raw.Headers
			// body 是字符串（原始请求体 JSON），解析后提取 messages（chat）或返回完整 body
			if bodyStr, ok := raw.Body.(string); ok {
				var bodyObj map[string]interface{}
				if json.Unmarshal([]byte(bodyStr), &bodyObj) == nil {
					if messages, exists := bodyObj["messages"]; exists {
						// chat 请求：只返回 messages
						if msgBytes, err := common.Marshal(messages); err == nil {
							requestBody = string(msgBytes)
						}
					} else {
						// 非 chat 请求：返回完整 body
						requestBody = bodyStr
					}
				} else {
					// body 不是 JSON，原样返回
					requestBody = bodyStr
				}
			}
		} else {
			// 无 headers 包装，request_body 就是原始请求体
			requestBody = log.RequestBody
		}
	}

	common.ApiSuccess(c, gin.H{
		"id":                log.Id,
		"user_id":           log.UserId,
		"created_at":        log.CreatedAt,
		"type":              log.Type,
		"content":           log.Content,
		"username":          log.Username,
		"token_name":        log.TokenName,
		"model_name":        log.ModelName,
		"quota":             log.Quota,
		"prompt_tokens":     log.PromptTokens,
		"completion_tokens": log.CompletionTokens,
		"use_time":          log.UseTime,
		"is_stream":         log.IsStream,
		"channel":           log.ChannelId,
		"channel_name":      log.ChannelName,
		"token_id":          log.TokenId,
		"group":             log.Group,
		"ip":                log.Ip,
		"request_id":        log.RequestId,
		"upstream_request_id": log.UpstreamRequestId,
		"other":             log.Other,
		"request_data":      log.RequestData,
		"request_headers":   requestHeaders,
		"request_body":      requestBody,
		"response_body":     log.ResponseBody,
	})
}

func GetLogByKey(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	if tokenId == 0 {
		c.JSON(200, gin.H{
			"success": false,
			"message": "无效的令牌",
		})
		return
	}
	logs, err := model.GetLogByTokenId(tokenId)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
}

func GetLogsStat(c *gin.Context) {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	username := c.Query("username")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	stat, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": stat.Quota,
			"rpm":   stat.Rpm,
			"tpm":   stat.Tpm,
		},
	})
	return
}

func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString("username")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	quotaNum, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum.Quota,
			"rpm":   quotaNum.Rpm,
			"tpm":   quotaNum.Tpm,
			//"token": tokenNum,
		},
	})
	return
}

func DeleteHistoryLogs(c *gin.Context) {
	targetTimestamp, _ := strconv.ParseInt(c.Query("target_timestamp"), 10, 64)
	if targetTimestamp == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "target timestamp is required",
		})
		return
	}
	count, err := model.DeleteOldLog(c.Request.Context(), targetTimestamp, 100)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
	return
}

func TriggerLogBackup(c *gin.Context) {
	count, err := service.RunLogBackup()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}
