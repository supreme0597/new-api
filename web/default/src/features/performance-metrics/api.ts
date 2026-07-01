import { api } from '@/lib/api'

export async function getPerfMetricsSummary(hours: number = 24) {
  const res = await api.get('/api/perf-metrics/summary', {
    params: { hours },
  })
  return res.data
}

export async function getPerfMetrics(model: string, group?: string, hours: number = 24, startTime?: number, endTime?: number) {
  const params: Record<string, string | number> = { model, hours }
  if (group) params.group = group
  if (startTime) params.start_time = startTime
  if (endTime) params.end_time = endTime
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
