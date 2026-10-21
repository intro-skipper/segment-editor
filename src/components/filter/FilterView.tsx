import { useEffect, startTransition } from 'react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { BaseItemDto } from '@/types/jellyfin'
import { useCollections, useItems } from '@/services/items/queries'
import { usePluginMode } from '@/hooks/use-connection-init'
import { useGridKeyboardNavigation } from '@/hooks/use-grid-keyboard-navigation'
import { LibraryPicker } from '@/components/filter/LibraryPicker'
import { PaginationControls } from '@/components/filter/PaginationControls'
import { MediaGrid, MediaList } from '@/components/filter/MediaCollections'
import type { ConnectionStatus } from '@/components/filter/MediaViewStates'
import {
  ConnectionStatusNotice,
  MediaEmptyState,
  MediaLoadErrorState,
  MediaLoadingState,
  ResultsSummary,
} from '@/components/filter/MediaViewStates'
import { useSessionStore } from '@/stores/session-store'
import { navigateToMediaItem } from '@/lib/navigation-utils'

const selectPageSize = (state: ReturnType<typeof useSessionStore.getState>) =>
  state.pageSize

const selectViewMode = (state: ReturnType<typeof useSessionStore.getState>) =>
  state.viewMode

const selectSetSettingsOpen = (
  state: ReturnType<typeof useSessionStore.getState>,
) => state.setSettingsOpen

const EMPTY_ITEMS: Array<BaseItemDto> = []

const routeApi = getRouteApi('/')

type RootNavigate = ReturnType<typeof useNavigate>

function navigateToPage(navigate: RootNavigate, pageNum: number) {
  void navigate({
    to: '/',
    search: (prev) => ({
      ...prev,
      page: pageNum > 1 ? pageNum : undefined,
    }),
    replace: true,
  })
}

/**
 * Standalone sessions with stored credentials show "Connecting…" only while
 * validation is pending; once validation completes without a connection the
 * credentials are bad, so fall through to the actionable not-connected state
 * instead of spinning forever with no attempt in flight.
 */
function getConnectionStatus({
  isPlugin,
  hasCredentials,
  isConnected,
  isValidating,
  hasValidated,
}: ReturnType<typeof usePluginMode>): ConnectionStatus {
  if (isConnected) return 'connected'
  if (isPlugin) return 'connecting'
  if (!hasCredentials) return 'not-connected'
  return hasValidated && !isValidating ? 'not-connected' : 'connecting'
}

type ItemsPage = ReturnType<typeof useItems>['data']

/** Page math for the current items response, clamped to the valid page range. */
function getPageWindow(
  itemsData: ItemsPage,
  currentPage: number,
  pageSize: number,
) {
  const totalItems = itemsData?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  return {
    items: itemsData?.items ?? EMPTY_ITEMS,
    totalItems,
    totalPages,
    validCurrentPage: Math.min(Math.max(1, currentPage), totalPages),
  }
}

/** The slice of a query result the view flags depend on. */
type QueryStatus<
  TQuery extends { data: unknown; isLoading: boolean; error: unknown },
> = Pick<TQuery, 'data' | 'isLoading' | 'error'>

/**
 * Which of the (non-exclusive) content sections render. Kept as independent
 * flags rather than a state machine: a refetch error keeps stale items on
 * screen next to the error message.
 */
function getMediaViewFlags(
  connectionStatus: ConnectionStatus,
  selectedCollection: string | undefined,
  collections: QueryStatus<ReturnType<typeof useCollections>>,
  items: QueryStatus<ReturnType<typeof useItems>>,
) {
  const totalItems = items.data?.totalCount ?? 0
  return {
    showLibraryPicker:
      connectionStatus === 'connected' &&
      !selectedCollection &&
      !collections.isLoading &&
      !collections.error,
    showLoading:
      collections.isLoading ||
      Boolean(
        selectedCollection &&
        !items.error &&
        items.isLoading &&
        items.data === undefined,
      ),
    loadError: collections.error || items.error,
    showEmpty: Boolean(
      selectedCollection &&
      !items.isLoading &&
      !items.error &&
      totalItems === 0,
    ),
  }
}

