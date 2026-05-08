import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { PerformanceLeaderboard } from '@/features/performance-leaderboard'

const leaderboardSearchSchema = z.object({
  vendor_id: z.string().optional().catch(undefined),
  hours: z.number().optional().catch(24),
  page: z.number().optional().catch(1),
})

export const Route = createFileRoute('/performance-leaderboard/')({
  validateSearch: leaderboardSearchSchema,
  component: PerformanceLeaderboard,
})
