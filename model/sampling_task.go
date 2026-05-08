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

// SamplingResult 采样结果详情
type SamplingResult struct {
	Tps          float64
	TtftMs       int
	TotalTokens  int
	LatencyMs    int64 // 总延迟（请求开始到响应结束）
	GenerationMs int64 // 生成时间（首字节到响应结束）
}

// ChannelSamplingStatus 单个渠道的采样状态
type ChannelSamplingStatus struct {
	ChannelId    int    `json:"channel_id"`
	ChannelName  string `json:"channel_name"`
	TotalTasks   int    `json:"total_tasks"`
	DoneTasks    int    `json:"done_tasks"`
	SuccessTasks int    `json:"success_tasks"`
	FailedTasks  int    `json:"failed_tasks"`
	Message      string `json:"message"`
}

// SamplingTaskStatus 采样任务执行状态
type SamplingTaskStatus struct {
	IsRunning      bool                     `json:"is_running"`
	TotalTasks     int                      `json:"total_tasks"`
	DoneTasks      int                      `json:"done_tasks"`
	SuccessTasks   int                      `json:"success_tasks"`
	FailedTasks    int                      `json:"failed_tasks"`
	CurrentChannel string                   `json:"current_channel"`
	CurrentModel   string                   `json:"current_model"`
	Message        string                   `json:"message"`
	UpdatedAt      int64                    `json:"updated_at"`
	StopRequested  bool                     `json:"stop_requested"`
	LastResult     *LastSamplingResult      `json:"last_result"`
	Channels       []*ChannelSamplingStatus `json:"channels"`
}

