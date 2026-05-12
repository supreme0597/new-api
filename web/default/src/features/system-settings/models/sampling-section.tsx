import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import dayjs from '@/lib/dayjs'
import { api } from '@/lib/api'
import { getPerfMetricsList } from '@/features/performance-metrics/api'
import type { PerfMetricRow } from '@/features/performance-metrics/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from '@/components/ui/progress'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { SamplingRateLimitVisualEditor } from './sampling-rate-limit-visual-editor'
import { SamplingRecordsTable } from './sampling-records-table'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  TpsBenchmark: z.coerce.number().min(1),
  TtftBenchmark: z.coerce.number().min(1),
  SamplingPrompt: z.string(),
  SamplingMaxTokens: z.coerce.number().min(1).max(8192),
  SamplingIntervalMinutes: z.coerce.number().min(0).max(1440),
  SamplingStartTime: z.string(),
  SamplingEndTime: z.string(),
  SamplingDefaultDurationMinutes: z.coerce.number().min(0).max(1440),
  SamplingDefaultMaxRequests: z.coerce.number().min(0).max(100000000),
  SamplingDefaultMaxSuccess: z.coerce.number().min(1).max(100000000),
  SamplingRateLimitGroup: z.string(),
})

type SamplingFormValues = z.infer<typeof schema>

interface Props {
  defaultValues: SamplingFormValues
}

// ---------------------------------------------------------------------------
// Time options (30-min granularity)
// ---------------------------------------------------------------------------

const TIME_OPTIONS: string[] = []
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    )
  }
}

// ---------------------------------------------------------------------------
// Sampling status types
// ---------------------------------------------------------------------------

type SamplingResultItem = {
  channel: string
  model: string
  message: string
}

