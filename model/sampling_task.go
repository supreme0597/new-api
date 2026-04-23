package model

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const DefaultSamplingIntervalSeconds = 10

var ErrSamplingForbidden = errors.New("sampling forbidden or rate limited")

// SamplingTaskStatus 采样任务执行状态
type SamplingTaskStatus struct {
	IsRunning      bool   `json:"is_running"`
	TotalTasks     int    `json:"total_tasks"`
	DoneTasks      int    `json:"done_tasks"`
	SuccessTasks   int    `json:"success_tasks"`
	FailedTasks    int    `json:"failed_tasks"`
	CurrentChannel string `json:"current_channel"`
	CurrentModel   string `json:"current_model"`
	Message        string `json:"message"`
	UpdatedAt      int64  `json:"updated_at"`
}

var (
	samplingTaskStatus SamplingTaskStatus
	samplingTaskMutex  sync.RWMutex
)

// GetSamplingTaskStatus 获取当前采样任务状态
func GetSamplingTaskStatus() SamplingTaskStatus {
	samplingTaskMutex.RLock()
	defer samplingTaskMutex.RUnlock()
	return samplingTaskStatus
}

func setSamplingTaskStatus(status SamplingTaskStatus) {
	samplingTaskMutex.Lock()
	defer samplingTaskMutex.Unlock()
	samplingTaskStatus = status
}

func updateSamplingTaskProgress(done, success, failed int, channel, model, message string) {
	samplingTaskMutex.Lock()
	defer samplingTaskMutex.Unlock()
	samplingTaskStatus.DoneTasks = done
	samplingTaskStatus.SuccessTasks = success
	samplingTaskStatus.FailedTasks = failed
	samplingTaskStatus.CurrentChannel = channel
	samplingTaskStatus.CurrentModel = model
	samplingTaskStatus.Message = message
	samplingTaskStatus.UpdatedAt = common.GetTimestamp()
}

