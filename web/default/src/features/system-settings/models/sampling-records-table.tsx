import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'
import { getPerfMetricsList } from '@/features/performance-metrics/api'
import type { PerfMetricRow } from '@/features/performance-metrics/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table/pagination'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toInputValue(date?: Date): string {
  return date ? dayjs(date).format('YYYY-MM-DDTHH:mm') : ''
}

function fromInputValue(value: string): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SamplingRecordsTable() {
  const { t } = useTranslation()

  // ---- Filter state ----
  const now = useMemo(() => dayjs(), [])
  const [start, setStart] = useState<Date | undefined>(
    now.subtract(24, 'hour').toDate()
  )
  const [end, setEnd] = useState<Date | undefined>(now.toDate())
  const [modelName, setModelName] = useState('')

  // Applied filters (only trigger fetch on "Query" click)
  const [appliedStart, setAppliedStart] = useState(start)
  const [appliedEnd, setAppliedEnd] = useState(end)
  const [appliedModel, setAppliedModel] = useState(modelName)

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // ---- Date picker state ----
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [draftStart, setDraftStart] = useState(toInputValue(start))
  const [draftEnd, setDraftEnd] = useState(toInputValue(end))

  const handleDatePickerOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setDraftStart(toInputValue(start))
        setDraftEnd(toInputValue(end))
      }
      setDatePickerOpen(nextOpen)
    },
    [start, end]
  )

  const applyDraft = useCallback(() => {
    const s = fromInputValue(draftStart)
    const e = fromInputValue(draftEnd)
    setStart(s)
    setEnd(e)
    setDatePickerOpen(false)
  }, [draftStart, draftEnd])

  const applyPreset = useCallback(
    (kind: '24h' | '7d' | '30d') => {
      const now = dayjs()
      const presets = {
        '24h': {
          start: now.subtract(24, 'hour').toDate(),
          end: now.toDate(),
        },
        '7d': {
          start: now.subtract(6, 'day').startOf('day').toDate(),
          end: now.endOf('day').toDate(),
        },
        '30d': {
          start: now.subtract(29, 'day').startOf('day').toDate(),
          end: now.endOf('day').toDate(),
        },
      }
      const range = presets[kind]
      setStart(range.start)
      setEnd(range.end)
      setDraftStart(toInputValue(range.start))
      setDraftEnd(toInputValue(range.end))
      setDatePickerOpen(false)
    },
    []
  )

  const dateLabel = useMemo(() => {
    if (!start && !end) return t('Date Range')
    const s = start ? dayjs(start).format('YYYY-MM-DD HH:mm') : '-'
    const e = end ? dayjs(end).format('YYYY-MM-DD HH:mm') : '-'
    return `${s} ~ ${e}`
  }, [end, start, t])

  // ---- Fetch data ----
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'sampling-records',
      appliedStart,
      appliedEnd,
      appliedModel,
      page,
      pageSize,
    ],
    queryFn: async () => {
      if (!appliedStart || !appliedEnd) {
        return { success: false, data: { list: [], total: 0, page: 1, page_size: pageSize } }
      }
      const res = await getPerfMetricsList({
        start_timestamp: Math.floor(appliedStart.getTime() / 1000),
        end_timestamp: Math.floor(appliedEnd.getTime() / 1000),
        model: appliedModel || undefined,
        page,
        page_size: pageSize,
      })
      if (!res?.success) {
        toast.error(res?.message || t('Failed to load records'))
        return { success: false, data: { list: [], total: 0, page: 1, page_size: pageSize } }
      }
      return res
    },
    placeholderData: (prev) => prev,
  })

  const rows: PerfMetricRow[] = data?.data?.list ?? []
  const total = data?.data?.total ?? 0

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [appliedStart, appliedEnd, appliedModel])

  // ---- Handle query button ----
  const handleQuery = useCallback(() => {
    setAppliedStart(start)
    setAppliedEnd(end)
    setAppliedModel(modelName)
  }, [start, end, modelName])

  // ---- Table columns ----
  const columns = useMemo<ColumnDef<PerfMetricRow>[]>(
    () => [
      {
        accessorKey: 'bucket_ts',
        header: t('Time'),
        cell: ({ row }) => (
          <span className='text-xs'>
            {dayjs(row.original.bucket_ts * 1000).format(
              'YYYY-MM-DD HH:mm'
            )}
          </span>
        ),
      },
      {
        accessorKey: 'model_name',
        header: t('Model'),
        cell: ({ row }) => (
          <span className='text-xs font-medium'>
            {row.original.model_name}
          </span>
        ),
      },
      {
        accessorKey: 'group',
        header: t('Group'),
        cell: ({ row }) => (
          <span className='text-xs'>{row.original.group || '-'}</span>
        ),
      },
      {
        accessorKey: 'request_count',
        header: t('Requests'),
        cell: ({ row }) => (
          <span className='text-xs'>{row.original.request_count}</span>
        ),
      },
      {
        accessorKey: 'success_count',
        header: t('Success'),
        cell: ({ row }) => {
          const r = row.original
          const rate =
            r.request_count > 0
              ? ((r.success_count / r.request_count) * 100).toFixed(1)
              : '0.0'
          return (
            <span className='text-xs'>
              {r.success_count}{' '}
              <span className='text-muted-foreground'>({rate}%)</span>
            </span>
          )
        },
      },
      {
        accessorKey: 'total_latency_ms',
        header: t('Avg Latency'),
        cell: ({ row }) => {
          const r = row.original
          const avg =
            r.request_count > 0
              ? Math.round(r.total_latency_ms / r.request_count)
              : 0
          return <span className='text-xs'>{avg}ms</span>
        },
      },
      {
        accessorKey: 'output_tokens',
        header: t('Avg TPS'),
        cell: ({ row }) => {
          const r = row.original
          const tps =
            r.generation_ms > 0
              ? (
                  r.output_tokens /
                  (r.generation_ms / 1000)
                ).toFixed(1)
              : '0.0'
          return <span className='text-xs'>{tps}</span>
        },
      },
      {
        accessorKey: 'ttft_sum_ms',
        header: t('Avg TTFT'),
        cell: ({ row }) => {
          const r = row.original
          const ttft =
            r.ttft_count > 0
              ? Math.round(r.ttft_sum_ms / r.ttft_count)
              : 0
          return <span className='text-xs'>{ttft}ms</span>
        },
      },
    ],
    [t]
  )

  // ---- Table instance ----
  const table = useReactTable({
    data: rows,
    columns,
    pageCount: Math.ceil(total / pageSize),
    state: { pagination: { pageIndex: page - 1, pageSize } },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex: page - 1, pageSize })
          : updater
      setPage(next.pageIndex + 1)
      setPageSize(next.pageSize)
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
  })

  // ---- Render ----
  return (
    <div className='space-y-3'>
      {/* Filter bar */}
      <div className='flex flex-wrap items-center gap-2'>
        {/* Date range picker */}
        <Popover open={datePickerOpen} onOpenChange={handleDatePickerOpenChange}>
          <PopoverTrigger
            render={
              <Button
                type='button'
                variant='outline'
                className={cn(
                  'w-full justify-start gap-2 px-2.5 font-mono text-xs font-normal sm:w-auto',
                  !start && !end && 'text-muted-foreground'
                )}
              />
            }
          >
            <CalendarDays className='size-3.5 shrink-0' />
            <span className='truncate'>{dateLabel}</span>
          </PopoverTrigger>
          <PopoverContent className='w-auto p-3' align='start'>
            <div className='space-y-3'>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => applyPreset('24h')}
                >
                  {t('Last 24h')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => applyPreset('7d')}
                >
                  {t('Last 7 days')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => applyPreset('30d')}
                >
                  {t('Last 30 days')}
                </Button>
              </div>
              <div className='grid gap-2'>
                <div className='grid gap-1.5'>
                  <span className='text-muted-foreground text-xs'>
                    {t('Start')}
                  </span>
                  <input
                    type='datetime-local'
                    value={draftStart}
                    onChange={(e) => setDraftStart(e.target.value)}
                    className='border-input bg-background text-foreground rounded-md border px-2 py-1 text-xs'
                  />
                </div>
                <div className='grid gap-1.5'>
                  <span className='text-muted-foreground text-xs'>
                    {t('End')}
                  </span>
                  <input
                    type='datetime-local'
                    value={draftEnd}
                    onChange={(e) => setDraftEnd(e.target.value)}
                    className='border-input bg-background text-foreground rounded-md border px-2 py-1 text-xs'
                  />
                </div>
              </div>
              <Button
                type='button'
                size='sm'
                className='w-full'
                onClick={applyDraft}
              >
                {t('Apply')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Model name filter */}
        <Input
          placeholder={t('Filter by model...')}
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleQuery()
          }}
          className='h-8 w-full sm:w-48'
        />

        {/* Query button */}
        <Button type='button' size='sm' onClick={handleQuery}>
          {t('Query')}
        </Button>
      </div>

      {/* Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className='text-xs'>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center text-sm'
                >
                  {t('Loading...')}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center text-sm'
                >
                  {t('No results')}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <DataTablePagination table={table} />
      )}
    </div>
  )
}