type SamplingStatus = {
  is_running: boolean
  stop_requested?: boolean
  done_tasks: number
  total_tasks: number
  success_tasks: number
  failed_tasks: number
  message?: string
  last_result?: SamplingLastResult
  channels?: ChannelProgress[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SamplingSection({ defaultValues }: Props) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<SamplingFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useResetForm(form as any, defaultValues)

  // ---- Sampling status state ----
  const [samplingStatus, setSamplingStatus] = useState<SamplingStatus | null>(
    null
  )
  const [refreshing, setRefreshing] = useState(false)
  const [stopping, setStopping] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isRunningRef = useRef(false)

  const fetchSamplingStatus = useCallback(async () => {
    try {
      const res = await api.get<{
        success: boolean
        data?: SamplingStatus
      }>('/api/model-performance/sampling-status', { skipErrorHandler: true })
      if (res.data?.success) {
        setSamplingStatus(res.data.data ?? null)
        return res.data.data ?? null
      }
    } catch {
      // ignore
    }
    return null
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchSamplingStatus()
  }, [fetchSamplingStatus])

  // Polling when running
  useEffect(() => {
    if (samplingStatus?.is_running && !isRunningRef.current) {
      isRunningRef.current = true
      pollingRef.current = setInterval(() => {
        fetchSamplingStatus().then((status) => {
          if (!status?.is_running) {
            if (pollingRef.current) clearInterval(pollingRef.current)
            pollingRef.current = null
            isRunningRef.current = false
          }
        })
      }, 2000)
    } else if (!samplingStatus?.is_running && isRunningRef.current) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = null
      isRunningRef.current = false
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      isRunningRef.current = false
    }
  }, [samplingStatus?.is_running, fetchSamplingStatus])

  const handleRefreshSampling = async () => {
    setRefreshing(true)
    try {
      const res = await api.post<{
        success: boolean
        message?: string
      }>('/api/model-performance/refresh')
      if (res.data?.success) {
        toast.success(t(res.data.message || 'Sampling task triggered'))
        const status = await fetchSamplingStatus()
        if (status?.is_running) {
          setSamplingStatus(status)
        }
      }
    } catch {
      // error handled by interceptor
    } finally {
      setRefreshing(false)
    }
  }

  const handleStopSampling = async () => {
    setStopping(true)
    try {
      const res = await api.post<{
        success: boolean
        message?: string
      }>('/api/model-performance/stop')
      if (res.data?.success) {
        toast.success(t(res.data.message || 'Stop request sent'))
        const status = await fetchSamplingStatus()
        setSamplingStatus(status)
      }
    } catch {
      // error handled by interceptor
    } finally {
      setStopping(false)
    }
  }

  // ---- Form submit ----
  const onSubmit = async (values: SamplingFormValues) => {
    const entries = Object.entries(values) as [string, unknown][]
    const updates = entries.filter(
      ([key, value]) =>
        value !== (defaultValues[key as keyof SamplingFormValues] as unknown)
    )
    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }
    for (const [key, value] of updates) {
      await updateOption.mutateAsync({
        key,
        value: value as string | number | boolean,
      })
    }
  }

  const intervalMinutes = form.watch('SamplingIntervalMinutes')

  return (
    <SettingsSection
      title={t('Sampling Settings')}
      description={t(
        'Configure performance sampling benchmarks, prompts, and scheduled sampling'
      )}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          {/* ---- Benchmark Settings ---- */}
          <div className='space-y-4'>
            <h4 className='text-sm font-medium'>{t('Benchmark Settings')}</h4>
            <Alert>
              <AlertTitle>{t('Sampling Rate Limit')}</AlertTitle>
              <AlertDescription>
                {t(
                  'Configure per-group rate limiting for sampling. Controls how many requests can be sent to upstream providers within a time window, preventing rate limit violations.'
                )}
              </AlertDescription>
            </Alert>

            <div className='grid grid-cols-3 gap-4'>
              <FormField
                control={form.control}
                name='SamplingDefaultDurationMinutes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Default Window (min)')}</FormLabel>
                    <FormControl>
                      <Input type='number' min={0} max={1440} {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('Global default time window for rate limiting')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='SamplingDefaultMaxRequests'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Default Max Requests')}</FormLabel>
                    <FormControl>
                      <Input type='number' min={0} max={100000000} {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('Max total requests per window')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='SamplingDefaultMaxSuccess'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Default Max Success')}</FormLabel>
                    <FormControl>
                      <Input type='number' min={1} max={100000000} {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('Max successful requests per window')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='SamplingRateLimitGroup'
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <SamplingRateLimitVisualEditor
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Override rate limits for specific groups. Format: [window(min), maxRequests, maxSuccess].'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
              <FormField
                control={form.control}
                name='TpsBenchmark'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('TPS Benchmark (tokens/s)')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        className='w-32'
                        value={
                          field.value === undefined || field.value === null
                            ? ''
                            : String(field.value)
                        }
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('TPS score full-mark standard value')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='TtftBenchmark'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('TTFT Benchmark (ms)')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        className='w-32'
                        value={
                          field.value === undefined || field.value === null
                            ? ''
                            : String(field.value)
                        }
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('TTFT score full-mark standard value')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

          <Separator />

          {/* ---- Sampling Configuration ---- */}
          <div className='space-y-4'>
            <h4 className='text-sm font-medium'>
              {t('Sampling Configuration')}
            </h4>
            <Alert>
              <AlertDescription>
                {t(
                  'Configure the prompt and max tokens for performance sampling. The system will use this configuration to sample all models on test channels.'
                )}
              </AlertDescription>
            </Alert>
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-[1fr_200px]'>
              <FormField
                control={form.control}
                name='SamplingPrompt'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Sampling Prompt')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder={t('Prompt content for performance sampling')}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Prompt content used for performance sampling')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='SamplingMaxTokens'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Max Tokens')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={8192}
                        className='w-32'
                        value={
                          field.value === undefined || field.value === null
                            ? ''
                            : String(field.value)
                        }
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Max output tokens for sampling requests')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* ---- Scheduled Sampling ---- */}
          <div className='space-y-4'>
            <h4 className='text-sm font-medium'>{t('Scheduled Sampling')}</h4>
            <Alert>
              <AlertDescription>
                {t(
                  'Set the time window and interval for automatic sampling. Set interval to 0 to disable scheduled sampling. Admins can also click "Start Sampling" to trigger manually.'
                )}
              </AlertDescription>
            </Alert>

            <div className='flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-3'>
              <span className='text-sm'>{t('Every day')}</span>
              <FormField
                control={form.control}
                name='SamplingStartTime'
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger size='sm' className='w-[90px]'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <span className='text-sm'>{t('to')}</span>
              <FormField
                control={form.control}
                name='SamplingEndTime'
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger size='sm' className='w-[90px]'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <span className='text-sm'>{t(', every')}</span>
              <FormField
                control={form.control}
                name='SamplingIntervalMinutes'
                render={({ field }) => (
                  <Input
                    type='number'
                    min={0}
                    max={1440}
                    className='w-20'
                    value={
                      field.value === undefined || field.value === null
                        ? ''
                        : String(field.value)
                    }
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                )}
              />
              <span className='text-sm'>{t('minutes')}</span>
              {intervalMinutes === 0 && (
                <Badge variant='secondary'>{t('Disabled')}</Badge>
              )}
              {intervalMinutes > 0 && (
                <Badge variant='outline'>
                  {form.watch('SamplingStartTime')} -{' '}
                  {form.watch('SamplingEndTime')} / {intervalMinutes}
                  {t('min')}
                </Badge>
              )}
            </div>

            {/* Action buttons */}
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                onClick={handleRefreshSampling}
                disabled={refreshing || samplingStatus?.is_running === true}
              >
                {refreshing ? t('Starting...') : t('Start Sampling')}
              </Button>
              {samplingStatus?.is_running && (
                <Button
                  type='button'
                  variant='destructive'
                  onClick={handleStopSampling}
                  disabled={stopping || samplingStatus?.stop_requested}
                >
                  {stopping
                    ? t('Stopping...')
                    : t('Stop Sampling')}
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* ---- Sampling Status ---- */}
          <div className='space-y-4'>
            <h4 className='text-sm font-medium'>{t('Sampling Status')}</h4>

            {/* Running progress */}
            {samplingStatus?.is_running && (
              <div className='rounded-lg border border-yellow-300 bg-yellow-50 p-3 space-y-3 dark:border-yellow-800 dark:bg-yellow-950/30'>
                {/* Global progress */}
                <div className='flex items-center gap-2'>
                  <div className='size-4 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent' />
                  <span className='text-sm font-medium'>
                    {t('Running')}... {samplingStatus.done_tasks ?? 0} /{' '}
                    {samplingStatus.total_tasks ?? 0}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    ({t('Success')} {samplingStatus.success_tasks ?? 0} /{' '}
                    {t('Failed')} {samplingStatus.failed_tasks ?? 0})
                  </span>
                </div>
                {samplingStatus.total_tasks > 0 && (
                  <Progress
                    value={Math.round(
                      ((samplingStatus.done_tasks ?? 0) /
                        samplingStatus.total_tasks) *
                        100
                    )}
                  >
                    <ProgressTrack className='h-2'>
                      <ProgressIndicator className='bg-yellow-500' />
                    </ProgressTrack>
                  </Progress>
                )}
                {samplingStatus.message && (
                  <p className='text-muted-foreground text-xs'>
                    {samplingStatus.message}
                  </p>
                )}

                {/* Channel progress */}
                {samplingStatus.channels &&
                  samplingStatus.channels.length > 0 && (
                    <div className='space-y-2'>
                      <span className='text-muted-foreground text-xs font-medium'>
                        {t('Channel Progress')}
                      </span>
                      {samplingStatus.channels.map((ch) => (
                        <div key={ch.channel_id} className='space-y-1'>
                          <div className='flex items-center justify-between'>
                            <span className='text-muted-foreground text-xs'>
                              {ch.channel_name}
                            </span>
                            <span className='text-muted-foreground text-xs'>
                              {ch.done_tasks ?? 0} / {ch.total_tasks ?? 0}
                              {ch.success_tasks > 0 && (
                                <span className='ml-1.5 text-green-600'>
                                  +{ch.success_tasks}
                                </span>
                              )}
                              {ch.failed_tasks > 0 && (
                                <span className='ml-1.5 text-red-600'>
                                  -{ch.failed_tasks}
                                </span>
                              )}
                            </span>
                          </div>
                          {ch.total_tasks > 0 && (
                            <Progress
                              value={Math.round(
                                ((ch.done_tasks ?? 0) / ch.total_tasks) * 100
                              )}
                            >
                              <ProgressTrack className='h-1.5'>
                                <ProgressIndicator
                                  className={
                                    ch.failed_tasks > 0 &&
                                    ch.done_tasks === ch.total_tasks
                                      ? 'bg-red-500'
                                      : ch.done_tasks === ch.total_tasks
                                        ? 'bg-green-500'
                                        : 'bg-primary'
                                  }
                                />
                              </ProgressTrack>
                            </Progress>
                          )}
                          {ch.message && (
                            <p className='text-muted-foreground text-xs'>
                              {ch.message}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}

            {!samplingStatus?.is_running && !samplingStatus?.last_result && (
              <p className='text-muted-foreground text-sm'>
                {t('No sampling records yet')}
              </p>
            )}
          </div>

          <Separator />

          {/* ---- Sampling Records (History) ---- */}
          <div className='space-y-4'>
            <h4 className='text-sm font-medium'>{t('Sampling Records')}</h4>
            <SamplingRecordsTable />
          </div>

          <Button type='submit' disabled={updateOption.isPending}>
            {updateOption.isPending ? t('Saving...') : t('Save Changes')}
          </Button>
        </form>
      </Form>
    </SettingsSection>
  )
}
