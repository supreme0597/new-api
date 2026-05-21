import { api } from '@/lib/api'

export async function getPerfMetricsSummary(hours: number = 24) {
  const res = await api.get('/api/perf-metrics/summary', {
    params: { hours },
  })
  return res.data
}

export async function getPerfMetrics(model: string, group?: string, hours: number = 24) {
  const res = await api.get('/api/perf-metrics', {
    params: { model, group, hours },
  })
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
