import { useQuery } from '@tanstack/react-query'
import { getLeaderboard, getLeaderboardVendors, getModelPerformanceDetail } from '../api'
import type { LeaderboardTimeRange } from '../types'

export function useLeaderboard(params: {
  vendorId?: number
  hours?: LeaderboardTimeRange
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: string
}) {
  return useQuery({
    queryKey: ['performance-leaderboard', params],
    queryFn: () =>
      getLeaderboard({
        vendor_id: params.vendorId,
        hours: params.hours,
        page: params.page,
        pageSize: params.pageSize,
        sort_by: params.sortBy,
        sort_order: params.sortOrder,
      }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  })
}

export function useLeaderboardVendors() {
  return useQuery({
    queryKey: ['performance-leaderboard', 'vendors'],
    queryFn: getLeaderboardVendors,
    staleTime: 10 * 60 * 1000,
  })
}

export function useModelPerformanceDetail(
  modelName: string | null,
  hours?: number
) {
  return useQuery({
    queryKey: ['model-performance-detail', modelName, hours],
    queryFn: () => getModelPerformanceDetail(modelName!, hours),
    enabled: !!modelName,
    staleTime: 2 * 60 * 1000,
  })
}
