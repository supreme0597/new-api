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
import { useState, useMemo } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getGroups } from '@/features/channels/api'
import { safeJsonParseWithValidation } from '../utils/json-parser'
import { isObjectRecord } from '../utils/json-validators'
import {
  SamplingRateLimitDialog,
  type SamplingRateLimitEntryData,
} from './sampling-rate-limit-dialog'

type SamplingRateLimitVisualEditorProps = {
  value: string
  onChange: (value: string) => void
}

type SamplingRateLimitEntry = SamplingRateLimitEntryData

export function SamplingRateLimitVisualEditor({
  value,
  onChange,
}: SamplingRateLimitVisualEditorProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editData, setEditData] = useState<SamplingRateLimitEntry | null>(null)

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  })
  const groups = useMemo(
    () => (groupsData?.data as string[]) || [],
    [groupsData],
  )

  const rateLimits = useMemo(() => {
    if (!value || value.trim() === '') return []

    const parsed = safeJsonParseWithValidation<Record<string, unknown>>(value, {
      fallback: {},
      validator: isObjectRecord,
      validatorMessage: 'Sampling rate limits must be a JSON object',
      context: 'sampling rate limits',
    })

    return Object.entries(parsed)
      .map(([groupName, limits]) => {
        if (
          Array.isArray(limits) &&
          limits.length === 3 &&
          typeof limits[0] === 'number' &&
          typeof limits[1] === 'number' &&
          typeof limits[2] === 'number'
        ) {
          return {
            groupName,
            duration: limits[0],
            maxRequests: limits[1],
            maxSuccess: limits[2],
          }
        }
        return null
      })
      .filter((item): item is SamplingRateLimitEntry => item !== null)
  }, [value])

  const existingGroups = useMemo(
    () => rateLimits.map((item) => item.groupName),
    [rateLimits],
  )

  const updateValue = (newLimits: SamplingRateLimitEntry[]) => {
    const obj: Record<string, number[]> = {}
    for (const item of newLimits) {
      obj[item.groupName] = [item.duration, item.maxRequests, item.maxSuccess]
    }
    onChange(JSON.stringify(obj))
  }

  const handleAdd = () => {
    setEditData(null)
    setDialogOpen(true)
  }

  const handleEdit = (entry: SamplingRateLimitEntry) => {
    setEditData(entry)
    setDialogOpen(true)
  }

  const handleDelete = (groupName: string) => {
    updateValue(rateLimits.filter((item) => item.groupName !== groupName))
  }

  const handleSave = (data: SamplingRateLimitEntryData) => {
    let newLimits: SamplingRateLimitEntry[]
    if (editData) {
      newLimits = rateLimits.map((item) =>
        item.groupName === editData.groupName ? data : item,
      )
    } else {
      newLimits = [...rateLimits, data]
    }
    updateValue(newLimits)
  }

  return (
    <div className='space-y-3'>
      {rateLimits.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Group')}</TableHead>
              <TableHead className='text-right'>
                {t('Window (min)')}
              </TableHead>
              <TableHead className='text-right'>
                {t('Max Requests')}
              </TableHead>
              <TableHead className='text-right'>
                {t('Max Success')}
              </TableHead>
              <TableHead className='w-[100px]'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rateLimits.map((entry) => (
              <TableRow key={entry.groupName}>
                <TableCell className='font-medium'>
                  {entry.groupName}
                </TableCell>
                <TableCell className='text-right'>
                  <span className='font-mono'>
                    {entry.duration === 0 ? t('Global') : entry.duration}
                  </span>
                </TableCell>
                <TableCell className='text-right'>
                  <span className='font-mono'>
                    {entry.maxRequests === 0
                      ? t('Unlimited')
                      : entry.maxRequests.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className='text-right'>
                  <span className='font-mono'>
                    {entry.maxSuccess.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell>
                  <div className='flex gap-1'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => handleEdit(entry)}
                    >
                      <Pencil className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => handleDelete(entry.groupName)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button variant='outline' size='sm' onClick={handleAdd}>
        <Plus className='mr-1 h-4 w-4' />
        {t('Add group')}
      </Button>

      <SamplingRateLimitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        editData={editData}
        groups={groups}
        existingGroups={existingGroups}
      />
    </div>
  )
}
