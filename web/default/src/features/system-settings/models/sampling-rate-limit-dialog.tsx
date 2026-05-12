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
import { useEffect } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const samplingRateLimitDialogSchema = z.object({
  groupName: z.string().min(1, 'Group name is required'),
  duration: z.number().min(0, 'Must be ≥ 0').max(1440, 'Must be ≤ 1440'),
  maxRequests: z
    .number()
    .min(0, 'Must be ≥ 0')
    .max(2147483647, 'Must be ≤ 2,147,483,647'),
  maxSuccess: z
    .number()
    .min(1, 'Must be ≥ 1')
    .max(2147483647, 'Must be ≤ 2,147,483,647'),
})

type SamplingRateLimitDialogFormValues = z.infer<
  typeof samplingRateLimitDialogSchema
>

export type SamplingRateLimitEntryData = {
  groupName: string
  duration: number
  maxRequests: number
  maxSuccess: number
}

type SamplingRateLimitDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: SamplingRateLimitEntryData) => void
  editData?: SamplingRateLimitEntryData | null
  groups: string[]
  existingGroups: string[]
}

export function SamplingRateLimitDialog({
  open,
  onOpenChange,
  onSave,
  editData,
  groups,
  existingGroups,
}: SamplingRateLimitDialogProps) {
  const { t } = useTranslation()
  const isEditMode = !!editData

  const form = useForm<SamplingRateLimitDialogFormValues>({
    resolver: zodResolver(samplingRateLimitDialogSchema),
    defaultValues: {
      groupName: '',
      duration: 0,
      maxRequests: 0,
      maxSuccess: 3,
    },
  })

  useEffect(() => {
    if (editData) {
      form.reset(editData)
    } else {
      form.reset({
        groupName: '',
        duration: 0,
        maxRequests: 0,
        maxSuccess: 3,
      })
    }
  }, [editData, form, open])

  const handleSubmit = (values: SamplingRateLimitDialogFormValues) => {
    onSave(values)
    onOpenChange(false)
  }

  const availableGroups = isEditMode
    ? groups
    : groups.filter((g) => !existingGroups.includes(g))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? t('Edit group sampling rate limit')
              : t('Add group sampling rate limit')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Configure rate limiting for a specific channel group during sampling.'
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='groupName'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Group')}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEditMode}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select group')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableGroups.map((group) => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('The channel group to configure')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='duration'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Window (minutes)')}</FormLabel>
                  <FormControl>
                    <div className='flex items-center gap-2'>
                      <Input
                        type='number'
                        min={0}
                        max={1440}
                        step={1}
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                      <span className='text-muted-foreground text-sm whitespace-nowrap'>
                        {t('min')}
                      </span>
                    </div>
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Time window for rate limiting. 0 uses the global default.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='maxRequests'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Max Requests (including failures)')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={2147483647}
                      step={1}
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value) || 0)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Maximum total requests per window. 0 means unlimited.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='maxSuccess'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Max Success Requests')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={1}
                      max={2147483647}
                      step={1}
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value) || 1)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Maximum successful requests per window.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
              >
                {t('Cancel')}
              </Button>
              <Button type='submit'>{t('Save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
