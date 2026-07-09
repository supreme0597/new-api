import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { PerformanceLeaderboard } from '@/features/performance-leaderboard'

const leaderboardSearchSchema = z.object({
  vendor_id: z.string().optional().catch(undefined),
  group: z.string().optional().catch(undefined),
  hours: z.number().optional().catch(24),
  start_time: z.number().optional().catch(undefined),
  end_time: z.number().optional().catch(undefined),
  page: z.number().optional().catch(1),
  sort_by: z.enum(['score', 'tps', 'ttft']).optional().catch('score'),
  sort_order: z.enum(['desc', 'asc']).optional().catch('desc'),
})

export const Route = createFileRoute('/performance-leaderboard/')({
  validateSearch: leaderboardSearchSchema,
  component: PerformanceLeaderboard,
})
