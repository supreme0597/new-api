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
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
  Clock,
  Server,
  BarChart3,
  Calendar,
} from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ModelPerformanceDetail } from '../types'

type ModelDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelName: string
  data?: ModelPerformanceDetail
  isLoading: boolean
  hours: number
}

function StatCard({
  icon: Icon,
  label,
  value,
  className = '',
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-muted/50 rounded-lg p-3 ${className}`}>
      <div className='flex items-center gap-2 text-muted-foreground mb-1'>
        <Icon className='h-4 w-4' />
        <span className='text-xs font-medium'>{label}</span>
      </div>
      <div className='text-lg font-semibold'>{value}</div>
    </div>
  )
}

function StatusBadge({ successRate }: { successRate: number }) {
  if (successRate >= 95) {
    return (
      <Badge variant='default' className='bg-emerald-500 hover:bg-emerald-600'>
        <CheckCircle2 className='h-3 w-3 mr-1' />
        {successRate.toFixed(1)}%
      </Badge>
    )
  }
  if (successRate >= 80) {
    return (
      <Badge variant='default' className='bg-amber-500 hover:bg-amber-600'>
        <Activity className='h-3 w-3 mr-1' />
        {successRate.toFixed(1)}%
      </Badge>
    )
  }
  return (
    <Badge variant='destructive'>
      <XCircle className='h-3 w-3 mr-1' />
      {successRate.toFixed(1)}%
    </Badge>
  )
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ModelDetailDialog({
  open,
  onOpenChange,
  modelName,
  data,
  isLoading,
  hours,
}: ModelDetailDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex flex-col overflow-hidden sm:max-w-6xl max-h-[85vh] p-0 gap-0'>
        <DialogHeader className='px-6 pt-6 pb-4 border-b'>
          <DialogTitle className='flex items-center gap-2 text-lg'>
            <Server className='h-5 w-5 text-muted-foreground' />
            {modelName}
          </DialogTitle>
          <DialogDescription className='text-sm'>
            {t('Performance details for the last {{hours}} hours', { hours })}
          </DialogDescription>
        </DialogHeader>

        <div className='p-6 space-y-6'>
          {isLoading ? (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className='h-20' />
                ))}
              </div>
              <Skeleton className='h-40' />
            </div>
          ) : data ? (
            <>
              {/* Overview Stats */}
              <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
                <StatCard
                  icon={Activity}
                  label={t('Total Requests')}
                  value={data.total_requests.toLocaleString()}
                />
                <StatCard
                  icon={CheckCircle2}
                  label={t('Success')}
                  value={data.total_success.toLocaleString()}
                  className='bg-emerald-50 dark:bg-emerald-950/30'
                />
                <StatCard
                  icon={XCircle}
                  label={t('Failed')}
                  value={data.total_failed.toLocaleString()}
                  className='bg-red-50 dark:bg-red-950/30'
                />
                <StatCard
                  icon={BarChart3}
                  label={t('Success Rate')}
                  value={
                    <StatusBadge
                      successRate={data.overall_success_rate}
                    />
                  }
                />
              </div>

              {/* Performance Stats */}
              <div className='grid grid-cols-2 gap-3'>
                <StatCard
                  icon={Zap}
                  label={t('Average TPS')}
                  value={data.avg_tps.toFixed(2)}
                />
                <StatCard
                  icon={Clock}
                  label={t('Average TTFT')}
                  value={`${data.avg_ttft_ms}ms`}
                />
              </div>

              {/* Records Table */}
              <div className='border rounded-lg overflow-hidden'>
                <div className='bg-muted/50 px-4 py-2 border-b flex items-center justify-between'>
                  <span className='text-sm font-medium flex items-center gap-2'>
                    <Calendar className='h-4 w-4' />
                    {t('Detailed Records')}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {data.records.length} {t('time buckets')}
                  </span>
                </div>
                <ScrollArea className='h-[280px]'>
                  <Table>
                    <TableHeader className='sticky top-0 bg-card z-10'>
                      <TableRow>
                        <TableHead className='w-[100px]'>
                          {t('Time')}
                        </TableHead>
                        <TableHead>{t('Group')}</TableHead>
                        <TableHead className='text-right'>
                          {t('Requests')}
                        </TableHead>
                        <TableHead className='text-right'>
                          {t('Success Rate')}
                        </TableHead>
                        <TableHead className='text-right'>{t('TPS')}</TableHead>
                        <TableHead className='text-right'>
                          {t('TTFT')}
                        </TableHead>
                        <TableHead className='text-right'>
                          {t('Latency')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.records.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className='text-center py-8 text-muted-foreground'
                          >
                            {t('No records available')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.records.map((record, idx) => (
                          <TableRow key={idx}>
                            <TableCell className='text-xs font-mono'>
                              {formatTimestamp(record.bucket_ts)}
                            </TableCell>
                            <TableCell>
                              <Badge variant='secondary' className='text-xs'>
                                {record.group}
                              </Badge>
                            </TableCell>
                            <TableCell className='text-right font-mono'>
                              {record.request_count}
                            </TableCell>
                            <TableCell className='text-right'>
                              <StatusBadge successRate={record.success_rate} />
                            </TableCell>
                            <TableCell className='text-right font-mono'>
                              {record.avg_tps.toFixed(1)}
                            </TableCell>
                            <TableCell className='text-right font-mono text-xs'>
                              {record.avg_ttft_ms}ms
                            </TableCell>
                            <TableCell className='text-right font-mono text-xs'>
                              {record.avg_latency_ms}ms
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              {/* Vendor Info */}
              <div className='text-xs text-muted-foreground flex items-center justify-between pt-2 border-t'>
                <span>
                  {t('Vendor')}:{' '}
                  <span className='font-medium text-foreground'>
                    {data.vendor_name}
                  </span>
                </span>
                <span>
                  {t('Time Range')}: {formatTimestamp(data.time_range.start_ts)}{' '}
                  - {formatTimestamp(data.time_range.end_ts)}
                </span>
              </div>
            </>
          ) : (
            <div className='text-center py-12 text-muted-foreground'>
              {t('Failed to load detail data')}
            </div>
          )}
        </div>

        <div className='px-6 py-4 border-t bg-muted/30 flex justify-end'>
          <Button onClick={() => onOpenChange(false)}>{t('Close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
