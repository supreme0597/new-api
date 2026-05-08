import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { MyChannels } from '@/features/channels/my-channels'

const myChannelsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  filter: z.string().optional().catch(''),
  status: z.array(z.string()).optional().catch([]),
  type: z.array(z.string()).optional().catch([]),
  group: z.array(z.string()).optional().catch([]),
  scope: z.array(z.string()).optional().catch([]),
  model: z.string().optional().catch(''),
  owner: z.array(z.string()).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/my-channels/')({
  validateSearch: myChannelsSearchSchema,
  component: MyChannels,
})
