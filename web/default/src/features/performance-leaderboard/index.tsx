import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { Clock, Zap, CheckCircle, BarChart3, ExternalLink, ArrowUp, ArrowDown, ChevronsUpDown, ChevronRight, FileText } from 'lucide-react'
import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { CompactDateTimeRangePicker } from '@/features/usage-logs/components/compact-date-time-range-picker'
import { useLeaderboard, useLeaderboardVendors, useLeaderboardGroups } from './hooks/use-leaderboard'
import type { LeaderboardTimeRange, LeaderboardItem } from './types'
import { MetricTooltip } from './metrics-legend'
import { ModelDetailDialog } from './components/model-detail-dialog'
import { ModelDetailsPerformance } from '@/features/pricing/components/model-details-performance'
import type { PricingModel } from '@/features/pricing/types'
import { useState, useMemo, useRef, useEffect } from 'react'
import dayjs from '@/lib/dayjs'

export type SortBy = 'score' | 'tps' | 'ttft'
export type SortOrder = 'asc' | 'desc'

const PAGE_SIZE = 20

export function PerformanceLeaderboard() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/performance-leaderboard/' })
  const navigate = useNavigate()

  // When navigating here without start_time/end_time in the URL,
  // push default time range into the URL to keep the queryKey stable
  // and prevent infinite request loops from dayjs() recomputing on each render.
  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current) return
    if (!search.start_time || !search.end_time) {
      initializedRef.current = true
      navigate({
        replace: true,
        to: '/performance-leaderboard',
        search: (prev) => ({
          ...prev,
          start_time: prev.start_time ?? dayjs().subtract(5, 'minute').valueOf(),
          end_time: prev.end_time ?? dayjs().valueOf(),
        }),
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const vendorId = search.vendor_id ? Number(search.vendor_id) : undefined
  const group = (search.group as string) || undefined
  const hours = (search.hours as LeaderboardTimeRange) || 24
  const now = dayjs()
  const defaultStartTime = now.subtract(5, 'minute').valueOf()
  const defaultEndTime = now.valueOf()
  const startTime = search.start_time ? Number(search.start_time) : defaultStartTime
  const endTime = search.end_time ? Number(search.end_time) : defaultEndTime
  const page = search.page || 1
  const sortBy = (search.sort_by as SortBy) || 'score'
  const sortOrder = (search.sort_order as SortOrder) || 'desc'
  const timeField = (search.time_field as string) || 'model_end_time'

  const leaderboardQuery = useLeaderboard({
    vendorId,
    group,
    hours,
    startTime,
    endTime,
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortOrder,
    timeField,
  })
  const vendorsQuery = useLeaderboardVendors()
  const groupsQuery = useLeaderboardGroups({ hours, startTime, endTime })

  const data = leaderboardQuery.data?.data
  const vendors = vendorsQuery.data?.data || []
  const groups = groupsQuery.data?.data || []

  const handleVendorChange = (value: string) => {
    navigate({
      to: '/performance-leaderboard',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        vendor_id: value === '__all__' ? undefined : value,
        page: 1,
      }),
    })
  }

  const handleGroupChange = (value: string) => {
    navigate({
      to: '/performance-leaderboard',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        group: value === '__all__' ? undefined : value,
        page: 1,
      }),
    })
  }

  const handleTimeRangeChange = (range: { start?: Date; end?: Date }) => {
    navigate({
      to: '/performance-leaderboard',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        start_time: range.start?.getTime(),
        end_time: range.end?.getTime(),
        page: 1,
      }),
    })
  }

  const handleTimeFieldChange = (value: string) => {
    navigate({
      to: '/performance-leaderboard',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        time_field: value,
        page: 1,
      }),
    })
  }

  const handlePageChange = (newPage: number) => {
    navigate({
      to: '/performance-leaderboard',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        page: newPage,
      }),
    })
  }

  const handleSortChange = (newSortBy: SortBy, newSortOrder: SortOrder) => {
    navigate({
      to: '/performance-leaderboard',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        sort_by: newSortBy,
        sort_order: newSortOrder,
      }),
    })
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  const isAdmin = (useAuthStore((s) => s.auth.user?.role) ?? 0) >= 10

  // Sampling detail dialog state (for success rate column, admin only)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)

  const handleOpenDetail = (modelName: string) => {
    setSelectedModel(modelName)
    setDetailDialogOpen(true)
  }

  const handleCloseDetail = () => {
    setDetailDialogOpen(false)
    setSelectedModel(null)
  }

  // Performance detail sheet state (for model name column)
  const [perfSheetOpen, setPerfSheetOpen] = useState(false)
  const [perfModelName, setPerfModelName] = useState<string | null>(null)

  const handleOpenPerfDetail = (modelName: string) => {
    setPerfModelName(modelName)
    setPerfSheetOpen(true)
  }

  const handleClosePerfDetail = () => {
    setPerfSheetOpen(false)
    setPerfModelName(null)
  }

  // Minimal PricingModel for ModelDetailsPerformance (only model_name is used)
  const perfModel: PricingModel | null = perfModelName
    ? { id: 0, model_name: perfModelName, quota_type: 1, model_ratio: 1, completion_ratio: 1, enable_groups: [] }
    : null

  return (
    <PublicLayout showMainContainer={false}>
      <div className='relative'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-x-0 top-0 h-[400px] opacity-15 dark:opacity-[0.08]'
          style={{
            background: [
              'radial-gradient(ellipse 60% 50% at 30% 20%, oklch(0.72 0.16 160 / 70%) 0%, transparent 70%)',
              'radial-gradient(ellipse 50% 40% at 70% 15%, oklch(0.65 0.14 280 / 50%) 0%, transparent 70%)',
            ].join(', '),
            maskImage:
              'linear-gradient(to bottom, black 40%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 40%, transparent 100%)',
          }}
        />
        <PageTransition className='relative mx-auto w-full max-w-[1280px] space-y-8 px-3 pt-16 pb-10 sm:px-6 sm:pt-20 sm:pb-12 xl:px-8'>
          {/* Header */}
          <section className='space-y-5'>
            <div className='space-y-2'>
              <p className='text-muted-foreground text-xs font-medium tracking-widest uppercase'>
                {t('Leaderboards')}
              </p>
              <h1 className='text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.15] font-bold tracking-tight'>
                {t('Performance Leaderboard')}
              </h1>
              <p className='text-muted-foreground/80 max-w-2xl text-sm'>
                {t(
                  'Real-time model performance rankings based on TPS, TTFT, and success rate from live traffic sampling.'
                )}
              </p>
            </div>

            {/* Scoring Rules Card */}
            <ScoringRulesCard
              tpsBenchmark={data?.tpsBenchmark ?? 100}
              ttftBenchmark={data?.ttftBenchmark ?? 1000}
            />

            {/* Filters */}
            <div className='flex flex-wrap items-center gap-3'>
              <Select
                items={[
                  { value: '__all__', label: t('All Vendors') },
                  ...vendors.map((v: { id: number; name: string }) => ({
                    value: String(v.id),
                    label: v.name,
                  })),
                ]}
                onValueChange={handleVendorChange}
                value={vendorId ? String(vendorId) : '__all__'}
              >
                <SelectTrigger className='w-[180px]'>
                  <SelectValue placeholder={t('All Vendors')} />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value='__all__'>{t('All Vendors')}</SelectItem>
                  <SelectGroup>
                    {vendors.map((v: { id: number; name: string }) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select
                items={[
                  { value: '__all__', label: t('All Groups') },
                  ...groups.map((g: string) => ({
                    value: g,
                    label: g,
                  })),
                ]}
                onValueChange={handleGroupChange}
                value={group || '__all__'}
              >
                <SelectTrigger className='w-[160px]'>
                  <SelectValue placeholder={t('All Groups')} />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value='__all__'>{t('All Groups')}</SelectItem>
                  <SelectGroup>
                    {groups.map((g: string) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <CompactDateTimeRangePicker
                start={startTime ? new Date(startTime) : undefined}
                end={endTime ? new Date(endTime) : undefined}
                onChange={handleTimeRangeChange}
                className='w-full sm:w-[340px]'
              />
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground whitespace-nowrap">{t('By')}</span>
                <select
                  value={timeField}
                  onChange={(e) => handleTimeFieldChange(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="model_end_time">{t('End Time')}</option>
                  <option value="model_start_time">{t('Start Time')}</option>
                </select>
              </div>
            </div>
          </section>

          {/* Content */}
          {leaderboardQuery.isLoading ? (
            <LeaderboardLoading />
          ) : !data ? (
            <LeaderboardError
              message={
                leaderboardQuery.error instanceof Error
                  ? leaderboardQuery.error.message
                  : t('Unable to load leaderboard data')
              }
            />
          ) : (
            <>
              <LeaderboardTable 
                items={data.list} 
                tpsBenchmark={data.tpsBenchmark} 
                ttftBenchmark={data.ttftBenchmark} 
                onRowClick={isAdmin ? handleOpenDetail : undefined}
                onModelClick={handleOpenPerfDetail}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={handleSortChange}
              />
              {totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}

{/* Model Detail Dialog (sampling records, for success rate column) */}
          <ModelDetailDialog
            open={detailDialogOpen}
            onOpenChange={handleCloseDetail}
            modelName={selectedModel || ''}
            startTime={startTime}
            endTime={endTime}
          />

          {/* Performance Detail Sheet (for model name column) */}
          <Sheet open={perfSheetOpen} onOpenChange={handleClosePerfDetail}>
            <SheetContent
              side='right'
              className='flex h-dvh w-full overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl'
            >
              <SheetHeader className='sr-only'>
                <SheetTitle>{perfModelName}</SheetTitle>
                <SheetDescription>{t('Model performance details')}</SheetDescription>
              </SheetHeader>
              <div className='flex-1 overflow-y-auto px-4 pt-11 pb-5 sm:px-6 sm:pt-12 sm:pb-6'>
                {perfModel && <ModelDetailsPerformance model={perfModel} startTime={startTime} endTime={endTime} group={group} timeField={timeField} />}
              </div>
            </SheetContent>
          </Sheet>
        </PageTransition>
      </div>
    </PublicLayout>
  )
}

function LeaderboardTable({
  items,
  tpsBenchmark,
  ttftBenchmark,
  onRowClick,
  onModelClick,
  sortBy = 'score',
  sortOrder = 'desc',
  onSortChange,
}: {
  items: LeaderboardItem[]
  tpsBenchmark: number
  ttftBenchmark: number
  onRowClick?: (modelName: string) => void
  onModelClick?: (modelName: string) => void
  sortBy?: SortBy
  sortOrder?: SortOrder
  onSortChange?: (sortBy: SortBy, sortOrder: SortOrder) => void
}) {
  const { t } = useTranslation()

  // Backend handles sorting; just re-assign ranks for display
  const sortedItems = useMemo(() => {
    return items.map((item, i) => ({ ...item, rank: i + 1 }))
  }, [items])

  const handleSort = (column: SortBy) => {
    if (!onSortChange) return
    if (sortBy === column) {
      onSortChange(column, sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      onSortChange(column, 'desc')
    }
  }

  if (items.length === 0) {
    return (
      <div className='bg-card rounded-xl border border-dashed px-6 py-12 text-center'>
        <h2 className='text-foreground text-base font-semibold'>
          {t('No Data Available')}
        </h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('No performance data available. Configure test channels and refresh samples first.')}
        </p>
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='bg-card overflow-hidden rounded-xl border'>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
          <thead>
            <tr className='border-b bg-muted/30'>
              <th className='px-4 py-3 text-left font-medium'>
                {t('Rank')}
              </th>
              <th className='px-4 py-3 text-left font-medium'>
                {t('Model')}
              </th>
              <th className='px-4 py-3 text-left font-medium'>
                {t('Vendor')}
              </th>
              <th className='px-4 py-3 text-right font-medium'>
                <button
                  type='button'
                  onClick={() => handleSort('tps')}
                  className='inline-flex items-center justify-end gap-1 cursor-pointer hover:text-foreground transition-colors'
                >
                  <MetricTooltip metric='tps'>
                    <Zap className='h-3.5 w-3.5' />
                    <span>{t('Avg TPS')}</span>
                  </MetricTooltip>
                  <span className='inline-flex w-3'>
                    {sortBy === 'tps' ? (
                      sortOrder === 'desc' ? <ArrowDown className='h-3 w-3' /> : <ArrowUp className='h-3 w-3' />
                    ) : (
                      <ChevronsUpDown className='h-3 w-3 opacity-30' />
                    )}
                  </span>
                </button>
              </th>
              <th className='px-4 py-3 text-right font-medium'>
                <button
                  type='button'
                  onClick={() => handleSort('ttft')}
                  className='inline-flex items-center justify-end gap-1 cursor-pointer hover:text-foreground transition-colors'
                >
                  <MetricTooltip metric='ttft'>
                    <Clock className='h-3.5 w-3.5' />
                    <span>{t('Avg TTFT')}</span>
                  </MetricTooltip>
                  <span className='inline-flex w-3'>
                    {sortBy === 'ttft' ? (
                      sortOrder === 'desc' ? <ArrowDown className='h-3 w-3' /> : <ArrowUp className='h-3 w-3' />
                    ) : (
                      <ChevronsUpDown className='h-3 w-3 opacity-30' />
                    )}
                  </span>
                </button>
              </th>
              <th className='px-4 py-3 text-right font-medium'>
                <div className='inline-flex items-center justify-end gap-1'>
                  <MetricTooltip metric='success_rate'>
                    <CheckCircle className='h-3.5 w-3.5' />
                    <span>{t('Success Rate')}</span>
                  </MetricTooltip>
                  <span className='inline-flex w-3' />
                </div>
              </th>
              <th className='px-4 py-3 text-right font-medium'>
                <button
                  type='button'
                  onClick={() => handleSort('score')}
                  className='inline-flex items-center justify-end gap-1 cursor-pointer hover:text-foreground transition-colors'
                >
                  <MetricTooltip metric='score'>
                    <BarChart3 className='h-3.5 w-3.5' />
                    <span>{t('Score')}</span>
                  </MetricTooltip>
                  <span className='inline-flex w-3'>
                    {sortBy === 'score' ? (
                      sortOrder === 'desc' ? <ArrowDown className='h-3 w-3' /> : <ArrowUp className='h-3 w-3' />
                    ) : (
                      <ChevronsUpDown className='h-3 w-3 opacity-30' />
                    )}
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr
                key={`${item.model_name}-${item.vendor_name}`}
                className='border-b last:border-0 hover:bg-muted/20 transition-colors'
              >
                <td className='px-4 py-3'>
                  <RankBadge rank={item.rank} />
                </td>
                <td className='px-4 py-3 font-medium'>
                  <button
                    type='button'
                    className='inline-flex items-center gap-1 cursor-pointer font-medium hover:underline'
                    onClick={() => onModelClick?.(item.model_name)}
                  >
                    {item.model_name}
                    <ChevronRight className='h-3.5 w-3.5 text-muted-foreground/50' />
                  </button>
                </td>
                <td className='text-muted-foreground px-4 py-3'>
                  {item.vendor_name}
                </td>
                <td className='px-4 py-3 text-right font-mono'>
                  <MetricValue
                    value={item.avg_tps}
                    benchmark={tpsBenchmark}
                    higherIsBetter
                    format={(v) => v.toFixed(1)}
                  />
                </td>
                <td className='px-4 py-3 text-right font-mono'>
                  <MetricValue
                    value={item.avg_ttft_ms}
                    benchmark={ttftBenchmark}
                    higherIsBetter={false}
                    format={(v) => `${v.toFixed(0)}ms`}
                  />
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono ${onRowClick ? 'cursor-pointer hover:bg-muted/40 transition-colors' : ''}`}
                  onClick={() => onRowClick?.(item.model_name)}
                >
                  {onRowClick ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className='inline-flex items-center gap-1'>
                          {item.success_rate.toFixed(1)}%
                          <FileText className='h-3 w-3 text-muted-foreground/50' />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('Click to view call details')}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span>{item.success_rate.toFixed(1)}%</span>
                  )}
                </td>
                <td className='px-4 py-3 text-right font-mono'>
                  <MetricValue
                    value={item.score}
                    benchmark={60}
                    higherIsBetter
                    isScore
                    format={(v) => v.toFixed(2)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 font-bold text-sm">
        1
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 font-bold text-sm">
        2
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/10 dark:text-amber-600 font-bold text-sm">
        3
      </span>
    )
  }
  return <span className="text-muted-foreground font-mono">{rank}</span>
}

function MetricValue({
  value,
  benchmark,
  higherIsBetter,
  isScore,
  format,
}: {
  value: number
  benchmark: number
  higherIsBetter: boolean
  isScore?: boolean
  format: (v: number) => string
}) {
  if (!benchmark) return <span>{format(value)}</span>
  
  const getColorClass = () => {
    if (isScore) {
      // Score: specific thresholds (80/60/40)
      if (value >= 80) return 'text-emerald-600 dark:text-emerald-400'
      if (value >= 60) return 'text-blue-600 dark:text-blue-400'
      if (value >= 40) return 'text-orange-600 dark:text-orange-400'
      return 'text-red-600 dark:text-red-400'
    }
    
    if (higherIsBetter) {
      // TPS: higher is better
      if (value >= benchmark) return 'text-emerald-600 dark:text-emerald-400'
      if (value >= benchmark * 0.7) return 'text-blue-600 dark:text-blue-400'
      if (value >= benchmark * 0.4) return 'text-orange-600 dark:text-orange-400'
      return 'text-red-600 dark:text-red-400'
    } else {
      // TTFT: lower is better
      if (value <= benchmark) return 'text-emerald-600 dark:text-emerald-400'
      if (value <= benchmark * 1.5) return 'text-blue-600 dark:text-blue-400'
      if (value <= benchmark * 3) return 'text-orange-600 dark:text-orange-400'
      return 'text-red-600 dark:text-red-400'
    }
  }
  
  return (
    <span className={`font-semibold ${getColorClass()}`}>
      {format(value)}
    </span>
  )
}

function ScoringRulesCard({
  tpsBenchmark,
  ttftBenchmark,
}: {
  tpsBenchmark: number
  ttftBenchmark: number
}) {
  const { t } = useTranslation()

  const scoreLevels = [
    { min: 80, color: 'bg-emerald-500', label: t('Excellent (≥80)') },
    { min: 60, color: 'bg-blue-500', label: t('Good (60-79)') },
    { min: 40, color: 'bg-orange-500', label: t('Average (40-59)') },
    { min: 0, color: 'bg-red-500', label: t('Poor (<40)') },
  ]

  const tpsLevels = [
    { threshold: `≥${tpsBenchmark}`, color: 'bg-emerald-500', label: t('Excellent') },
    { threshold: `≥${Math.round(tpsBenchmark * 0.7)}`, color: 'bg-blue-500', label: t('Good') },
    { threshold: `≥${Math.round(tpsBenchmark * 0.4)}`, color: 'bg-orange-500', label: t('Average') },
    { threshold: `<${Math.round(tpsBenchmark * 0.4)}`, color: 'bg-red-500', label: t('Poor') },
  ]

  const ttftLevels = [
    { threshold: `≤${ttftBenchmark}ms`, color: 'bg-emerald-500', label: t('Excellent') },
    { threshold: `≤${Math.round(ttftBenchmark * 1.5)}ms`, color: 'bg-blue-500', label: t('Good') },
    { threshold: `≤${Math.round(ttftBenchmark * 3)}ms`, color: 'bg-orange-500', label: t('Average') },
    { threshold: `>${Math.round(ttftBenchmark * 3)}ms`, color: 'bg-red-500', label: t('Poor') },
  ]

  const successRateLevels = [
    { threshold: '≥95%', color: 'bg-emerald-500', label: t('Excellent') },
    { threshold: '≥80%', color: 'bg-blue-500', label: t('Good') },
    { threshold: '≥50%', color: 'bg-orange-500', label: t('Average') },
    { threshold: '<50%', color: 'bg-red-500', label: t('Poor') },
  ]

  return (
    <div className='bg-card/60 rounded-xl border p-4 shadow-sm'>
      <div className='mb-3 flex items-center gap-2'>
        <BarChart3 className='text-muted-foreground/70 h-4 w-4' />
        <h3 className='text-sm font-semibold'>{t('Scoring Rules')}</h3>
        <span className='text-muted-foreground/60 text-xs'>
          {t('Data from live traffic sampling')}
        </span>
      </div>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {/* Score */}
        <div className='space-y-2'>
          <div className='text-muted-foreground text-xs font-medium'>
            {t('Score')} (0-100)
          </div>
          <div className='text-muted-foreground/70 text-xs'>
            {t('TPS × 40% + TTFT × 30% + Success Rate × 30%')}
          </div>
          <div className='space-y-1.5'>
            {scoreLevels.map((level) => (
              <div key={level.min} className='flex items-center gap-2 text-xs'>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${level.color}`} />
                <span className='text-muted-foreground'>{level.label}</span>
              </div>
            ))}
          </div>
        </div>
        {/* TPS */}
        <div className='space-y-2'>
          <div className='text-muted-foreground text-xs font-medium'>
            TPS ({t('Tokens Per Second')}) — {t('Higher is better')}
          </div>
          <div className='space-y-1.5'>
            {tpsLevels.map((level, idx) => (
              <div key={idx} className='flex items-center gap-2 text-xs'>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${level.color}`} />
                <span className='text-muted-foreground'>
                  {level.threshold} — {level.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        {/* TTFT */}
        <div className='space-y-2'>
          <div className='text-muted-foreground text-xs font-medium'>
            TTFT ({t('Time To First Token')}) — {t('Lower is better')}
          </div>
          <div className='space-y-1.5'>
            {ttftLevels.map((level, idx) => (
              <div key={idx} className='flex items-center gap-2 text-xs'>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${level.color}`} />
                <span className='text-muted-foreground'>
                  {level.threshold} — {level.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        {/* Success Rate */}
        <div className='space-y-2'>
          <div className='text-muted-foreground text-xs font-medium'>
            {t('Success Rate')} — {t('Higher is better')}
          </div>
          <div className='space-y-1.5'>
            {successRateLevels.map((level, idx) => (
              <div key={idx} className='flex items-center gap-2 text-xs'>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${level.color}`} />
                <span className='text-muted-foreground'>
                  {level.threshold} — {level.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation()

  return (
    <div className='flex items-center justify-center gap-2'>
      <Button
        variant='outline'
        size='sm'
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t('Previous')}
      </Button>
      <span className='text-muted-foreground text-sm'>
        {page} / {totalPages}
      </span>
      <Button
        variant='outline'
        size='sm'
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t('Next')}
      </Button>
    </div>
  )
}

function LeaderboardLoading() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-[400px] w-full rounded-xl' />
    </div>
  )
}

function LeaderboardError(props: { message: string }) {
  const { t } = useTranslation()
  return (
    <div className='bg-card rounded-xl border border-dashed px-6 py-12 text-center'>
      <h2 className='text-foreground text-base font-semibold'>
        {t('Unable to load leaderboard')}
      </h2>
      <p className='text-muted-foreground mx-auto mt-2 max-w-md text-sm'>
        {props.message}
      </p>
    </div>
  )
}
