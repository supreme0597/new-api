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
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Markdown } from '@/components/ui/markdown'
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

const ANNOUNCEMENT_TYPE_STYLES: Record<string, string> = {
  default: 'bg-muted border-border',
  ongoing: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
  success:
    'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
  warning:
    'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800',
  error:
    'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
}

function getBannerStyle(type?: string): string {
  return ANNOUNCEMENT_TYPE_STYLES[type || 'default'] || ANNOUNCEMENT_TYPE_STYLES.default
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

  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b px-4 py-2.5',
        getBannerStyle(currentAnnouncement.type)
      )}
    >
      <div className='mx-auto flex max-w-7xl items-start gap-3'>
        <div className='min-w-0 flex-1'>
          {currentAnnouncement.content && (
            <Markdown className='text-sm leading-relaxed'>
              {currentAnnouncement.content}
            </Markdown>
          )}
          {currentAnnouncement.extra && (
            <Markdown className='text-muted-foreground mt-1 text-xs'>
              {currentAnnouncement.extra}
            </Markdown>
          )}
        </div>
        <button
          onClick={handleClose}
          className='text-muted-foreground hover:text-foreground mt-0.5 shrink-0 rounded-md p-1 transition-colors'
          aria-label={t('Close')}
        >
          <X className='size-4' />
        </button>
      </div>
    </div>
  )
}
