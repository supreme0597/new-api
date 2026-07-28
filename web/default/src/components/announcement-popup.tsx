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
import { useEffect, useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const STORAGE_KEY_PREFIX = 'announcement_last_closed'

interface ClosedAnnouncement {
  id?: number
  publishDate?: string
}

function getStorageKey(userId?: number): string {
  return userId ? `${STORAGE_KEY_PREFIX}_${userId}` : STORAGE_KEY_PREFIX
}

function getClosedAnnouncement(userId?: number): ClosedAnnouncement | null {
  try {
    if (typeof window !== 'undefined') {
      const key = getStorageKey(userId)
      const saved = window.localStorage.getItem(key)
      return saved ? (JSON.parse(saved) as ClosedAnnouncement) : null
    }
  } catch {
    /* empty */
  }
  return null
}

function saveClosedAnnouncement(
  announcement: ClosedAnnouncement,
  userId?: number
) {
  try {
    if (typeof window !== 'undefined') {
      const key = getStorageKey(userId)
      window.localStorage.setItem(key, JSON.stringify(announcement))
    }
  } catch {
    /* empty */
  }
}

function isNewAnnouncement(
  current: ClosedAnnouncement | null,
  latest: ClosedAnnouncement
): boolean {
  if (!current) return true
  if (!latest.publishDate) return false
  if (!current.publishDate) return true
  return (
    new Date(latest.publishDate).getTime() >
    new Date(current.publishDate).getTime()
  )
}

const ANNOUNCEMENT_TICKER_STYLES: Record<string, string> = {
  default: 'bg-muted/80 text-foreground border-border',
  ongoing:
    'bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800',
  success:
    'bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100 border-green-200 dark:border-green-800',
  warning:
    'bg-orange-50 dark:bg-orange-950 text-orange-900 dark:text-orange-100 border-orange-200 dark:border-orange-800',
  error:
    'bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100 border-red-200 dark:border-red-800',
}

function getTickerStyle(type?: string): string {
  return (
    ANNOUNCEMENT_TICKER_STYLES[type || 'default'] ||
    ANNOUNCEMENT_TICKER_STYLES.default
  )
}

function renderRichText(content: string, extra?: string): string {
  let html = content || ''
  if (extra) {
    html += ` <span class="text-muted-foreground text-xs">— ${extra}</span>`
  }
  return html
}

export function AnnouncementBanner() {
  const { t } = useTranslation()
  const { items: announcements, loading } = useAnnouncements()
  const { user } = useAuthStore((state) => state.auth)
  const [visible, setVisible] = useState(false)
  const [currentAnnouncement, setCurrentAnnouncement] = useState<{
    content?: string
    extra?: string
    publishDate?: string
    id?: number
    type?: string
  } | null>(null)

  useEffect(() => {
    if (loading || announcements.length === 0) return

    const latestAnnouncement = announcements[0]
    const closedAnnouncement = getClosedAnnouncement(user?.id)

    if (isNewAnnouncement(closedAnnouncement, latestAnnouncement)) {
      setCurrentAnnouncement(latestAnnouncement)
      setVisible(true)
    }
  }, [announcements, loading, user?.id])

  const handleClose = () => {
    if (currentAnnouncement) {
      saveClosedAnnouncement(
        {
          id: currentAnnouncement.id,
          publishDate: currentAnnouncement.publishDate,
        },
        user?.id
      )
    }
    setVisible(false)
  }

  if (!visible || !currentAnnouncement) return null

  const richHtml = renderRichText(
    currentAnnouncement.content || '',
    currentAnnouncement.extra
  )

  return (
    <>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-animate {
          animation: ticker-scroll 20s linear infinite;
        }
        .ticker-animate:hover {
          animation-play-state: paused;
        }
        .ticker-content h1,
        .ticker-content h2,
        .ticker-content h3,
        .ticker-content h4,
        .ticker-content h5,
        .ticker-content h6 {
          display: inline;
          font-size: inherit;
          font-weight: inherit;
          margin: 0;
          padding: 0;
        }
        .ticker-content p {
          display: inline;
          margin: 0;
        }
        .ticker-content a {
          text-decoration: underline;
        }
        .ticker-content strong {
          font-weight: 700;
        }
        .ticker-content em {
          font-style: italic;
        }
      `}</style>
      <div className={cn('border-b', getTickerStyle(currentAnnouncement.type))}>
        <div className='mx-auto flex h-9 max-w-7xl items-center gap-2 px-3'>
          <Megaphone className='size-4 shrink-0 opacity-70' />
          <div className='relative min-w-0 flex-1 overflow-hidden'>
            <div className='ticker-animate flex w-max gap-16'>
              <span
                className='ticker-content whitespace-nowrap text-sm font-medium [&_img]:hidden'
                dangerouslySetInnerHTML={{ __html: richHtml }}
              />
              <span
                className='ticker-content whitespace-nowrap text-sm font-medium [&_img]:hidden'
                dangerouslySetInnerHTML={{ __html: richHtml }}
              />
            </div>
          </div>
          <button
            onClick={handleClose}
            className='shrink-0 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100'
            aria-label={t('Close')}
          >
            <X className='size-4' />
          </button>
        </div>
      </div>
    </>
  )
}