var (
	samplingTaskStatus   SamplingTaskStatus
	samplingTaskMutex    sync.RWMutex
	samplingStopFlag     atomic.Bool
	samplingConfigNotify = make(chan struct{}, 1) // 通知调度器配置已变更
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

func updateChannelSamplingProgress(channelId int, channelName string, done, success, failed, total int, message string) {
	samplingTaskMutex.Lock()
	defer samplingTaskMutex.Unlock()
	for _, ch := range samplingTaskStatus.Channels {
		if ch.ChannelId == channelId {
			ch.ChannelName = channelName
			ch.DoneTasks = done
			ch.SuccessTasks = success
			ch.FailedTasks = failed
			ch.TotalTasks = total
			ch.Message = message
			break
		}
	}
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
	samplingTaskStatus.Channels = make([]*ChannelSamplingStatus, 0)
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
	if err := DB.Where("owner_user_id = ? AND status = ?", TestChannelOwnerUserId, common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
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

	// 计算总任务数，并初始化渠道状态
	totalTasks := 0
	channelStatuses := make(map[int]*ChannelSamplingStatus)
	for _, channel := range channels {
		chTotal := 0
		for _, modelName := range channel.GetModels() {
			if modelName != "" {
				chTotal++
				totalTasks++
			}
		}
		channelName := channel.Name
		if channelName == "" {
			channelName = fmt.Sprintf("渠道 #%d", channel.Id)
		}
		channelStatuses[channel.Id] = &ChannelSamplingStatus{
			ChannelId:   channel.Id,
			ChannelName: channelName,
			TotalTasks:  chTotal,
		}
	}

	samplingTaskMutex.Lock()
	samplingTaskStatus.TotalTasks = totalTasks
	for _, chStatus := range channelStatuses {
		samplingTaskStatus.Channels = append(samplingTaskStatus.Channels, chStatus)
	}
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

			// 渠道级计数器
			chDone := 0
			chSuccess := 0
			chFailed := 0
			chTotal := channelStatuses[ch.Id].TotalTasks

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
				chDone++

				updateSamplingTaskProgress(currentDone, currentSuccess, currentFailed, channelName, modelName,
					fmt.Sprintf("正在采样: %s / %s (%d/%d)", channelName, modelName, currentDone, totalTasks))
				updateChannelSamplingProgress(ch.Id, channelName, chDone, chSuccess, chFailed, chTotal,
					fmt.Sprintf("正在采样: %s", modelName))

				common.SysLog(fmt.Sprintf("[Sampling] [%d/%d] 采样渠道=%s, 模型=%s", currentDone, totalTasks, channelName, modelName))

				result, err := sampleModelPerformance(ch, modelName, config)
				if err != nil {
					failedAtomic.Add(1)
					chFailed++
					record := SamplingRecord{
						Channel: channelName,
						Model:   modelName,
						Success: false,
						Message: err.Error(),
					}
					resultMutex.Lock()
					lastResult.FailedList = append(lastResult.FailedList, record)
					resultMutex.Unlock()

					if errors.Is(err, ErrSamplingForbidden) {
						common.SysLog(fmt.Sprintf("[Sampling] 渠道 %s 被限流/禁止访问，跳过该渠道剩余模型", channelName))
						updateSamplingTaskProgress(int(doneAtomic.Load()), int(successAtomic.Load()), int(failedAtomic.Load()), channelName, modelName,
							fmt.Sprintf("渠道 %s 被限流，跳过剩余模型", channelName))
						updateChannelSamplingProgress(ch.Id, channelName, chDone, chSuccess, chFailed, chTotal, "被限流，跳过剩余模型")
						return // 跳过该渠道剩余模型
					}
					common.SysLog(fmt.Sprintf("[Sampling] 采样失败: 渠道=%s, 模型=%s, 错误=%v", channelName, modelName, err))
					updateSamplingTaskProgress(int(doneAtomic.Load()), int(successAtomic.Load()), int(failedAtomic.Load()), channelName, modelName,
						fmt.Sprintf("采样失败: %s / %s", channelName, modelName))
					updateChannelSamplingProgress(ch.Id, channelName, chDone, chSuccess, chFailed, chTotal,
						fmt.Sprintf("失败: %s", modelName))
					continue
				}

				successAtomic.Add(1)
				chSuccess++
				record := SamplingRecord{
					Channel: channelName,
					Model:   modelName,
					Success: true,
					Message: fmt.Sprintf("TPS=%.1f, TTFT=%dms", result.Tps, result.TtftMs),
				}
				resultMutex.Lock()
				lastResult.SuccessList = append(lastResult.SuccessList, record)
				resultMutex.Unlock()

				common.SysLog(fmt.Sprintf("[Sampling] 采样成功: 渠道=%s, 模型=%s, TPS=%.1f, TTFT=%dms", channelName, modelName, result.Tps, result.TtftMs))

				if err := RecordSamplingMetric(modelName, ch.Group, result.LatencyMs, int64(result.TtftMs), int64(result.TotalTokens), result.GenerationMs); err != nil {
					common.SysError(fmt.Sprintf("[Sampling] 记录性能数据失败: 渠道=%s, 模型=%s, 错误=%v", channelName, modelName, err))
				}

				updateSamplingTaskProgress(int(doneAtomic.Load()), int(successAtomic.Load()), int(failedAtomic.Load()), channelName, modelName,
					fmt.Sprintf("完成: %s / %s (TPS=%.1f, TTFT=%dms)", channelName, modelName, result.Tps, result.TtftMs))
				updateChannelSamplingProgress(ch.Id, channelName, chDone, chSuccess, chFailed, chTotal,
					fmt.Sprintf("完成: %s", modelName))
			}

			common.SysLog(fmt.Sprintf("[Sampling] 渠道 %s 采样完成", channelName))
			updateChannelSamplingProgress(ch.Id, channelName, chDone, chSuccess, chFailed, chTotal, "采样完成")
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

// sampleModelPerformance 对单个模型执行采样，返回采样结果详情
func sampleModelPerformance(channel *Channel, modelName string, config *SamplingConfig) (*SamplingResult, error) {
	logPrefix := fmt.Sprintf("[Sampling][渠道=%s,模型=%s]", channel.Name, modelName)

	baseURL := channel.GetBaseURL()
	if baseURL == "" {
		common.SysError(fmt.Sprintf("%s 渠道 %d 没有 base URL", logPrefix, channel.Id))
		return nil, fmt.Errorf("channel %d has no base URL", channel.Id)
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
		return nil, fmt.Errorf("create request failed: %w", err)
	}

	// 设置请求头
	keys := channel.GetKeys()
	if len(keys) == 0 {
		common.SysError(fmt.Sprintf("%s 渠道 %d 没有密钥", logPrefix, channel.Id))
		return nil, fmt.Errorf("channel %d has no keys", channel.Id)
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
		return nil, fmt.Errorf("request failed: %w", err)
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
			return nil, fmt.Errorf("%w: status %d, body: %s", ErrSamplingForbidden, resp.StatusCode, string(body))
		}
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	// 读取流式响应，记录首字节时间和总 token 数
	var firstByteTime time.Time
	totalTokens := 0
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			// 记录首字节到达时间（TTFT）
			if firstByteTime.IsZero() {
				firstByteTime = time.Now()
			}
			// 简单统计 SSE 数据中的 token
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

	endTime := time.Now()
	latencyMs := endTime.Sub(startTime).Milliseconds()

	var ttftMs int
	var generationMs int64
	if !firstByteTime.IsZero() {
		ttftMs = int(firstByteTime.Sub(startTime).Milliseconds())
		generationMs = endTime.Sub(firstByteTime).Milliseconds()
	} else {
		ttftMs = int(latencyMs)
		generationMs = latencyMs
	}

	elapsed := endTime.Sub(startTime).Seconds()
	var tps float64
	if elapsed > 0 {
		tps = float64(totalTokens) / elapsed
	}

	common.SysLog(fmt.Sprintf("%s 采样完成: elapsed=%.2fs, tokens=%d, TPS=%.1f, TTFT=%dms", logPrefix, elapsed, totalTokens, tps, ttftMs))
	return &SamplingResult{
		Tps:          tps,
		TtftMs:       ttftMs,
		TotalTokens:  totalTokens,
		LatencyMs:    latencyMs,
		GenerationMs: generationMs,
	}, nil
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
		// 首次启动时等待一小段时间，确保系统初始化完成（OptionMap 加载等）
		interruptibleSleep(10 * time.Second)
		for {
			interval := getSamplingIntervalMinutes()
			if interval <= 0 {
				// 定时采样已关闭，等待一段时间后重新检查配置
				common.SysLog("[Sampling] 定时采样已关闭（间隔=0），5 分钟后重新检查")
				interruptibleSleep(5 * time.Minute)
				continue
			}

			// 先检查是否已有采样任务在运行
			samplingTaskMutex.RLock()
			isRunning := samplingTaskStatus.IsRunning
			samplingTaskMutex.RUnlock()

			if isRunning {
				common.SysLog("[Sampling] 跳过本次定时采样，已有任务正在运行")
				interruptibleSleep(time.Duration(interval) * time.Minute)
				continue
			}

			// 先检查当前时间是否在采样时间段内
			if !isWithinSamplingWindow() {
				// 不在采样窗口，计算距离窗口开始的等待时间
				sleepDuration := calcSleepUntilWindowStart(interval)
				startMin, endMin := getSamplingTimeRange()
				startHour, startMinOnly := startMin/60, startMin%60
				endHour, endMinOnly := endMin/60, endMin%60
				common.SysLog(fmt.Sprintf("[Sampling] 当前时间不在采样时间段 %02d:%02d - %02d:%02d 内，等待 %v", startHour, startMinOnly, endHour, endMinOnly, sleepDuration))
				interruptibleSleep(sleepDuration)
				continue
			}

			// 在采样窗口内，执行采样任务
			common.SysLog("[Sampling] 定时采样触发")
			if err := RunSamplingTask(); err != nil {
				common.SysError(fmt.Sprintf("[Sampling] 定时采样任务执行失败: %v", err))
			}

			// 执行完毕后再等待一个间隔周期
			common.SysLog(fmt.Sprintf("[Sampling] 下次采样将在 %d 分钟后", interval))
			interruptibleSleep(time.Duration(interval) * time.Minute)
		}
	}()
}

// interruptibleSleep 可被配置变更通知打断的 sleep
// 当收到 samplingConfigNotify 信号时立即返回，使调度器重新读取最新配置
func interruptibleSleep(d time.Duration) {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		// 正常超时
	case <-samplingConfigNotify:
		// 配置变更，提前唤醒
		common.SysLog("[Sampling] 检测到配置变更，提前唤醒调度器")
	}
}

