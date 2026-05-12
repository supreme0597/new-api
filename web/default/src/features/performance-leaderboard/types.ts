export interface LeaderboardItem {
  rank: number
  model_name: string
  vendor_name: string
  avg_tps: number
  avg_ttft_ms: number
  success_rate: number
  score: number
  sample_count: number
}

export interface LeaderboardResponse {
  list: LeaderboardItem[]
  total: number
  page: number
  pageSize: number
  tpsBenchmark: number
  ttftBenchmark: number
}

export type LeaderboardTimeRange = 24 | 168 | 720 // 24h, 7d, 30d in hours

// 模型性能详情类型
export interface ModelPerformanceDetailRecord {
  group: string
  bucket_ts: number
  request_count: number
  success_count: number
  success_rate: number
  avg_tps: number
  avg_ttft_ms: number
  avg_latency_ms: number
  total_tokens: number
}

export interface ModelPerformanceDetail {
  model_name: string
  vendor_name: string
  total_requests: number
  total_success: number
  total_failed: number
  overall_success_rate: number
  avg_tps: number
  avg_ttft_ms: number
  records: ModelPerformanceDetailRecord[]
  time_range: {
    start_ts: number
    end_ts: number
  }
}

export interface ModelPerformanceDetailResponse {
  success: boolean
  data: ModelPerformanceDetail
}
