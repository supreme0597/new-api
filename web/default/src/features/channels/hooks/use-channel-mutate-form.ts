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
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { createChannel, updateChannel } from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import {
  resolveOwnerUserId,
  transformFormDataToCreatePayload,
  transformFormDataToUpdatePayload,
  type ChannelFormValues,
} from '../lib'
import type { Channel } from '../types'
import { useAuthStore } from '@/stores/auth-store'

type UseChannelMutateFormParams = {
  currentRow?: Channel | null
  isEditing: boolean
  isMultiKeyChannel: boolean
  onSuccess: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message
  }

  if (!isRecord(error)) return undefined

  const response = error.response
  if (isRecord(response)) {
    const data = response.data
    if (isRecord(data)) {
      const message = data.message
      if (typeof message === 'string') return message
    }
  }

  const message = error.message
  if (typeof message === 'string') return message
  return undefined
}

export function useChannelMutateForm(props: UseChannelMutateFormParams) {
  const { t } = useTranslation()

  return useMutation({
    mutationFn: async (data: ChannelFormValues): Promise<string> => {
      const currentUser = useAuthStore.getState().auth.user
      const currentUserId = currentUser?.id
      const isSuperAdmin = (currentUser?.role ?? 0) >= 100

      // Resolve owner_user_id from channelType for private/test channel support.
      // On EDIT, preserve the original channel's owner to prevent ownership change
      // (e.g. when a super admin edits a private channel owned by a regular user).
      const resolveOwnerId = () => {
        if (props.isEditing && props.currentRow) {
          const originalOwnerId = props.currentRow.owner_user_id
          // For test channels (-999), preserve test ownership across edits.
          if (originalOwnerId === -999) return -999
          // For private channels, keep the original owner; do not overwrite
          // with the currently logged-in user's id.
          if (originalOwnerId != null) return originalOwnerId
          // Originally public (owner_user_id === null). If admin is converting
          // to private, use the admin's id; if staying public, return null.
          const channelTypeValue = data.channelType as
            | 'public'
            | 'private'
            | 'test'
            | undefined
          if (channelTypeValue === 'private') {
            return resolveOwnerUserId('private', currentUserId)
          }
          return null
        }
        // Create path: derive from selected channel type.
        const channelTypeValue = data.channelType as
          | 'public'
          | 'private'
          | 'test'
          | undefined
        if (channelTypeValue) {
          return resolveOwnerUserId(channelTypeValue, currentUserId)
        }
        return resolveOwnerUserId(
          isSuperAdmin ? 'public' : 'private',
          currentUserId
        )
      }

      if (props.isEditing && props.currentRow) {
        const payload = transformFormDataToUpdatePayload(
          data,
          props.currentRow.id
        )
        const payloadWithKeyMode =
          props.isMultiKeyChannel && data.key_mode
            ? {
                ...payload,
                key_mode: data.key_mode,
              }
            : payload
        payloadWithKeyMode.owner_user_id = resolveOwnerId()

        const response = await updateChannel(
          props.currentRow.id,
          payloadWithKeyMode
        )
        if (!response.success) {
          throw new Error(response.message || t(ERROR_MESSAGES.UPDATE_FAILED))
        }
        return SUCCESS_MESSAGES.UPDATED
      }

      const payload = transformFormDataToCreatePayload(data)
      payload.channel.owner_user_id = resolveOwnerId()
      const response = await createChannel(payload)
      if (!response.success) {
        throw new Error(response.message || t(ERROR_MESSAGES.CREATE_FAILED))
      }
      return SUCCESS_MESSAGES.CREATED
    },
    onSuccess: (messageKey) => {
      toast.success(t(messageKey))
      props.onSuccess()
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || t(ERROR_MESSAGES.CREATE_FAILED))
    },
  })
}