export default function FilterView() {
  return useRenderFilterView()
}

function useRenderFilterView() {
  const navigate = useNavigate({ from: '/' })

  const {
    collection: selectedCollection,
    page,
    search: searchFilter,
  } = routeApi.useSearch()
  const currentPage = page ?? 1

  const pageSize = useSessionStore(selectPageSize)
  const viewMode = useSessionStore(selectViewMode)
  const requestedPage = Math.max(1, currentPage)
  const startIndex = (requestedPage - 1) * pageSize

  const connectionStatus = getConnectionStatus(usePluginMode())
  const setSettingsOpen = useSessionStore(selectSetSettingsOpen)

  const collectionsQuery = useCollections()
  const itemsQuery = useItems({
    parentId: selectedCollection ?? '',
    nameFilter: searchFilter,
    limit: pageSize,
    startIndex,
    includeMediaStreams: false,
    enabled: !!selectedCollection,
  })

  const {
    items: paginatedItems,
    totalItems,
    totalPages,
    validCurrentPage,
  } = getPageWindow(itemsQuery.data, currentPage, pageSize)

  useEffect(() => {
    if (currentPage !== validCurrentPage) {
      navigateToPage(navigate, validCurrentPage)
    }
  }, [currentPage, validCurrentPage, navigate])

  const handleItemActivate = (index: number) => {
    const item = paginatedItems.at(index)
    if (item === undefined) return
    navigateToMediaItem(navigate, item)
  }

  const { setFocusedIndex, gridProps, getItemProps, gridRef } =
    useGridKeyboardNavigation({
      itemCount: paginatedItems.length,
      onActivate: handleItemActivate,
    })

  const handleCollectionChange = (value: string | null) => {
    setFocusedIndex(-1)
    startTransition(() => {
      void navigate({
        to: '/',
        search: {
          collection: value ?? undefined,
          page: undefined,
          search: undefined,
        },
        replace: true,
      })
    })
  }

  const handlePageChange = (newPage: number) => {
    setFocusedIndex(-1)
    startTransition(() => {
      navigateToPage(navigate, newPage)
    })
    if (typeof window === 'undefined') return

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }

  const handleRetry = () => {
    if (collectionsQuery.error) void collectionsQuery.refetch()
    else void itemsQuery.refetch()
  }

  const { showLibraryPicker, showLoading, loadError, showEmpty } =
    getMediaViewFlags(
      connectionStatus,
      selectedCollection,
      collectionsQuery,
      itemsQuery,
    )

  return (
    <div className="relative px-fluid-md pbe-8">
      <div className="max-w-7xl mx-auto">
        {connectionStatus !== 'connected' && (
          <ConnectionStatusNotice
            status={connectionStatus}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {showLibraryPicker && (
          <LibraryPicker
            collections={collectionsQuery.data}
            onCollectionChange={handleCollectionChange}
          />
        )}

        {showLoading && (
          <MediaLoadingState viewMode={viewMode} pageSize={pageSize} />
        )}

        {loadError && (
          <MediaLoadErrorState error={loadError} onRetry={handleRetry} />
        )}

        {showEmpty && <MediaEmptyState />}

        {paginatedItems.length > 0 && (
          <>
            <ResultsSummary
              currentPage={validCurrentPage}
              pageSize={pageSize}
              totalItems={totalItems}
            />

            {viewMode === 'list' ? (
              <MediaList
                items={paginatedItems}
                gridRef={gridRef}
                gridProps={gridProps}
                getItemProps={getItemProps}
                onActivate={(item) => navigateToMediaItem(navigate, item)}
              />
            ) : (
              <MediaGrid
                items={paginatedItems}
                gridRef={gridRef}
                gridProps={gridProps}
                getItemProps={getItemProps}
              />
            )}

            <PaginationControls
              currentPage={validCurrentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>
    </div>
  )
}
