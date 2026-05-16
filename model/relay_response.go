package model

import (
	"bufio"
	"encoding/json"
	"io"
	"strings"
	"time"
)

// UpstreamUsage 上游 API 响应中的 usage 字段
// 兼容 OpenAI / Claude / Gemini 等主流 provider 的格式
type UpstreamUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
	// Claude 风格
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// ParseSSEStreamResponse 解析 SSE 流式响应，返回 (promptTokens, completionTokens, firstByteTime)
//
// 核心逻辑：
//   - 逐行扫描 SSE data 行
//   - 在最后一个 chunk 中尝试解析 usage 字段（OpenAI 会在最后 chunk 返回 usage）
//   - 兼容 Claude 的 input_tokens / output_tokens 格式
func ParseSSEStreamResponse(body io.Reader) (prompt, completion int, firstByte time.Time) {
	scanner := bufio.NewScanner(body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}
		if firstByte.IsZero() {
			firstByte = time.Now()
		}
		// 尝试从 chunk 中解析 usage（OpenAI final chunk 包含 usage）
		var chunk struct {
			Usage *UpstreamUsage `json:"usage"`
		}
		if json.Unmarshal([]byte(data), &chunk) == nil && chunk.Usage != nil {
			prompt = chunk.Usage.PromptTokens
			if prompt == 0 {
				prompt = chunk.Usage.InputTokens
			}
			completion = chunk.Usage.CompletionTokens
			if completion == 0 {
				completion = chunk.Usage.OutputTokens
			}
		}
	}
	return
}