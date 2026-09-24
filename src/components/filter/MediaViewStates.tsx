/**
 * The non-result states of the media browser: connection notices, loading
 * skeletons, load errors, the empty result, and the "Showing x-y of z" line.
 */

import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Unplug,
} from 'lucide-react'
import { MediaGridSkeleton } from '@/components/ui/loading-skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MediaListSkeleton } from '@/components/filter/MediaListSkeleton'
import type { ViewMode } from '@/stores/session-store'

export type ConnectionStatus = 'connected' | 'connecting' | 'not-connected'

export function ConnectionStatusNotice({
  status,
  onOpenSettings,
}: {
  status: Exclude<ConnectionStatus, 'connected'>
  onOpenSettings: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center min-h-(--spacing-empty-state-min-height)">
      {status === 'not-connected' ? (
        <EmptyState
          icon={<Unplug />}
          title={t('connection.notConnected', {
            defaultValue: 'Not Connected',
          })}
          message={t('connection.notConnectedDescription', {
            defaultValue:
              'Configure your Jellyfin server connection to get started',
          })}
          action={
            <Button onClick={onOpenSettings}>
              <Settings2 aria-hidden="true" />
              {t('connection.openSettings', {
                defaultValue: 'Open Settings',
              })}
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={
            <div className="animate-spin">
              <Loader2 />
            </div>
          }
          title={t('connection.connecting', {
            defaultValue: 'Connecting…',
          })}
          message={t('connection.connectingDescription', {
            defaultValue: 'Establishing connection to Jellyfin server',
          })}
        />
      )}
    </div>
  )
}

export function MediaLoadingState({
  viewMode,
  pageSize,
}: {
  viewMode: ViewMode
  pageSize: number
}) {
  const { t } = useTranslation()

  return (
    <div className="animate-in fade-in animation-duration-200">
      {viewMode === 'list' ? (
        <MediaListSkeleton
          count={Math.min(pageSize, 12)}
          loadingLabel={t('items.loadingMediaItems', {
            defaultValue: 'Loading media items',
          })}
        />
      ) : (
        <MediaGridSkeleton count={Math.min(pageSize, 24)} />
      )}
    </div>
  )
}

export function MediaLoadErrorState({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <EmptyState
      tone="destructive"
      icon={<AlertCircle />}
      message={
        error.message ||
        t('items.loadError', {
          defaultValue: 'Unable to load media items',
        })
      }
      action={
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          {t('common.retry')}
        </Button>
      }
    />
  )
}

export function MediaEmptyState() {
  const { t } = useTranslation()

  return (
    <EmptyState
      icon={<Search />}
      message={t('items.noItems', { defaultValue: 'No items found' })}
    />
  )
}

export function ResultsSummary({
  currentPage,
  pageSize,
  totalItems,
}: {
  currentPage: number
  pageSize: number
  totalItems: number
}) {
  const { t } = useTranslation()
  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="flex justify-between items-center mb-6">
      <p
        className="text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {t('items.showing', {
          start,
          end,
          total: totalItems,
          defaultValue: `Showing ${start}-${end} of ${totalItems}`,
        })}
      </p>
    </div>
  )
}
