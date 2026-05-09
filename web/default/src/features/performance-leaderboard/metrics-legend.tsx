import { useTranslation } from 'react-i18next'
import { HelpCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const SCORE_LEVELS = [
  { min: 80, colorClass: 'bg-emerald-500', labelKey: 'Excellent (≥80)' },
  { min: 60, colorClass: 'bg-blue-500', labelKey: 'Good (60-79)' },
  { min: 40, colorClass: 'bg-orange-500', labelKey: 'Average (40-59)' },
  { min: 0, colorClass: 'bg-red-500', labelKey: 'Poor (<40)' },
]

function ScoreLegend() {
  const { t } = useTranslation()

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<button type='button' className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors' />}>
          <HelpCircle className='h-3.5 w-3.5' />
          {t('Scoring Guide')}
        </TooltipTrigger>
        <TooltipContent side='bottom' className='max-w-xs'>
          <div className='space-y-1.5'>
            <p className='font-medium text-xs mb-2'>{t('Score Levels')}</p>
            {SCORE_LEVELS.map((level) => (
              <div key={level.min} className='flex items-center gap-2 text-xs'>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${level.colorClass}`} />
                <span>{t(level.labelKey)}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function MetricTooltip({
  metric,
  children,
}: {
  metric: 'tps' | 'ttft' | 'success_rate' | 'score'
  children: React.ReactNode
}) {
  const { t } = useTranslation()

  const tooltips: Record<string, string> = {
    tps: t('Tokens Per Second - measures output speed. Higher is better.'),
    ttft: t('Time To First Token - measures response latency. Lower is better.'),
    success_rate: t('Percentage of successful requests out of total samples.'),
    score: t('Combined performance score (0-100) based on TPS, TTFT, and success rate.'),
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className='inline-flex items-center cursor-help' />}>
          {children}
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-[240px] text-xs'>
          {tooltips[metric]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { ScoreLegend, MetricTooltip }
