import { api } from '@/lib/api'

export interface LeaderboardParams {
  vendor_id?: number
  hours?: number
  start_time?: number  // 毫秒时间戳
  end_time?: number    // 毫秒时间戳
  page?: number
  pageSize?: number
  sort_by?: string
  sort_order?: string
}

export async function getLeaderboard(params: LeaderboardParams = {}) {
  const searchParams = new URLSearchParams()
  if (params.vendor_id) searchParams.set('vendor_id', String(params.vendor_id))
  if (params.hours) searchParams.set('hours', String(params.hours))
  if (params.start_time) searchParams.set('start_time', String(params.start_time))
  if (params.end_time) searchParams.set('end_time', String(params.end_time))
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))
  if (params.sort_by) searchParams.set('sort_by', params.sort_by)
  if (params.sort_order) searchParams.set('sort_order', params.sort_order)

  const res = await api.get(`/api/model-performance/list?${searchParams.toString()}`)
  return res.data
}

export async function getLeaderboardVendors() {
  const res = await api.get('/api/model-performance/vendors')
  return res.data
}
