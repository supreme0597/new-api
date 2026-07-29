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
import { useTranslation } from 'react-i18next'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { useAuthStore } from '@/stores/auth-store'
import { Dialog } from '@/components/dialog'

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

function renderRichText(content: string, extra?: string): string {
  let html = content || ''
  if (extra) {
    html += `<p class="text-muted-foreground text-xs mt-2">— ${extra}</p>`
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

  if (!currentAnnouncement) return null

  const richHtml = renderRichText(
    currentAnnouncement.content || '',
    currentAnnouncement.extra
  )

  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      title={t('Announcement')}
      contentClassName='sm:max-w-lg !top-[15vh]'
      contentHeight='auto'
      bodyClassName='space-y-4'
      showCloseButton={false}
    >
      <div
        className='announcement-content prose prose-sm dark:prose-invert max-w-none [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_p]:my-1 [&_a]:text-primary [&_a]:underline'
        dangerouslySetInnerHTML={{ __html: richHtml }}
      />
      <div className='flex justify-end pt-2'>
        <button
          onClick={handleClose}
          className='bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors'
        >
          {t('Close')}
        </button>
      </div>
    </Dialog>
  )
}
