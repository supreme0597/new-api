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
