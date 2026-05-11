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
import { useTranslation } from 'react-i18next'
import { useLocation } from '@tanstack/react-router'
import { SectionPageLayout } from '@/components/layout'
import { ChannelsDialogs } from './components/channels-dialogs'
import { ChannelsPrimaryButtons } from './components/channels-primary-buttons'
import { ChannelsProvider } from './components/channels-provider'
import { ChannelsTable } from './components/channels-table'

export function Channels({ myChannelsOnly }: { myChannelsOnly?: boolean } = {}) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const routeId = pathname.startsWith('/my-channels') ? '/_authenticated/my-channels/' : '/_authenticated/channels/'
  return (
    <ChannelsProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {myChannelsOnly ? t('My Channels') : t('Channels')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {myChannelsOnly
            ? t('This view shows public channels and your private channels.')
            : t('Manage API channels and provider configurations')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <ChannelsPrimaryButtons myChannelsOnly={myChannelsOnly} />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <ChannelsTable myChannelsOnly={myChannelsOnly} routeId={routeId} />
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <ChannelsDialogs />
    </ChannelsProvider>
  )
}
