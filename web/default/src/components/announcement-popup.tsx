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
import { formatDateTimeObject } from '@/lib/time'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog } from '@/components/dialog'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'

const STORAGE_KEY = 'announcement_last_closed'

interface ClosedAnnouncement {
  id?: number
  publishDate?: string
}

function getClosedAnnouncement(): ClosedAnnouncement | null {
  try {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      return saved ? (JSON.parse(saved) as ClosedAnnouncement) : null
    }
  } catch {
    /* empty */
  }
  return null
}

function saveClosedAnnouncement(announcement: ClosedAnnouncement) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(announcement))
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
  return new Date(latest.publishDate).getTime() > new Date(current.publishDate).getTime()
}

export function AnnouncementPopup() {
  const { t } = useTranslation()
  const { items: announcements, loading } = useAnnouncements()
  const [isOpen, setIsOpen] = useState(false)
  const [currentAnnouncement, setCurrentAnnouncement] = useState<{
    content?: string
    extra?: string
    publishDate?: string
    id?: number
  } | null>(null)

  useEffect(() => {
    if (loading || announcements.length === 0) return

    const latestAnnouncement = announcements[0]
    const closedAnnouncement = getClosedAnnouncement()

    if (isNewAnnouncement(closedAnnouncement, latestAnnouncement)) {
      setCurrentAnnouncement(latestAnnouncement)
      setIsOpen(true)
    }
  }, [announcements, loading])

  const handleClose = () => {
    if (currentAnnouncement) {
      saveClosedAnnouncement({
        id: currentAnnouncement.id,
        publishDate: currentAnnouncement.publishDate,
      })
    }
    setIsOpen(false)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose()
        }
      }}
      title={t('Announcement')}
      description={
        currentAnnouncement?.publishDate
          ? `${t('Published:')} ${formatDateTimeObject(new Date(currentAnnouncement.publishDate))}`
          : undefined
      }
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
      bodyClassName='space-y-4'
      showCloseButton={false}
    >
      <ScrollArea className='max-h-[min(58vh,520px)] pr-4'>
        <div className='space-y-4'>
          {currentAnnouncement?.content && (
            <div>
              <h4 className='mb-2 font-medium'>{t('Content')}</h4>
              <Markdown>{currentAnnouncement.content}</Markdown>
            </div>
          )}
          {currentAnnouncement?.extra && (
            <div>
              <h4 className='mb-2 font-medium'>
                {t('Additional Information')}
              </h4>
              <Markdown className='text-muted-foreground'>
                {currentAnnouncement.extra}
              </Markdown>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className='flex justify-end'>
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
