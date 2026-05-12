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
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStatus } from '@/hooks/use-status'
import { getPricing } from '../api'
import { getLeaderboard } from '@/features/performance-leaderboard/api'

async function fetchAllLeaderboardModels() {
  // API pageSize capped at 100, so we may need multiple pages
  const allItems: Array<{ model_name: string; avg_tps: number; avg_ttft_ms: number; score: number }> = []
  let page = 1
  const pageSize = 100

  while (true) {
    const res = await getLeaderboard({ hours: 24, page, pageSize, sort_by: 'score', sort_order: 'desc' })
    const list = res?.data?.list
    if (!Array.isArray(list) || list.length === 0) break
    allItems.push(...list)
    if (list.length < pageSize) break // last page
    page++
  }

  return allItems
}

export function usePricingData() {
  const { status } = useStatus()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pricing'],
    queryFn: getPricing,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch performance data (24h) for sorting — all pages
  const { data: perfList } = useQuery({
    queryKey: ['pricing-perf-metrics'],
    queryFn: fetchAllLeaderboardModels,
    staleTime: 5 * 60 * 1000,
  })

  // Ensure rates never reach zero to prevent division errors
  const priceRate = useMemo(
    () => Math.max((status?.price as number) ?? 1, 0.001),
    [status?.price]
  )
  const usdExchangeRate = useMemo(
    () => Math.max((status?.usd_exchange_rate as number) ?? priceRate, 0.001),
    [status?.usd_exchange_rate, priceRate]
  )

  // Build performance lookup map: model_name -> { avg_tps, avg_ttft_ms, score }
  const perfMap = useMemo(() => {
    const map = new Map<string, { avg_tps: number; avg_ttft_ms: number; score: number }>()
    if (Array.isArray(perfList)) {
      for (const item of perfList) {
        map.set(item.model_name, {
          avg_tps: item.avg_tps,
          avg_ttft_ms: item.avg_ttft_ms,
          score: item.score,
        })
      }
    }
    return map
  }, [perfList])

  const models = useMemo(() => {
    if (!data?.data || !data?.vendors) return []

    const vendorMap = new Map(data.vendors.map((v) => [v.id, v]))

    return data.data.map((model) => {
      const vendor = model.vendor_id
        ? vendorMap.get(model.vendor_id)
        : undefined
      const perf = perfMap.get(model.model_name)
      return {
        ...model,
        key: model.model_name,
        vendor_name: vendor?.name,
        vendor_icon: vendor?.icon,
        vendor_description: vendor?.description,
        group_ratio: data.group_ratio,
        avg_tps: perf?.avg_tps,
        avg_ttft_ms: perf?.avg_ttft_ms,
        perf_score: perf?.score,
      }
    })
  }, [data, perfMap])

  return {
    models,
    vendors: data?.vendors ?? [],
    groupRatio: data?.group_ratio ?? {},
    usableGroup: data?.usable_group ?? {},
    endpointMap: data?.supported_endpoint ?? {},
    autoGroups: data?.auto_groups ?? [],
    isLoading,
    error,
    refetch,
    priceRate,
    usdExchangeRate,
  }
}
