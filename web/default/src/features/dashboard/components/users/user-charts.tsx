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
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import { Users, Loader2, ArrowUpDown, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getRollingDateRange, type TimeGranularity } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'
import { useThemeCustomization } from '@/context/theme-customization-provider'
import { useTheme } from '@/context/theme-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getUserQuotaDataByUsers,
  exportUserQuotaData,
  type ExportQuotaDataItem,
} from '@/features/dashboard/api'
import {
  TIME_GRANULARITY_OPTIONS,
  TIME_RANGE_PRESETS,
} from '@/features/dashboard/constants'
import {
  getDefaultDays,
  getSavedGranularity,
  saveGranularity,
  processUserChartData,
  type UserChartMetric,
} from '@/features/dashboard/lib'
import type { ProcessedUserChartData } from '@/features/dashboard/types'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

const USER_CHARTS: {
  value: string
  labelKey: string
  specKey: keyof ProcessedUserChartData
}[] = [
  {
    value: 'rank',
    labelKey: 'User Consumption Ranking',
    specKey: 'spec_user_rank',
  },
  {
    value: 'trend',
    labelKey: 'User Consumption Trend',
    specKey: 'spec_user_trend',
  },
]

const TOP_USER_LIMIT_OPTIONS = [5, 10, 20, 50, 100]

