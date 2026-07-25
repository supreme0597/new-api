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
import { useState, useCallback } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'
import { api } from '@/lib/api'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { UserCharts } from '@/features/dashboard/components/users/user-charts'
import { exportUserQuotaData } from '@/features/dashboard/api'
import type { UserChartMetric } from '@/features/dashboard/lib'
import {
  MarketShareSection,
  ModelsSection,
  PulseSection,
  RankingsHero,
} from './components'
import { useRankings } from './hooks/use-rankings'
import type { RankingPeriod } from './types'

const VALID_PERIODS: RankingPeriod[] = ['today', 'week', 'month', 'year', 'all']

const HIDDEN_GROUPS = ['auto', 'vip', 'svip', 'RTOS测试', '中软测试']

const PERIOD_TO_DAYS: Record<RankingPeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
  year: 365,
  all: 365,
}

export function Rankings() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/rankings/' })
  const navigate = useNavigate()

  const [userMetric, setUserMetric] = useState<UserChartMetric>('token_used')
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null)
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<string>('')

  const period: RankingPeriod = VALID_PERIODS.includes(
    search.period as RankingPeriod
  )
    ? (search.period as RankingPeriod)
    : 'week'

  const toggleGroup = useCallback((group: string) => {
    setSelectedGroups((prev) =>
      prev.includes(group)
        ? prev.filter((g) => g !== group)
        : [...prev, group]
    )
  }, [])

  const handleExport = useCallback(async () => {
    try {
      const periodDays = PERIOD_TO_DAYS[period]
      const { start, end } = (() => {
        const now = new Date()
        const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const startDate = new Date(endDate)
        startDate.setDate(startDate.getDate() - periodDays)
        return { start: startDate, end: endDate }
      })()

      const data = await exportUserQuotaData({
        start_timestamp: Math.floor(start.getTime() / 1000),
        end_timestamp: Math.floor(end.getTime() / 1000),
        vendor: selectedVendor ?? undefined,
        groups: selectedGroups.length > 0 ? selectedGroups.join(',') : undefined,
        models: selectedModels || undefined,
      })

      if (!data || data.length === 0) {
        toast.info(t('No data to export'))
        return
      }

      const XLSX = await import('xlsx')
      const rows = data.map((item) => ({
        [t('Username')]: item.display_name || item.username,
        [t('Group')]: item.group,
        [t('Model')]: item.model_name,
        [t('Token Usage')]: item.token_used,
        [t('Request Count')]: item.count,
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()

      const formatDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const sheetName = `UserStats_${formatDate(start)}_to_${formatDate(end)}`
      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))

      const fileName = `${sheetName}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (err) {
      toast.error(t('Export failed') + (err instanceof Error ? `: ${err.message}` : ''))
    }
  }, [period, selectedVendor, selectedGroups, selectedModels, t])

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: string[] }>('/api/group/')
      return res.data.data ?? []
    },
    staleTime: 120_000,
  })
  const groups = (groupsData ?? []).filter((g) => !HIDDEN_GROUPS.includes(g))

  const rankingsQuery = useRankings(period)
  const snapshot = rankingsQuery.data?.data

  const handlePeriodChange = (next: RankingPeriod) => {
    navigate({
      to: '/rankings',
      search: (prev) => ({ ...prev, period: next }),
    })
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='relative'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-x-0 top-0 h-[600px] opacity-20 dark:opacity-[0.10]'
          style={{
            background: [
              'radial-gradient(ellipse 60% 50% at 20% 20%, oklch(0.72 0.18 250 / 80%) 0%, transparent 70%)',
              'radial-gradient(ellipse 50% 40% at 80% 15%, oklch(0.65 0.15 200 / 60%) 0%, transparent 70%)',
              'radial-gradient(ellipse 40% 35% at 50% 70%, oklch(0.70 0.12 280 / 40%) 0%, transparent 70%)',
            ].join(', '),
            maskImage:
              'linear-gradient(to bottom, black 40%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 40%, transparent 100%)',
          }}
        />
        <PageTransition className='relative mx-auto w-full max-w-[1280px] space-y-8 px-3 pt-16 pb-10 sm:px-6 sm:pt-20 sm:pb-12 xl:px-8'>
          <RankingsHero period={period} onPeriodChange={handlePeriodChange} />

          {rankingsQuery.isLoading ? (
            <RankingsLoading />
          ) : !snapshot ? (
            <RankingsError
              message={
                rankingsQuery.error instanceof Error
                  ? rankingsQuery.error.message
                  : t('Unable to load rankings data')
              }
            />
          ) : (
            <>
              <ModelsSection
                history={snapshot.models_history}
                rows={snapshot.models}
                period={period}
              />

              <MarketShareSection
                history={snapshot.vendor_share_history}
                rows={snapshot.vendors}
                period={period}
                selectedVendor={selectedVendor}
                onVendorClick={(vendor) => setSelectedVendor(prev => prev === vendor ? null : vendor)}
              />

              <PulseSection
                movers={snapshot.top_movers}
                droppers={snapshot.top_droppers}
              />

              <div className='space-y-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h2 className='text-lg font-semibold'>
                    {t('User Statistics')}
                  </h2>
                  {selectedVendor && (
                    <button
                      type='button'
                      onClick={() => setSelectedVendor(null)}
                      className='inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors'
                    >
                      <span>{selectedVendor}</span>
                      <span className='text-primary/60 hover:text-primary'>&times;</span>
                    </button>
                  )}
                  <div className='flex rounded-lg border p-0.5'>
                    {(
                      ['token_used', 'count'] as UserChartMetric[]
                    ).map((m) => (
                      <button
                        key={m}
                        type='button'
                        onClick={() => setUserMetric(m)}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                          userMetric === m
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {m === 'token_used'
                          ? t('Token Usage')
                          : t('Request Count')}
                      </button>
                    ))}
                  </div>
                  {/* Group filter - multi-select via Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type='button'
                        className='inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0'
                      >
                        {selectedGroups.length > 0
                          ? t('{{count}} groups', { count: selectedGroups.length })
                          : t('All Groups')}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align='end' className='w-48 p-1'>
                      <div className='max-h-60 overflow-y-auto'>
                        {groups.map((g) => (
                          <label
                            key={g}
                            className='flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent'
                          >
                            <input
                              type='checkbox'
                              checked={selectedGroups.includes(g)}
                              onChange={() => toggleGroup(g)}
                              className='size-3.5 rounded border-muted-foreground/40 accent-primary'
                            />
                            <span>{g}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <UserCharts
                  metric={userMetric}
                  defaultDays={PERIOD_TO_DAYS[period]}
                  hideTimeRangePresets
                  vendor={selectedVendor ?? undefined}
                  group={selectedGroups.length > 0 ? selectedGroups.join(',') : undefined}
                  models={selectedModels || undefined}
                  onModelsChange={setSelectedModels}
                  onExport={handleExport}
                />
              </div>
            </>
          )}
        </PageTransition>
      </div>
    </PublicLayout>
  )
}

function RankingsLoading() {
  return (
    <div className='space-y-6'>
      <Skeleton className='h-[420px] w-full rounded-xl' />
      <Skeleton className='h-[360px] w-full rounded-xl' />
      <Skeleton className='h-[180px] w-full rounded-xl' />
    </div>
  )
}

function RankingsError(props: { message: string }) {
  const { t } = useTranslation()
  return (
    <div className='bg-card rounded-xl border border-dashed px-6 py-12 text-center'>
      <h2 className='text-foreground text-base font-semibold'>
        {t('Unable to load rankings')}
      </h2>
      <p className='text-muted-foreground mx-auto mt-2 max-w-md text-sm'>
        {props.message}
      </p>
    </div>
  )
}
