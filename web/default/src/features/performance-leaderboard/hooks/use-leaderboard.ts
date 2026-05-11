import { useQuery } from '@tanstack/react-query'
import { getLeaderboard, getLeaderboardVendors } from '../api'
import type { LeaderboardTimeRange } from '../types'

export function useLeaderboard(params: {
  vendorId?: number
  hours?: LeaderboardTimeRange
  page?: number
  pageSize?: number
}) {
  return useQuery({
    queryKey: ['performance-leaderboard', params],
    queryFn: () =>
      getLeaderboard({
        vendor_id: params.vendorId,
        hours: params.hours,
        page: params.page,
        pageSize: params.pageSize,
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
