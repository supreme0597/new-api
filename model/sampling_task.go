package model

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const DefaultSamplingIntervalSeconds = 10

var ErrSamplingForbidden = errors.New("sampling forbidden or rate limited")

// SamplingRecord 单条采样记录
type SamplingRecord struct {
	Channel string `json:"channel"`
	Model   string `json:"model"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// LastSamplingResult 上次采样结果
type LastSamplingResult struct {
	Time        string           `json:"time"`
	Total       int              `json:"total"`
	Success     int              `json:"success"`
	Failed      int              `json:"failed"`
	SuccessList []SamplingRecord `json:"success_list"`
	FailedList  []SamplingRecord `json:"failed_list"`
}

// SamplingTaskStatus 采样任务执行状态
type SamplingTaskStatus struct {
	IsRunning      bool                `json:"is_running"`
	TotalTasks     int                 `json:"total_tasks"`
	DoneTasks      int                 `json:"done_tasks"`
	SuccessTasks   int                 `json:"success_tasks"`
	FailedTasks    int                 `json:"failed_tasks"`
	CurrentChannel string              `json:"current_channel"`
	CurrentModel   string              `json:"current_model"`
	Message        string              `json:"message"`
	UpdatedAt      int64               `json:"updated_at"`
	StopRequested  bool                `json:"stop_requested"`
	LastResult     *LastSamplingResult `json:"last_result"`
}

var (
	samplingTaskStatus SamplingTaskStatus
	samplingTaskMutex  sync.RWMutex
	samplingStopFlag   atomic.Bool
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
	samplingTaskStatus.StopRequested = false
	samplingTaskMutex.Unlock()

	samplingStopFlag.Store(false)

	// 记录本次采样结果
	lastResult := &LastSamplingResult{
		Time:        time.Now().Format("2006-01-02 15:04:05"),
		SuccessList: make([]SamplingRecord, 0),
		FailedList:  make([]SamplingRecord, 0),
	}

	defer func() {
		samplingTaskMutex.Lock()
		samplingTaskStatus.IsRunning = false
		samplingTaskStatus.StopRequested = false
		if samplingStopFlag.Load() {
			samplingTaskStatus.Message = "采样任务已停止"
		} else {
			samplingTaskStatus.Message = "采样任务已完成"
		}
		samplingTaskStatus.UpdatedAt = common.GetTimestamp()
		lastResult.Total = samplingTaskStatus.TotalTasks
		lastResult.Success = samplingTaskStatus.SuccessTasks
		lastResult.Failed = samplingTaskStatus.FailedTasks
		samplingTaskStatus.LastResult = lastResult
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

	// 从 OptionMap 读取采样配置
	prompt, maxTokens := getSamplingConfigFromOptions()
	if prompt == "" {
		common.SysLog("[Sampling] 采样 Prompt 为空，任务结束")
		setSamplingTaskStatus(SamplingTaskStatus{
			IsRunning: false,
			Message:   "采样 Prompt 未配置",
			UpdatedAt: common.GetTimestamp(),
		})
		return nil
	}

	common.SysLog(fmt.Sprintf("[Sampling] 使用采样 Prompt (长度=%d), MaxTokens=%d", len(prompt), maxTokens))

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

	config := &SamplingConfig{
		Prompt:    prompt,
		MaxTokens: maxTokens,
	}

	// 并发控制：渠道维度并行，渠道内串行
	doneAtomic := atomic.Int32{}
	successAtomic := atomic.Int32{}
	failedAtomic := atomic.Int32{}
	var resultMutex sync.Mutex
	var wg sync.WaitGroup

	for _, channel := range channels {
		wg.Add(1)
		go func(ch *Channel) {
			defer wg.Done()

			models := ch.GetModels()
			interval := getChannelSamplingInterval(ch)
			channelName := ch.Name
			if channelName == "" {
				channelName = fmt.Sprintf("渠道 #%d", ch.Id)
			}

			common.SysLog(fmt.Sprintf("[Sampling] 开始采样渠道: %s (ID=%d), 模型数=%d", channelName, ch.Id, len(models)))

			for i, modelName := range models {
				if modelName == "" {
					continue
				}

				// 检查是否请求停止
				if samplingStopFlag.Load() {
					common.SysLog(fmt.Sprintf("[Sampling] 渠道 %s 收到停止请求，中断", channelName))
					return
				}

				// 模型间间隔（第一个模型不需要等待）
				if i > 0 && interval > 0 {
					time.Sleep(time.Duration(interval) * time.Second)
				}

				// 检查是否请求停止
				if samplingStopFlag.Load() {
					common.SysLog(fmt.Sprintf("[Sampling] 渠道 %s 收到停止请求，中断", channelName))
					return
				}

				currentDone := int(doneAtomic.Add(1))
				currentSuccess := int(successAtomic.Load())
				currentFailed := int(failedAtomic.Load())

				updateSamplingTaskProgress(currentDone, currentSuccess, currentFailed, channelName, modelName,
					fmt.Sprintf("正在采样: %s / %s (%d/%d)", channelName, modelName, currentDone, totalTasks))

				common.SysLog(fmt.Sprintf("[Sampling] [%d/%d] 采样渠道=%s, 模型=%s", currentDone, totalTasks, channelName, modelName))

				tps, ttft, err := sampleModelPerformance(ch, modelName, config)
				if err != nil {
					failedAtomic.Add(1)
					record := SamplingRecord{
						Channel: channelName,
						Model:   modelName,
						Success: false,
						Message: err.Error(),
					}
					resultMutex.Lock()
					lastResult.FailedList = append(lastResult.FailedList, record)
					resultMutex.Unlock()

					// 记录到使用日志
					RecordSamplingLog(ch.Id, channelName, modelName, 0, 0, 0, false, err.Error())

					if errors.Is(err, ErrSamplingForbidden) {
						common.SysLog(fmt.Sprintf("[Sampling] 渠道 %s 被限流/禁止访问，跳过该渠道剩余模型", channelName))
						updateSamplingTaskProgress(currentDone, int(successAtomic.Load()), int(failedAtomic.Load()), channelName, modelName,
							fmt.Sprintf("渠道 %s 被限流，跳过剩余模型", channelName))
						return // 跳过该渠道剩余模型
					}
					common.SysLog(fmt.Sprintf("[Sampling] 采样失败: 渠道=%s, 模型=%s, 错误=%v", channelName, modelName, err))
					updateSamplingTaskProgress(currentDone, int(successAtomic.Load()), int(failedAtomic.Load()), channelName, modelName,
						fmt.Sprintf("采样失败: %s / %s", channelName, modelName))
					continue
				}

				successAtomic.Add(1)
				record := SamplingRecord{
					Channel: channelName,
					Model:   modelName,
					Success: true,
					Message: fmt.Sprintf("TPS=%.1f, TTFT=%dms", tps, ttft),
				}
				resultMutex.Lock()
				lastResult.SuccessList = append(lastResult.SuccessList, record)
				resultMutex.Unlock()

				common.SysLog(fmt.Sprintf("[Sampling] 采样成功: 渠道=%s, 模型=%s, TPS=%.1f, TTFT=%dms", channelName, modelName, tps, ttft))

				// 记录到使用日志
				RecordSamplingLog(ch.Id, channelName, modelName, tps, ttft, ttft, true,
					fmt.Sprintf("采样成功 TPS=%.1f TTFT=%dms", tps, ttft))

				if err := UpsertModelPerformance(ch.Id, modelName, tps, ttft); err != nil {
					common.SysError(fmt.Sprintf("[Sampling] 保存性能数据失败: 渠道=%s, 模型=%s, 错误=%v", channelName, modelName, err))
					updateSamplingTaskProgress(currentDone, int(successAtomic.Load()), int(failedAtomic.Load()), channelName, modelName,
						fmt.Sprintf("保存数据失败: %s / %s", channelName, modelName))
				} else {
					updateSamplingTaskProgress(currentDone, int(successAtomic.Load()), int(failedAtomic.Load()), channelName, modelName,
						fmt.Sprintf("完成: %s / %s (TPS=%.1f, TTFT=%dms)", channelName, modelName, tps, ttft))
				}
			}

			common.SysLog(fmt.Sprintf("[Sampling] 渠道 %s 采样完成", channelName))
		}(channel)
	}

	wg.Wait()

	doneTasks := int(doneAtomic.Load())
	successTasks := int(successAtomic.Load())
	failedTasks := int(failedAtomic.Load())

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
	logPrefix := fmt.Sprintf("[Sampling][渠道=%s,模型=%s]", channel.Name, modelName)

	baseURL := channel.GetBaseURL()
	if baseURL == "" {
		common.SysError(fmt.Sprintf("%s 渠道 %d 没有 base URL", logPrefix, channel.Id))
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
		common.SysError(fmt.Sprintf("%s 创建请求失败: %v", logPrefix, err))
		return 0, 0, fmt.Errorf("create request failed: %w", err)
	}

	// 设置请求头
	keys := channel.GetKeys()
	if len(keys) == 0 {
		common.SysError(fmt.Sprintf("%s 渠道 %d 没有密钥", logPrefix, channel.Id))
		return 0, 0, fmt.Errorf("channel %d has no keys", channel.Id)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+keys[0])

	client := &http.Client{
		Timeout: 120 * time.Second,
	}

	// 记录开始时间
	startTime := time.Now()
	common.SysLog(fmt.Sprintf("%s 开始请求 URL=%s, PromptLen=%d, MaxTokens=%d", logPrefix, url, len(config.Prompt), config.MaxTokens))

	resp, err := client.Do(req)
	if err != nil {
		common.SysError(fmt.Sprintf("%s HTTP 请求失败: %v", logPrefix, err))
		return 0, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		bodyStr := string(body)
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		common.SysError(fmt.Sprintf("%s 响应异常: status=%d, body=%s", logPrefix, resp.StatusCode, bodyStr))
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
	common.SysLog(fmt.Sprintf("%s 首字节到达: TTFT=%dms", logPrefix, ttftMs))

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
			common.SysError(fmt.Sprintf("%s 读取响应流出错: %v", logPrefix, readErr))
			break
		}
	}

	elapsed := time.Since(startTime).Seconds()
	if elapsed > 0 {
		tps = float64(totalTokens) / elapsed
	}

	common.SysLog(fmt.Sprintf("%s 采样完成: elapsed=%.2fs, tokens=%d, TPS=%.1f", logPrefix, elapsed, totalTokens, tps))
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

// getSamplingConfigFromOptions 从 OptionMap 读取采样配置
func getSamplingConfigFromOptions() (prompt string, maxTokens int) {
	common.OptionMapRWMutex.RLock()
	prompt = common.OptionMap["SamplingPrompt"]
	maxTokensStr := common.OptionMap["SamplingMaxTokens"]
	common.OptionMapRWMutex.RUnlock()

	maxTokens = 2048
	if maxTokensStr != "" {
		if v, err := strconv.Atoi(maxTokensStr); err == nil && v > 0 {
			maxTokens = v
		}
	}
	return prompt, maxTokens
}

// getSamplingIntervalMinutes 从 OptionMap 读取采样间隔（分钟）
func getSamplingIntervalMinutes() int {
	common.OptionMapRWMutex.RLock()
	intervalStr := common.OptionMap["SamplingIntervalMinutes"]
	common.OptionMapRWMutex.RUnlock()

	interval := 30
	if intervalStr != "" {
		if v, err := strconv.Atoi(intervalStr); err == nil && v >= 0 {
			interval = v
		}
	}
	return interval
}

// getSamplingTimeRange 从 OptionMap 读取采样时间段
// 返回起始时间和结束时间的分钟数（如 00:00 -> 0, 23:59 -> 1439）
func getSamplingTimeRange() (startMin, endMin int) {
	common.OptionMapRWMutex.RLock()
	startStr := common.OptionMap["SamplingStartTime"]
	endStr := common.OptionMap["SamplingEndTime"]
	common.OptionMapRWMutex.RUnlock()

	startMin = parseTimeToMinutes(startStr, 0)
	endMin = parseTimeToMinutes(endStr, 1439)
	return
}

// parseTimeToMinutes 将 HH:mm 格式转换为当天分钟数
func parseTimeToMinutes(timeStr string, defaultVal int) int {
	if timeStr == "" {
		return defaultVal
	}
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return defaultVal
	}
	hour, err1 := strconv.Atoi(parts[0])
	min, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || hour < 0 || hour > 23 || min < 0 || min > 59 {
		return defaultVal
	}
	return hour*60 + min
}

// isWithinSamplingWindow 检查当前时间是否在采样时间段内
func isWithinSamplingWindow() bool {
	startMin, endMin := getSamplingTimeRange()
	now := time.Now()
	currentMin := now.Hour()*60 + now.Minute()

	if startMin <= endMin {
		// 正常区间，如 09:00 - 18:00
		return currentMin >= startMin && currentMin <= endMin
	}
	// 跨天区间，如 22:00 - 06:00
	return currentMin >= startMin || currentMin <= endMin
}

// StopSamplingTask 请求停止当前正在运行的采样任务
func StopSamplingTask() error {
	samplingTaskMutex.RLock()
	isRunning := samplingTaskStatus.IsRunning
	samplingTaskMutex.RUnlock()

	if !isRunning {
		return errors.New("no sampling task is running")
	}

	samplingStopFlag.Store(true)
	samplingTaskMutex.Lock()
	samplingTaskStatus.StopRequested = true
	samplingTaskStatus.Message = "正在停止采样任务..."
	samplingTaskMutex.Unlock()

	common.SysLog("[Sampling] 收到停止采样请求")
	return nil
}

// StartSamplingScheduler 启动定时采样调度器
func StartSamplingScheduler() {
	go func() {
		common.SysLog("[Sampling] 定时采样调度器已启动")
		for {
			interval := getSamplingIntervalMinutes()
			if interval <= 0 {
				// 定时采样已关闭，等待一段时间后重新检查配置
				time.Sleep(5 * time.Minute)
				continue
			}

			// 等待一个间隔周期
			time.Sleep(time.Duration(interval) * time.Minute)

			// 检查是否已有采样任务在运行
			samplingTaskMutex.RLock()
			isRunning := samplingTaskStatus.IsRunning
			samplingTaskMutex.RUnlock()

			if isRunning {
				common.SysLog("[Sampling] 跳过本次定时采样，已有任务正在运行")
				continue
			}

			// 检查当前时间是否在采样时间段内
			if !isWithinSamplingWindow() {
				startMin, endMin := getSamplingTimeRange()
				startHour, startMinOnly := startMin/60, startMin%60
				endHour, endMinOnly := endMin/60, endMin%60
				common.SysLog(fmt.Sprintf("[Sampling] 当前时间不在采样时间段 %02d:%02d - %02d:%02d 内，跳过", startHour, startMinOnly, endHour, endMinOnly))
				continue
			}

			common.SysLog("[Sampling] 定时采样触发")
			if err := RunSamplingTask(); err != nil {
				common.SysError(fmt.Sprintf("[Sampling] 定时采样任务执行失败: %v", err))
			}
		}
	}()
}