// NotifySamplingConfigChange 通知调度器采样配置已变更
// 调度器会立即重新读取配置并重新计算调度时间
func NotifySamplingConfigChange() {
	select {
	case samplingConfigNotify <- struct{}{}:
	default:
		// channel 已有信号，无需重复发送
	}
}

// calcSleepUntilWindowStart 计算距离下一个采样窗口开始的等待时间
// 如果当前不在窗口内，返回到窗口开始的时间；如果无法精确计算，返回 interval 分钟
func calcSleepUntilWindowStart(interval int) time.Duration {
	startMin, endMin := getSamplingTimeRange()
	now := time.Now()
	currentMin := now.Hour()*60 + now.Minute()

	var targetMin int
	if startMin <= endMin {
		// 正常区间，如 09:00 - 18:00
		if currentMin < startMin {
			// 还没到窗口开始
			targetMin = startMin
		} else {
			// 已过窗口结束，等待明天窗口开始
			targetMin = startMin + 24*60
		}
	} else {
		// 跨天区间，如 22:00 - 06:00
		// 当前不在窗口内，说明 currentMin > endMin && currentMin < startMin
		targetMin = startMin
		if currentMin > endMin && currentMin < startMin {
			targetMin = startMin
		}
	}

	waitMinutes := targetMin - currentMin
	if waitMinutes <= 0 {
		waitMinutes += 24 * 60
	}
	// 限制最大等待时间为 interval 分钟，避免等待过久
	if waitMinutes > interval {
		waitMinutes = interval
	}
	return time.Duration(waitMinutes) * time.Minute
}
