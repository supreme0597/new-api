import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import dayjs from '@/lib/dayjs'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getAllLogs } from '@/features/usage-logs/api'
import { useCommonLogsColumns } from '@/features/usage-logs/components/columns/common-logs-columns'
import {
  UsageLogsProvider,
  useUsageLogsContext,
} from '@/features/usage-logs/components/usage-logs-provider'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
// Filter Bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  start: Date | undefined
  end: Date | undefined
  onStartChange: (d: Date | undefined) => void
  onEndChange: (d: Date | undefined) => void
  model: string
  onModelChange: (v: string) => void
  onQuery: () => void
}

function SamplingFilterBar({
  start,
  end,
  onStartChange,
  onEndChange,
  model,
  onModelChange,
  onQuery,
}: FilterBarProps) {
  const { t } = useTranslation()

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onQuery()
      }
    },
    [onQuery]
  )

  return (
    <div className='flex flex-wrap items-end gap-2'>
      <div className='flex flex-col gap-1'>
        <label className='text-xs text-muted-foreground'>{t('Start')}</label>
        <Input
          type='datetime-local'
          className='w-[200px]'
          value={toInputValue(start)}
          onChange={(e) => onStartChange(fromInputValue(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className='flex flex-col gap-1'>
        <label className='text-xs text-muted-foreground'>{t('End')}</label>
        <Input
          type='datetime-local'
          className='w-[200px]'
          value={toInputValue(end)}
          onChange={(e) => onEndChange(fromInputValue(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className='flex flex-col gap-1'>
        <label className='text-xs text-muted-foreground'>{t('Model')}</label>
        <Input
          className='w-[200px]'
          placeholder={t('Filter by model')}
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <Button size='sm' onClick={onQuery}>
        {t('Query')}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table Content (must be inside UsageLogsProvider)
// ---------------------------------------------------------------------------

function SamplingLogsTableContent() {
  const { t } = useTranslation()
  const columns = useCommonLogsColumns(false)
  const { sensitiveVisible } = useUsageLogsContext()

  const now = useMemo(() => dayjs(), [])
  const [start, setStart] = useState<Date | undefined>(
    now.subtract(24, 'hour').toDate()
  )
  const [end, setEnd] = useState<Date | undefined>(now.toDate())
  const [modelName, setModelName] = useState('')

  const [appliedStart, setAppliedStart] = useState(start)
  const [appliedEnd, setAppliedEnd] = useState(end)
  const [appliedModel, setAppliedModel] = useState(modelName)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const handleQuery = useCallback(() => {
    setAppliedStart(start)
    setAppliedEnd(end)
    setAppliedModel(modelName)
    setPage(1)
  }, [start, end, modelName])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [appliedStart, appliedEnd, appliedModel])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'sampling-logs',
      appliedStart,
      appliedEnd,
      appliedModel,
      page,
      pageSize,
    ],
    queryFn: async () => {
      if (!appliedStart || !appliedEnd) {
        return { success: false, data: { items: [], total: 0 } }
      }
      const res = await getAllLogs({
        p: page,
        page_size: pageSize,
        start_time: Math.floor(appliedStart.getTime() / 1000),
        end_time: Math.floor(appliedEnd.getTime() / 1000),
        model_name: appliedModel || undefined,
        token_name: '模型测试',
      })
      if (!res?.success) {
        toast.error(res?.message || t('Failed to load records'))
        return { success: false, data: { items: [], total: 0 } }
      }
      return res
    },
    placeholderData: (prev) => prev,
  })

  const rows: UsageLog[] = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  const table = useReactTable({
    data: useMemo(() => rows, [rows]),
    columns,
    pageCount: Math.ceil(total / pageSize),
    state: {
      pagination: { pageIndex: page - 1, pageSize },
    },
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

  return (
    <div className='space-y-4'>
      <SamplingFilterBar
        start={start}
        end={end}
        onStartChange={setStart}
        onEndChange={setEnd}
        model={modelName}
        onModelChange={setModelName}
        onQuery={handleQuery}
      />

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
            {isLoading || isFetching ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center'
                >
                  {t('Loading')}...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center'
                >
                  {t('No results')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

export function SamplingLogsSection() {
  return (
    <UsageLogsProvider>
      <SamplingLogsTableContent />
    </UsageLogsProvider>
  )
}
