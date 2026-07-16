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
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Loader2 } from 'lucide-react'
import { getChannelFlowPoolDistribution } from '../api'
import { channelFlowQueryKeys } from '../lib'
import type {
  ChannelFlowPool,
  ChannelFlowPoolBinding,
  LogDistributionUser,
} from '../types'

const PIE_COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(160, 84%, 39%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(262, 83%, 58%)',
  'hsl(220, 9%, 46%)',
  'hsl(346, 77%, 50%)',
  'hsl(199, 89%, 48%)',
  'hsl(48, 96%, 53%)',
  'hsl(280, 65%, 60%)',
]

const LIMIT_OPTIONS = [10, 20, 50, 100]

type Props = {
  pool: ChannelFlowPool
  bindings: ChannelFlowPoolBinding[]
}

function formatMs(ms: number): string {
  if (ms <= 0) return '-'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatTps(tps: number): string {
  if (tps <= 0) return '-'
  return `${tps.toFixed(1)} tok/s`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function toLocalDatetime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalDatetime(s: string): number {
  if (!s) return 0
  return new Date(s).getTime()
}

export function RequestDistributionTab({ pool, bindings }: Props) {
  const { t } = useTranslation()

  // Filters
  const [startTs, setStartTs] = useState(() => Date.now() - 24 * 60 * 60 * 1000)
  const [endTs, setEndTs] = useState(() => Date.now())
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [limit, setLimit] = useState(20)

  // Get unique models from bindings
  const boundModels = useMemo(() => {
    const models = new Set<string>()
    for (const b of bindings) {
      if (b.upstream_model) models.add(b.upstream_model)
    }
    return Array.from(models).sort()
  }, [bindings])

  // Fetch distribution data
  const distributionParams = useMemo(
    () => ({
      start_timestamp: startTs || undefined,
      end_timestamp: endTs || undefined,
      model_name: selectedModel || undefined,
      group: selectedGroup || undefined,
      limit,
    }),
    [startTs, endTs, selectedModel, selectedGroup, limit]
  )

  const { data, isLoading, error } = useQuery({
    queryKey: channelFlowQueryKeys.distribution(pool.id, distributionParams),
    queryFn: () => getChannelFlowPoolDistribution(pool.id, distributionParams),
    select: (res) => (res.success ? res.data : null),
  })

  const totalRequests = data?.total_requests ?? 0
  const activeUsers = data?.active_users ?? 0
  const avgTTFT = data?.avg_ttft_ms ?? 0
  const avgTPS = data?.avg_tps ?? 0
  const users = useMemo(
    () => (data?.users ?? []) as LogDistributionUser[],
    [data?.users]
  )

  // Pie chart data
  const pieData = useMemo(() => {
    return users.map((u) => ({
      name: u.username || t('Anonymous'),
      value: u.request_count,
    }))
  }, [users, t])

  // Total for percentage calculation
  const pieTotal = useMemo(
    () => pieData.reduce((sum, d) => sum + d.value, 0),
    [pieData]
  )

  return (
    <div className='space-y-4'>
      {/* Filters */}
      <div className='bg-muted/40 flex flex-wrap items-end gap-4 rounded-lg border p-4'>
        <div className='flex flex-col gap-1'>
          <label className='text-muted-foreground text-xs font-medium'>
            {t('Start Time')}
          </label>
          <input
            type='datetime-local'
            className='bg-background rounded-md border px-3 py-1.5 text-sm'
            value={toLocalDatetime(startTs)}
            onChange={(e) => setStartTs(fromLocalDatetime(e.target.value))}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-muted-foreground text-xs font-medium'>
            {t('End Time')}
          </label>
          <input
            type='datetime-local'
            className='bg-background rounded-md border px-3 py-1.5 text-sm'
            value={toLocalDatetime(endTs)}
            onChange={(e) => setEndTs(fromLocalDatetime(e.target.value))}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-muted-foreground text-xs font-medium'>
            {t('Model')}
          </label>
          <select
            className='bg-background rounded-md border px-3 py-1.5 text-sm'
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value=''>{t('All')}</option>
            {boundModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-muted-foreground text-xs font-medium'>
            {t('Group')}
          </label>
          <select
            className='bg-background rounded-md border px-3 py-1.5 text-sm'
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
          >
            <option value=''>{t('All')}</option>
          </select>
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-muted-foreground text-xs font-medium'>
            {t('Limit')}
          </label>
          <select
            className='bg-background rounded-md border px-3 py-1.5 text-sm'
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className='flex items-center justify-center py-12'>
          <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
        </div>
      )}
      {error && (
        <div className='text-destructive bg-destructive/10 rounded-md px-4 py-3 text-sm'>
          {error.message || 'Failed to load data'}
        </div>
      )}

      {/* Stats Cards */}
      {!isLoading && !error && (
        <>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            <MetricCard
              label={t('Total Requests')}
              value={formatCount(totalRequests)}
            />
            <MetricCard
              label={t('Active Users')}
              value={formatCount(activeUsers)}
            />
            <MetricCard
              label={t('Avg TTFT')}
              value={formatMs(avgTTFT)}
            />
            <MetricCard
              label={t('Avg TPS')}
              value={formatTps(avgTPS)}
            />
          </div>

          {/* Chart + Legend */}
          <div className='grid gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(520px,1.28fr)]'>
            {/* Pie Chart */}
            <div className='flex flex-col items-center rounded-lg border p-4'>
              <h4 className='mb-3 text-sm font-semibold'>
                {t('Request Distribution')}
              </h4>
              {pieData.length > 0 ? (
                <ResponsiveContainer width='100%' height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx='50%'
                      cy='50%'
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey='value'
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${value} ${t('requests')}`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className='text-muted-foreground flex h-60 items-center justify-center text-sm'>
                  {t('No data')}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className='rounded-lg border p-4'>
              <h4 className='mb-3 text-sm font-semibold'>
                {t('User Breakdown')}
              </h4>
              <div className='flex flex-col gap-2'>
                {users.map((u, i) => {
                  const pct = pieTotal > 0 ? (u.request_count / pieTotal) * 100 : 0
                  return (
                    <div
                      key={u.username}
                      className='bg-muted/50 flex items-center gap-2 rounded-md px-3 py-2'
                    >
                      <span
                        className='inline-block h-2.5 w-2.5 shrink-0 rounded-sm'
                        style={{
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                      <span className='min-w-0 flex-1 truncate text-sm'>
                        {u.username || t('Anonymous')}
                      </span>
                      <span className='text-foreground text-sm font-medium'>
                        {formatCount(u.request_count)}
                      </span>
                      <span className='text-muted-foreground min-w-[50px] text-right text-sm'>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
                {users.length === 0 && (
                  <div className='text-muted-foreground py-8 text-center text-sm'>
                    {t('No data')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className='overflow-hidden rounded-lg border'>
            <div className='bg-muted flex items-center justify-between border-b px-4 py-2.5'>
              <span className='text-sm font-semibold'>
                {t('User Details')}
              </span>
              <span className='text-muted-foreground text-xs'>
                {users.length} {t('users')}
              </span>
            </div>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='bg-muted border-b'>
                    <th className='text-muted-foreground px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider'>
                      {t('Rank')}
                    </th>
                    <th className='text-muted-foreground px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider'>
                      {t('Username')}
                    </th>
                    <th className='text-muted-foreground px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider'>
                      {t('Requests')}
                    </th>
                    <th className='text-muted-foreground px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider'>
                      {t('Share')}
                    </th>
                    <th className='text-muted-foreground px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider'>
                      {t('Avg TTFT')}
                    </th>
                    <th className='text-muted-foreground px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider'>
                      {t('Avg TPS')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => {
                    const pct =
                      pieTotal > 0 ? (u.request_count / pieTotal) * 100 : 0
                    return (
                      <tr key={u.username} className='border-b last:border-b-0'>
                        <td className='px-4 py-2.5'>{i + 1}</td>
                        <td className='px-4 py-2.5 font-medium'>
                          {u.username || t('Anonymous')}
                        </td>
                        <td className='px-4 py-2.5 text-right'>
                          {formatCount(u.request_count)}
                        </td>
                        <td className='px-4 py-2.5 text-right'>
                          {pct.toFixed(1)}%
                        </td>
                        <td className='px-4 py-2.5 text-right'>
                          {formatMs(u.avg_ttft_ms)}
                        </td>
                        <td className='px-4 py-2.5 text-right'>
                          {formatTps(u.avg_tps)}
                        </td>
                      </tr>
                    )
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className='text-muted-foreground px-4 py-8 text-center'
                      >
                        {t('No data')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-lg border p-3'>
      <div className='text-muted-foreground mb-1 text-xs'>{label}</div>
      <div className='text-lg font-semibold'>{value}</div>
    </div>
  )
}