export function UserCharts({
  metric = 'quota',
  defaultDays,
  hideTimeRangePresets = false,
  vendor,
  group,
  models,
  onModelsChange,
  onExport,
}: {
  metric?: UserChartMetric
  defaultDays?: number
  hideTimeRangePresets?: boolean
  vendor?: string
  group?: string
  models?: string
  onModelsChange?: (models: string) => void
  onExport?: () => void
}) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { customization } = useThemeCustomization()
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

  const [timeGranularity, setTimeGranularity] = useState<TimeGranularity>(() =>
    getSavedGranularity()
  )
  const [selectedRange, setSelectedRange] = useState<number>(() =>
    defaultDays ?? getDefaultDays(timeGranularity)
  )
  const [topUserLimit, setTopUserLimit] = useState(10)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [timeRange, setTimeRange] = useState(() => {
    const days = defaultDays ?? getDefaultDays(timeGranularity)
    const { start, end } = getRollingDateRange(days)
    return {
      start_timestamp: Math.floor(start.getTime() / 1000),
      end_timestamp: Math.floor(end.getTime() / 1000),
    }
  })

  const handleRangeChange = useCallback((days: number) => {
    setSelectedRange(days)
    const { start, end } = getRollingDateRange(days)
    setTimeRange({
      start_timestamp: Math.floor(start.getTime() / 1000),
      end_timestamp: Math.floor(end.getTime() / 1000),
    })
  }, [])

  const handleGranularityChange = useCallback(
    (g: TimeGranularity) => {
      setTimeGranularity(g)
      saveGranularity(g)
      // Granularity and time range are independent controls.
      // Switching granularity only changes how data is grouped,
      // not the time window being queried.
    },
    []
  )

  useEffect(() => {
    if (defaultDays != null) {
      setSelectedRange(defaultDays)
      const { start, end } = getRollingDateRange(defaultDays)
      setTimeRange({
        start_timestamp: Math.floor(start.getTime() / 1000),
        end_timestamp: Math.floor(end.getTime() / 1000),
      })
    }
  }, [defaultDays])

  useEffect(() => {
    const updateTheme = async () => {
      setThemeReady(false)
      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (m) => m.ThemeManager
        )
      }
      const ThemeManager = await themeManagerPromise
      themeManagerRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }
    updateTheme()
  }, [resolvedTheme])

  const { data: userData, isLoading } = useQuery({
    queryKey: ['dashboard', 'user-quota', timeRange, vendor, group, models, sortDirection],
    queryFn: () =>
      getUserQuotaDataByUsers({
        start_timestamp: timeRange.start_timestamp,
        end_timestamp: timeRange.end_timestamp,
        vendor,
        group,
        models,
        include_all: true,
        sort_direction: sortDirection,
      }),
    select: (res) => (res.success ? res.data : []),
    staleTime: 60_000,
  })

  // Extract unique model names from the fetched user data for the dropdown
  const availableModels = useMemo(() => {
    if (!userData || userData.length === 0) return []
    const modelSet = new Set<string>()
    for (const item of userData) {
      if (item.model_name) modelSet.add(item.model_name)
    }
    return Array.from(modelSet).sort()
  }, [userData])

  const chartData = useMemo(
    () =>
      processUserChartData(
        isLoading ? [] : (userData ?? []),
        timeGranularity,
        t,
        topUserLimit,
        customization.preset,
        metric,
        sortDirection
      ),
    [
      userData,
      isLoading,
      timeGranularity,
      t,
      topUserLimit,
      customization.preset,
      metric,
      customization.radius,
      sortDirection,
    ]
  )

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-1.5 overflow-x-auto pb-1 sm:gap-2'>
          {!hideTimeRangePresets && (
          <Tabs
              value={String(selectedRange)}
              onValueChange={(value) => handleRangeChange(Number(value))}
              className='shrink-0'
            >
              <TabsList>
                {TIME_RANGE_PRESETS.map((preset) => (
                  <TabsTrigger
                    key={preset.days}
                    value={String(preset.days)}
                    className='px-2.5 text-xs'
                  >
                    {t(preset.label)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        <Tabs
          value={timeGranularity}
          onValueChange={(value) =>
            handleGranularityChange(value as TimeGranularity)
          }
          className='shrink-0'
        >
          <TabsList>
            {TIME_GRANULARITY_OPTIONS.map((opt) => (
              <TabsTrigger
                key={opt.value}
                value={opt.value}
                className='px-2.5 text-xs'
              >
                {t(opt.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs
          value={String(topUserLimit)}
          onValueChange={(value) => setTopUserLimit(Number(value))}
          className='shrink-0'
        >
          <TabsList>
            <span className='text-muted-foreground px-2 text-xs font-medium whitespace-nowrap'>
              {t('Top Users')}
            </span>
            {TOP_USER_LIMIT_OPTIONS.map((limit) => (
              <TabsTrigger
                key={limit}
                value={String(limit)}
                className='px-2.5 text-xs'
              >
                {t('Top {{count}}', { count: limit })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <button
          type='button'
          onClick={() =>
            setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
          }
          className='inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0'
          title={
            sortDirection === 'desc'
              ? t('Sorted descending')
              : t('Sorted ascending')
          }
        >
          <ArrowUpDown className='size-3.5' />
          <span>
            {sortDirection === 'desc' ? t('Desc') : t('Asc')}
          </span>
        </button>

        {/* Model filter dropdown */}
        {onModelsChange !== undefined && (
          <Select
            value={models ?? ''}
            onValueChange={(value) => onModelsChange(value || '')}
          >
            <SelectTrigger className='h-7 w-40 shrink-0'>
              <SelectValue placeholder={t('All Models')} />
            </SelectTrigger>
            <SelectContent align='end'>
              <SelectGroup>
                <SelectItem value=''>{t('All Models')}</SelectItem>
                {(availableModels ?? []).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}

        {/* Export button */}
        {onExport !== undefined && (
          <button
            type='button'
            onClick={onExport}
            className='inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0'
            title={t('Export Excel')}
          >
            <Download className='size-3.5' />
            <span className='hidden sm:inline'>{t('Export')}</span>
          </button>
        )}

        {isLoading && (
          <Loader2 className='text-muted-foreground size-4 animate-spin' />
        )}
      </div>

      <div className='grid gap-3'>
        {USER_CHARTS.map((chart) => {
          const spec = chartData[chart.specKey]

          return (
            <div
              key={chart.value}
              className='overflow-hidden rounded-lg border'
            >
              <div className='flex w-full items-center gap-2 border-b px-3 py-2 sm:px-5 sm:py-3'>
                <Users className='text-muted-foreground/60 size-4' />
                <div className='text-sm font-semibold'>{t(chart.labelKey)}</div>
              </div>

              <div className='p-1.5 sm:p-2' style={{ height: `${chart.value === 'rank' ? Math.max((spec?.data?.[0]?.values?.length ?? topUserLimit) * 40, 300) : 300}px` }}>
                {isLoading ? (
                  <Skeleton className='h-full w-full' />
                ) : (
                  themeReady &&
                  spec && (
                    <VChart
                      key={`user-${chart.value}-${topUserLimit}-${resolvedTheme}-${customization.preset}`}
                      spec={{
                        ...spec,
                        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                        background: 'transparent',
                      }}
                      option={VCHART_OPTION}
                    />
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
