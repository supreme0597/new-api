/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { api } from '@/lib/api'
import type { QuotaDataItem, UptimeGroupResult } from './types'

// ============================================================================
// Dashboard APIs
// ============================================================================

// ----------------------------------------------------------------------------
// Quota & Usage Data
// ----------------------------------------------------------------------------

// Get user quota data within a time range
// Admin users get all users' data by default (matching classic frontend behavior)
export async function getUserQuotaDates(
  params: {
    start_timestamp: number
    end_timestamp: number
    default_time?: string
    username?: string
  },
  isAdmin = false
) {
  const endpoint = isAdmin ? '/api/data' : '/api/data/self'
  const res = await api.get<{ success: boolean; data: QuotaDataItem[] }>(
    endpoint,
    { params }
  )
  return res.data
}

// Get user quota data grouped by users with optional vendor and group filtering
export async function getUserQuotaDataByUsers(params: {
  start_timestamp: number
  end_timestamp: number
  vendor?: string
  group?: string
  models?: string
  include_all?: boolean
  sort_direction?: 'asc' | 'desc'
}) {
  const res = await api.get<{ success: boolean; data: QuotaDataItem[] }>(
    '/api/data/users',
    { params }
  )
  return res.data
}

export interface ExportQuotaDataItem {
  username: string
  display_name: string
  group: string
  model_name: string
  token_used: number
  count: number
}

// Export user quota data for Excel download
export async function exportUserQuotaData(params: {
  start_timestamp: number
  end_timestamp: number
  vendor?: string
  groups?: string
  models?: string
}): Promise<ExportQuotaDataItem[]> {
  const res = await api.get<{ success: boolean; data: ExportQuotaDataItem[] | null }>(
    '/api/data/users/export',
    { params }
  )
  return Array.isArray(res.data.data) ? res.data.data : []
}

// Get uptime monitoring status for all services
export async function getUptimeStatus() {
  const res = await api.get<{ success: boolean; data: UptimeGroupResult[] }>(
    '/api/uptime/status'
  )
  return res.data
}