// RunSamplingTask 执行采样任务
// 遍历所有测试渠道，对每个模型执行采样
func RunSamplingTask() error {
	// 防止并发执行
	samplingTaskMutex.Lock()
	if samplingTaskStatus.IsRunning {
		samplingTaskMutex.Unlock()
		return errors.New("sampling task is already running")
	}
	samplingTaskStatus.IsRunning = true
	samplingTaskStatus.DoneTasks = 0
	samplingTaskStatus.SuccessTasks = 0
	samplingTaskStatus.FailedTasks = 0
	samplingTaskStatus.CurrentChannel = ""
	samplingTaskStatus.CurrentModel = ""
	samplingTaskStatus.Message = "正在准备采样任务..."
	samplingTaskStatus.UpdatedAt = common.GetTimestamp()
	samplingTaskMutex.Unlock()

	defer func() {
		samplingTaskMutex.Lock()
		samplingTaskStatus.IsRunning = false
		samplingTaskStatus.Message = "采样任务已完成"
		samplingTaskStatus.UpdatedAt = common.GetTimestamp()
		samplingTaskMutex.Unlock()
	}()

	common.SysLog("[Sampling] 开始执行采样任务")

	// 获取所有测试渠道
	var channels []*Channel
	if err := DB.Where("is_test_channel = ? AND status = ?", 1, common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
		common.SysError(fmt.Sprintf("[Sampling] 获取测试渠道失败: %v", err))
		return fmt.Errorf("failed to get test channels: %w", err)
	}

	if len(channels) == 0 {
		common.SysLog("[Sampling] 没有可用的测试渠道，任务结束")
		setSamplingTaskStatus(SamplingTaskStatus{
			IsRunning: false,
			Message:   "没有可用的测试渠道",
			UpdatedAt: common.GetTimestamp(),
		})
		return nil
	}

	common.SysLog(fmt.Sprintf("[Sampling] 找到 %d 个测试渠道", len(channels)))

	// 获取启用的采样配置
	configs, err := GetActiveSamplingConfigs()
	if err != nil {
		common.SysError(fmt.Sprintf("[Sampling] 获取采样配置失败: %v", err))
		return fmt.Errorf("failed to get sampling configs: %w", err)
	}

	if len(configs) == 0 {
		common.SysLog("[Sampling] 没有启用的采样配置，任务结束")
		setSamplingTaskStatus(SamplingTaskStatus{
			IsRunning: false,
			Message:   "没有启用的采样配置",
			UpdatedAt: common.GetTimestamp(),
		})
		return nil
	}

	common.SysLog(fmt.Sprintf("[Sampling] 使用采样配置: %s", configs[0].Name))

	// 计算总任务数
	totalTasks := 0
	for _, channel := range channels {
		for _, modelName := range channel.GetModels() {
			if modelName != "" {
				totalTasks++
			}
		}
	}

	samplingTaskMutex.Lock()
	samplingTaskStatus.TotalTasks = totalTasks
	samplingTaskMutex.Unlock()

	common.SysLog(fmt.Sprintf("[Sampling] 总计需要采样 %d 个模型", totalTasks))

	// 遍历每个渠道的每个模型，使用第一个启用的采样配置进行测试
	doneTasks := 0
	successTasks := 0
	failedTasks := 0

	for _, channel := range channels {
		models := channel.GetModels()
		interval := getChannelSamplingInterval(channel)
		channelName := channel.Name
		if channelName == "" {
			channelName = fmt.Sprintf("渠道 #%d", channel.Id)
		}

		common.SysLog(fmt.Sprintf("[Sampling] 开始采样渠道: %s (ID=%d), 模型数=%d", channelName, channel.Id, len(models)))

		for i, modelName := range models {
			if modelName == "" {
				continue
			}

			doneTasks++
			updateSamplingTaskProgress(doneTasks, successTasks, failedTasks, channelName, modelName,
				fmt.Sprintf("正在采样: %s / %s (%d/%d)", channelName, modelName, doneTasks, totalTasks))

			common.SysLog(fmt.Sprintf("[Sampling] [%d/%d] 采样渠道=%s, 模型=%s", doneTasks, totalTasks, channelName, modelName))

			// 模型间间隔（第一个模型不需要等待）
			if i > 0 && interval > 0 {
				time.Sleep(time.Duration(interval) * time.Second)
			}

			// 使用第一个启用的采样配置
			config := configs[0]
			tps, ttft, err := sampleModelPerformance(channel, modelName, config)
			if err != nil {
				failedTasks++
				if errors.Is(err, ErrSamplingForbidden) {
					common.SysLog(fmt.Sprintf("[Sampling] 渠道 %s 被限流/禁止访问，跳过该渠道剩余模型", channelName))
					updateSamplingTaskProgress(doneTasks, successTasks, failedTasks, channelName, modelName,
						fmt.Sprintf("渠道 %s 被限流，跳过剩余模型", channelName))
					break // 跳过该渠道剩余模型
				}
				common.SysLog(fmt.Sprintf("[Sampling] 采样失败: 渠道=%s, 模型=%s, 错误=%v", channelName, modelName, err))
				updateSamplingTaskProgress(doneTasks, successTasks, failedTasks, channelName, modelName,
					fmt.Sprintf("采样失败: %s / %s", channelName, modelName))
				continue
			}

			successTasks++
			common.SysLog(fmt.Sprintf("[Sampling] 采样成功: 渠道=%s, 模型=%s, TPS=%.1f, TTFT=%dms", channelName, modelName, tps, ttft))

			if err := UpsertModelPerformance(channel.Id, modelName, tps, ttft); err != nil {
				common.SysError(fmt.Sprintf("[Sampling] 保存性能数据失败: 渠道=%s, 模型=%s, 错误=%v", channelName, modelName, err))
				updateSamplingTaskProgress(doneTasks, successTasks, failedTasks, channelName, modelName,
					fmt.Sprintf("保存数据失败: %s / %s", channelName, modelName))
			} else {
				updateSamplingTaskProgress(doneTasks, successTasks, failedTasks, channelName, modelName,
					fmt.Sprintf("完成: %s / %s (TPS=%.1f, TTFT=%dms)", channelName, modelName, tps, ttft))
			}
		}
	}

	common.SysLog(fmt.Sprintf("[Sampling] 采样任务完成，总计=%d, 成功=%d, 失败=%d", totalTasks, successTasks, failedTasks))
	updateSamplingTaskProgress(doneTasks, successTasks, failedTasks, "", "",
		fmt.Sprintf("采样完成: %d 成功, %d 失败, 总计 %d", successTasks, failedTasks, totalTasks))

	return nil
}

