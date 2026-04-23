package model

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const DefaultSamplingIntervalSeconds = 10

var ErrSamplingForbidden = errors.New("sampling forbidden or rate limited")

// RunSamplingTask 执行采样任务
// 遍历所有测试渠道，对每个模型执行采样
func RunSamplingTask() error {
	// 获取所有测试渠道
	var channels []*Channel
	if err := DB.Where("is_test_channel = ? AND status = ?", 1, common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
		return fmt.Errorf("failed to get test channels: %w", err)
	}

	if len(channels) == 0 {
		return nil
	}

	// 获取启用的采样配置
	configs, err := GetActiveSamplingConfigs()
	if err != nil {
		return fmt.Errorf("failed to get sampling configs: %w", err)
	}

	if len(configs) == 0 {
		return nil
	}

	// 遍历每个渠道的每个模型，使用第一个启用的采样配置进行测试
	for _, channel := range channels {
		models := channel.GetModels()
		interval := getChannelSamplingInterval(channel)

		for i, modelName := range models {
			if modelName == "" {
				continue
			}

			// 模型间间隔（第一个模型不需要等待）
			if i > 0 && interval > 0 {
				time.Sleep(time.Duration(interval) * time.Second)
			}

			// 使用第一个启用的采样配置
			config := configs[0]
			tps, ttft, err := sampleModelPerformance(channel, modelName, config)
			if err != nil {
				if errors.Is(err, ErrSamplingForbidden) {
					common.SysLog(fmt.Sprintf("sampling forbidden for channel=%d, skip remaining models", channel.Id))
					break // 跳过该渠道剩余模型
				}
				common.SysLog(fmt.Sprintf("sampling failed: channel=%d, model=%s, error=%v", channel.Id, modelName, err))
				continue
			}

			if err := UpsertModelPerformance(channel.Id, modelName, tps, ttft); err != nil {
				common.SysLog(fmt.Sprintf("failed to save performance: channel=%d, model=%s, error=%v", channel.Id, modelName, err))
			}
		}
	}

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
