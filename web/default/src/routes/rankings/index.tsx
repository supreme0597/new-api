import { createFileRoute } from '@tanstack/react-router'
import { Rankings } from '@/features/rankings'

export const Route = createFileRoute('/rankings/')({
  component: Rankings,
})