// getChannelSamplingInterval 获取渠道的采样间隔（秒）
func getChannelSamplingInterval(channel *Channel) int {
	if channel.SamplingIntervalSeconds != nil && *channel.SamplingIntervalSeconds > 0 {
		return *channel.SamplingIntervalSeconds
	}
	return DefaultSamplingIntervalSeconds
}

// sampleModelPerformance 对单个模型执行采样，返回 TPS 和 TTFT
func sampleModelPerformance(channel *Channel, modelName string, config *SamplingConfig) (tps float64, ttft int, err error) {
	baseURL := channel.GetBaseURL()
	if baseURL == "" {
		return 0, 0, fmt.Errorf("channel %d has no base URL", channel.Id)
	}

	// 构建请求
	url := strings.TrimRight(baseURL, "/") + "/v1/chat/completions"

	requestBody := fmt.Sprintf(`{
		"model": "%s",
		"messages": [{"role": "user", "content": %q}],
		"max_tokens": %d,
		"stream": true
	}`, modelName, config.Prompt, config.MaxTokens)

	req, err := http.NewRequest("POST", url, strings.NewReader(requestBody))
	if err != nil {
		return 0, 0, fmt.Errorf("create request failed: %w", err)
	}

	// 设置请求头
	keys := channel.GetKeys()
	if len(keys) == 0 {
		return 0, 0, fmt.Errorf("channel %d has no keys", channel.Id)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+keys[0])

	client := &http.Client{
		Timeout: 120 * time.Second,
	}

	// 记录开始时间
	startTime := time.Now()

	resp, err := client.Do(req)
	if err != nil {
		return 0, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		// 429/401/403 表示被限流或禁止访问，触发熔断跳过该渠道剩余模型
		if resp.StatusCode == http.StatusTooManyRequests ||
			resp.StatusCode == http.StatusUnauthorized ||
			resp.StatusCode == http.StatusForbidden {
			return 0, 0, fmt.Errorf("%w: status %d, body: %s", ErrSamplingForbidden, resp.StatusCode, string(body))
		}
		return 0, 0, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	// 计算 TTFT（首次响应时间）
	ttftMs := int(time.Since(startTime).Milliseconds())

	// 读取流式响应并计算 TPS
	totalTokens := 0
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			// 简单统计 SSE 数据中的 token
			// 实际中应该解析 SSE 格式，这里简化处理
			chunk := string(buf[:n])
			totalTokens += countTokensInChunk(chunk)
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			break
		}
	}

	elapsed := time.Since(startTime).Seconds()
	if elapsed > 0 {
		tps = float64(totalTokens) / elapsed
	}

	return tps, ttftMs, nil
}

// countTokensInChunk 简单统计 SSE 响应中的 token 数量
// 通过计数 content 字段中的字符来估算
func countTokensInChunk(chunk string) int {
	count := 0
	lines := strings.Split(chunk, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			continue
		}
		// 查找 "content" 字段中的文本
		if idx := strings.Index(data, `"content"`); idx >= 0 {
			// 简单估算：每个中文字符约1个token，每个英文单词约1个token
			// 这里用字符数/4做粗略估算
			contentStart := idx + 11 // skip `"content":"`
			if contentStart < len(data) {
				remaining := data[contentStart:]
				if endIdx := strings.Index(remaining, `"`); endIdx > 0 {
					content := remaining[:endIdx]
					count += len(content) / 4
					if len(content)%4 > 0 {
						count++
					}
				}
			}
		}
	}
	return count
}
