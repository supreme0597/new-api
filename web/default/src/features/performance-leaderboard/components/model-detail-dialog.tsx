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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import dayjs from '@/lib/dayjs'
import { toast } from 'sonner'
import { getAllLogs } from '@/features/usage-logs/api'
import { useCommonLogsColumns } from '@/features/usage-logs/components/columns/common-logs-columns'
import {
  UsageLogsProvider,
  useUsageLogsContext,
} from '@/features/usage-logs/components/usage-logs-provider'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTablePagination } from '@/components/data-table'

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
// Table Content (must be inside UsageLogsProvider)
// ---------------------------------------------------------------------------

function LogTableContent({
  modelName,
  startTime,
  endTime,
}: {
  modelName: string
  startTime?: number
  endTime?: number
}) {
  const { t } = useTranslation()
  const columns = useCommonLogsColumns(true)

  const now = useMemo(() => dayjs(), [])
  const defaultStart = useMemo(
    () => (startTime ? new Date(startTime) : dayjs().subtract(24, 'hour').toDate()),
    [startTime]
  )
  const defaultEnd = useMemo(
    () => (endTime ? new Date(endTime) : now.toDate()),
    [endTime]
  )

  const [start, setStart] = useState<Date | undefined>(defaultStart)
  const [end, setEnd] = useState<Date | undefined>(defaultEnd)

  const [appliedStart, setAppliedStart] = useState(start)
  const [appliedEnd, setAppliedEnd] = useState(end)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const handleQuery = useCallback(() => {
    setAppliedStart(start)
    setAppliedEnd(end)
    setPage(1)
  }, [start, end])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleQuery()
    },
    [handleQuery]
  )

  useEffect(() => {
    setPage(1)
  }, [appliedStart, appliedEnd])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'model-detail-logs',
      modelName,
      appliedStart,
      appliedEnd,
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
        start_timestamp: Math.floor(appliedStart.getTime() / 1000),
        end_timestamp: Math.floor(appliedEnd.getTime() / 1000),
        model_name: modelName,
        exact_model: 1,
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
    <div className='flex flex-col flex-1 min-h-0'>
      {/* Filter bar – fixed height */}
      <div className='flex-shrink-0 px-6 pt-6 pb-3 flex flex-wrap items-end gap-2'>
        <div className='flex flex-col gap-1'>
          <label className='text-xs text-muted-foreground'>
            {t('Start')}
          </label>
          <Input
            type='datetime-local'
            className='w-[200px]'
            value={toInputValue(start)}
            onChange={(e) => setStart(fromInputValue(e.target.value))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-xs text-muted-foreground'>{t('End')}</label>
          <Input
            type='datetime-local'
            className='w-[200px]'
            value={toInputValue(end)}
            onChange={(e) => setEnd(fromInputValue(e.target.value))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button size='sm' onClick={handleQuery}>
          {t('Query')}
        </Button>
      </div>

      {/* Table – scrollable middle */}
      <div className='flex-1 min-h-0 overflow-auto px-6'>
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
      </div>

      {/* Pagination – fixed height */}
      <div className='flex-shrink-0 px-6 pt-3 pb-6 border-t border-border/50'>
        <DataTablePagination table={table} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

type ModelDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelName: string
  startTime?: number
  endTime?: number
}

export function ModelDetailDialog({
  open,
  onOpenChange,
  modelName,
  startTime,
  endTime,
}: ModelDetailDialogProps) {
  const { t } = useTranslation()

  const timeRangeLabel = useMemo(() => {
    if (startTime && endTime) {
      const fmt = 'YYYY-MM-DD HH:mm'
      return `${dayjs(startTime).format(fmt)} ~ ${dayjs(endTime).format(fmt)}`
    }
    return t('No time filter')
  }, [startTime, endTime, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex flex-col overflow-hidden sm:max-w-6xl max-h-[85vh] p-0 gap-0'>
        <DialogHeader className='px-6 pt-6 pb-4 border-b'>
          <DialogTitle className='flex items-center gap-2 text-lg'>
            <Server className='h-5 w-5 text-muted-foreground' />
            {modelName}
          </DialogTitle>
          <DialogDescription className='text-sm flex items-center gap-1'>
            <span className='font-medium'>{t('Time Range')}:</span>
            <span className='font-mono text-xs'>{timeRangeLabel}</span>
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col flex-1 min-h-0'>
          <UsageLogsProvider>
            <LogTableContent modelName={modelName} startTime={startTime} endTime={endTime} />
          </UsageLogsProvider>
        </div>
      </DialogContent>
    </Dialog>
  )
}
