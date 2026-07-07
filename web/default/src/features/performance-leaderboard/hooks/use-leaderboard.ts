import { useQuery } from '@tanstack/react-query'
import { getLeaderboard, getLeaderboardGroups, getLeaderboardVendors, type LeaderboardParams } from '../api'
import type { LeaderboardTimeRange } from '../types'

export function useLeaderboard(params: {
  vendorId?: number
  group?: string
  hours?: LeaderboardTimeRange
  startTime?: number
  endTime?: number
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: string
  timeField?: string
}) {
  return useQuery({
    queryKey: ['performance-leaderboard', params],
    queryFn: () =>
      getLeaderboard({
        vendor_id: params.vendorId,
        group: params.group,
        hours: params.hours,
        start_time: params.startTime,
        end_time: params.endTime,
        page: params.page,
        pageSize: params.pageSize,
        sort_by: params.sortBy,
        sort_order: params.sortOrder,
        time_field: params.timeField as LeaderboardParams['time_field'],
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

export function useLeaderboardGroups(params: {
  hours?: LeaderboardTimeRange
  startTime?: number
  endTime?: number
} = {}) {
  const { hours, startTime, endTime } = params
  return useQuery({
    queryKey: ['performance-leaderboard', 'groups', params],
    queryFn: () => getLeaderboardGroups({ hours, start_time: startTime, end_time: endTime }),
    staleTime: 10 * 60 * 1000,
  })
}
