import { api } from '@/lib/api'

export type PerfTimeField = 'created_at' | 'model_start_time' | 'model_end_time' | 'request_time'

export async function getPerfMetricsSummary(hours: number = 24, timeField?: PerfTimeField) {
  const params: Record<string, string | number> = { hours }
  if (timeField) params.time_field = timeField
  const res = await api.get('/api/perf-metrics/summary', { params })
  return res.data
}

export async function getPerfMetrics(model: string, group?: string, hours: number = 24, startTime?: number, endTime?: number, timeField?: PerfTimeField) {
  const params: Record<string, string | number> = { model, hours }
  if (group) params.group = group
  if (startTime) params.start_time = startTime
  if (endTime) params.end_time = endTime
  if (timeField) params.time_field = timeField
  const res = await api.get('/api/perf-metrics', { params })
  return res.data
}

export async function getSamplingStatus() {
  const res = await api.get('/api/model-performance/status')
  return res.data
}

export async function refreshSampling() {
  const res = await api.post('/api/model-performance/refresh')
  return res.data
}
