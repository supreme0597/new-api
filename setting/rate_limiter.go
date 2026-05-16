package setting

import (
	"sync"
	"time"
)

// SlidingWindowLimiter 滑动窗口速率限制器
// 适用于任何需要按时间窗口限流的场景（如采样任务、API 调用等）
type SlidingWindowLimiter struct {
	mu       sync.Mutex
	window   time.Duration
	maxCount int
	requests []time.Time
	notify   chan struct{}
}

// NewSlidingWindowLimiter 创建滑动窗口速率限制器
func NewSlidingWindowLimiter(durationMinutes, maxCount int) *SlidingWindowLimiter {
	window := time.Duration(durationMinutes) * time.Minute
	if window <= 0 {
		window = time.Minute
	}
	return &SlidingWindowLimiter{
		window:   window,
		maxCount: maxCount,
		requests: make([]time.Time, 0, maxCount),
		notify:   make(chan struct{}, 1),
	}
}

// Allow 非阻塞检查是否可以发送请求
func (r *SlidingWindowLimiter) Allow() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cleanup()
	return len(r.requests) < r.maxCount
}

// Record 记录一次请求
func (r *SlidingWindowLimiter) Record() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.requests = append(r.requests, time.Now())
	select {
	case r.notify <- struct{}{}:
	default:
	}
}

// Wait 阻塞等待直到有可用配额
func (r *SlidingWindowLimiter) Wait() {
	for {
		r.mu.Lock()
		r.cleanup()
		if len(r.requests) < r.maxCount {
			r.mu.Unlock()
			return
		}
		waitUntil := r.requests[0].Add(r.window)
		waitDuration := time.Until(waitUntil)
		r.mu.Unlock()

		if waitDuration <= 0 {
			return
		}
		select {
		case <-r.notify:
			continue
		case <-time.After(waitDuration):
			continue
		}
	}
}

// cleanup 清理过期的请求记录
func (r *SlidingWindowLimiter) cleanup() {
	cutoff := time.Now().Add(-r.window)
	i := 0
	for i < len(r.requests) && r.requests[i].Before(cutoff) {
		i++
	}
	if i > 0 {
		r.requests = r.requests[i:]
	}
}
