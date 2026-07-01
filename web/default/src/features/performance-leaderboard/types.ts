export interface LeaderboardItem {
  rank: number
  model_name: string
  group?: string
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

export interface LeaderboardTimeFilter {
  startTime?: number  // 毫秒时间戳
  endTime?: number    // 毫秒时间戳
}
