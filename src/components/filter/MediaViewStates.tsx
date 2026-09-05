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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { MediaListSkeleton } from '@/components/filter/MediaListSkeleton'
import { GRID_CLASS } from '@/components/filter/MediaCollections'
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
    <div className="flex items-center justify-center min-h-[var(--spacing-empty-state-min-height)]">
      <Empty className="border-none bg-transparent">
        {status === 'not-connected' ? (
          <>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Unplug className="size-12" aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle className="text-2xl">
                {t('connection.notConnected', {
                  defaultValue: 'Not Connected',
                })}
              </EmptyTitle>
              <EmptyDescription className="text-base">
                {t('connection.notConnectedDescription', {
                  defaultValue:
                    'Configure your Jellyfin server connection to get started',
                })}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="lg"
                className="gap-2 rounded-2xl"
                onClick={onOpenSettings}
              >
                <Settings2 className="size-5" aria-hidden="true" />
                {t('connection.openSettings', {
                  defaultValue: 'Open Settings',
                })}
              </Button>
            </EmptyContent>
          </>
        ) : (
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <div className="animate-spin" aria-hidden="true">
                <Loader2 className="size-12" />
              </div>
            </EmptyMedia>
            <EmptyTitle className="text-2xl">
              {t('connection.connecting', {
                defaultValue: 'Connecting…',
              })}
            </EmptyTitle>
            <EmptyDescription className="text-base">
              {t('connection.connectingDescription', {
                defaultValue: 'Establishing connection to Jellyfin server',
              })}
            </EmptyDescription>
          </EmptyHeader>
        )}
      </Empty>
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
        <MediaGridSkeleton
          count={Math.min(pageSize, 24)}
          className={GRID_CLASS}
        />
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
    <div
      className="flex flex-col items-center justify-center py-16 gap-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
      </div>
      <p className="text-destructive text-center text-lg">
        {error.message ||
          t('items.loadError', {
            defaultValue: 'Unable to load media items',
          })}
      </p>
      <Button
        variant="secondary"
        size="lg"
        className="rounded-full px-6"
        onClick={onRetry}
      >
        <RefreshCw className="size-4 mr-2" aria-hidden="true" />
        {t('common.retry')}
      </Button>
    </div>
  )
}

export function MediaEmptyState() {
  const { t } = useTranslation()

  return (
    <output
      className="flex flex-col items-center justify-center py-16 text-center"
      aria-live="polite"
    >
      <div className="size-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <Search className="size-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-muted-foreground text-lg">
        {t('items.noItems', { defaultValue: 'No items found' })}
      </p>
    </output>
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
