import {
  useEffect,
  useRef,
  startTransition,
  useState,
  useSyncExternalStore,
} from 'react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Unplug,
} from 'lucide-react'
import type { BaseItemDto } from '@/types/jellyfin'
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
import { useCollections, useItems } from '@/services/items/queries'
import { usePluginMode } from '@/hooks/use-connection-init'
import { useGridKeyboardNavigation } from '@/hooks/use-grid-keyboard-navigation'
import { useVirtualWindow } from '@/hooks/use-virtual-window'
import { preloadVibrantColors } from '@/hooks/use-vibrant-color'
import { MediaCard } from '@/components/filter/MediaCard'
import { MediaListRow } from '@/components/filter/MediaListRow'
import { MediaListSkeleton } from '@/components/filter/MediaListSkeleton'
import { LibraryPicker } from '@/components/filter/LibraryPicker'
import { PaginationControls } from '@/components/filter/PaginationControls'
import { useSessionStore } from '@/stores/session-store'
import { getBestImageUrl } from '@/services/video/api'
import { getGridColumns } from '@/lib/responsive-utils'
import { COLUMN_BREAKPOINTS } from '@/lib/constants'
import { navigateToMediaItem } from '@/lib/navigation-utils'
import { getMediaItemLabel } from '@/components/filter/media-item-label'

const selectPageSize = (state: ReturnType<typeof useSessionStore.getState>) =>
  state.pageSize

const selectViewMode = (state: ReturnType<typeof useSessionStore.getState>) =>
  state.viewMode

const selectSetSettingsOpen = (
  state: ReturnType<typeof useSessionStore.getState>,
) => state.setSettingsOpen

const GRID_CLASS =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'
const VIRTUALIZED_GRID_THRESHOLD = 180
const GRID_ROW_ESTIMATE_PX = 360
const GRID_OVERSCAN_ROWS = 3
const LIST_CLASS = 'flex flex-col gap-3'

const EMPTY_ITEMS: Array<BaseItemDto> = []

function subscribeToResize(callback: () => void) {
  let frameId: number | null = null
  const onResize = () => {
    if (frameId !== null) return
    frameId = requestAnimationFrame(() => {
      frameId = null
      callback()
    })
  }
  window.addEventListener('resize', onResize)
  return () => {
    window.removeEventListener('resize', onResize)
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
    }
  }
}

function getColumnsSnapshot() {
  return getGridColumns(window.innerWidth)
}

function getServerColumnsSnapshot() {
  return COLUMN_BREAKPOINTS.default
}

function useGridColumns(): number {
  return useSyncExternalStore(
    subscribeToResize,
    getColumnsSnapshot,
    getServerColumnsSnapshot,
  )
}

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

export default function FilterView() {
  return useRenderFilterView()
}

function useRenderFilterView() {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: '/' })

  const {
    collection: selectedCollection,
    page,
    search: searchFilter,
  } = routeApi.useSearch()
  const currentPage = page ?? 1

  const pageSize = useSessionStore(selectPageSize)
  const viewMode = useSessionStore(selectViewMode)
  const effectivePageSize =
    Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 240 ? pageSize : 24
  const requestedPage = Math.max(1, currentPage)
  const startIndex = (requestedPage - 1) * effectivePageSize

  const columns = useGridColumns()
  const navigationColumns = viewMode === 'list' ? 1 : columns

  const { isPlugin, hasCredentials, isConnected } = usePluginMode()
  const setSettingsOpen = useSessionStore(selectSetSettingsOpen)

  const {
    data: collections,
    isLoading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useCollections()
  const {
    data: itemsData,
    isLoading: itemsLoading,
    error: itemsError,
    refetch: refetchItems,
  } = useItems({
    parentId: selectedCollection ?? '',
    nameFilter: searchFilter,
    limit: effectivePageSize,
    startIndex,
    includeMediaStreams: false,
    enabled: !!selectedCollection,
  })

  const totalItems = itemsData?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize))
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages)

  const paginatedItems = itemsData?.items ?? EMPTY_ITEMS
  const shouldVirtualizeGrid =
    viewMode === 'card' && paginatedItems.length > VIRTUALIZED_GRID_THRESHOLD
  const [virtualizedGridElement, setVirtualizedGridElement] =
    useState<HTMLDivElement | null>(null)
  const rowCount = Math.ceil(paginatedItems.length / columns)
  const { totalSize: totalVirtualGridHeight, indexes: virtualRowIndexes } =
    useVirtualWindow({
      enabled: shouldVirtualizeGrid,
      scrollElement: virtualizedGridElement,
      itemCount: rowCount,
      itemSize: GRID_ROW_ESTIMATE_PX,
      overscan: GRID_OVERSCAN_ROWS,
    })

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

  const handleScrollToIndex = (index: number) => {
    const container = virtualizedGridElement
    if (!container) return
    const rowIndex = Math.floor(index / columns)
    const targetScrollTop = rowIndex * GRID_ROW_ESTIMATE_PX
    container.scrollTo({ top: targetScrollTop, behavior: 'auto' })
  }

  const { setFocusedIndex, gridProps, getItemProps, gridRef } =
    useGridKeyboardNavigation({
      itemCount: paginatedItems.length,
      columns: navigationColumns,
      enabled: paginatedItems.length > 0,
      onActivate: handleItemActivate,
      onScrollToIndex: shouldVirtualizeGrid ? handleScrollToIndex : undefined,
    })

  const setVirtualizedGridRef = (node: HTMLDivElement | null) => {
    setVirtualizedGridElement((currentElement) =>
      currentElement === node ? currentElement : node,
    )
    gridRef.current = node
  }

  const preloadedUrlsRef = useRef<Set<string> | null>(null)
  if (preloadedUrlsRef.current === null) {
    preloadedUrlsRef.current = new Set<string>()
  }

  useEffect(() => {
    preloadedUrlsRef.current?.clear()
  }, [selectedCollection])

  useEffect(() => {
    if (paginatedItems.length === 0) return

    const maxPreloadCount = Math.min(paginatedItems.length, columns)

    const preloadVisibleColors = () => {
      const preloadedUrls = preloadedUrlsRef.current
      if (preloadedUrls === null) return

      const imageUrls: Array<string> = []

      for (let index = 0; index < maxPreloadCount; index++) {
        const item = paginatedItems[index]

        const url = getBestImageUrl(item, 200)
        if (!url || preloadedUrls.has(url)) continue

        preloadedUrls.add(url)
        imageUrls.push(url)
      }

      if (imageUrls.length > 0) {
        preloadVibrantColors(imageUrls)
      }
    }

    const timeoutId = setTimeout(preloadVisibleColors, 250)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [paginatedItems, columns])

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
    if (collectionsError) void refetchCollections()
    else void refetchItems()
  }

  const showLoading =
    collectionsLoading ||
    Boolean(selectedCollection && !itemsError && itemsLoading && !itemsData)
  const showError = collectionsError || itemsError
  const showEmpty = Boolean(
    selectedCollection && !itemsLoading && !itemsError && totalItems === 0,
  )

  const showNotConnected = !isPlugin && !hasCredentials && !isConnected

  const showConnecting = isPlugin && !isConnected

  return (
    <div className="relative px-4 pb-8 sm:px-6">
      <div className="max-w-7xl mx-auto">
        {showNotConnected && (
          <div className="flex items-center justify-center min-h-[var(--spacing-empty-state-min-height)]">
            <Empty className="border-none bg-transparent">
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
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings2 className="size-5" aria-hidden="true" />
                  {t('connection.openSettings', {
                    defaultValue: 'Open Settings',
                  })}
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        )}

        {showConnecting && (
          <div className="flex items-center justify-center min-h-[var(--spacing-empty-state-min-height)]">
            <Empty className="border-none bg-transparent">
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
            </Empty>
          </div>
        )}

        {!showNotConnected &&
          !showConnecting &&
          !selectedCollection &&
          !collectionsLoading &&
          !collectionsError && (
            <LibraryPicker
              collections={collections}
              onCollectionChange={handleCollectionChange}
            />
          )}

        {showLoading && (
          <div className="animate-in fade-in duration-200">
            {viewMode === 'list' ? (
              <MediaListSkeleton
                count={Math.min(effectivePageSize, 12)}
                loadingLabel={t('items.loadingMediaItems', {
                  defaultValue: 'Loading media items',
                })}
              />
            ) : (
              <MediaGridSkeleton
                count={Math.min(effectivePageSize, 24)}
                className={GRID_CLASS}
              />
            )}
          </div>
        )}

        {showError && (
          <div
            className="flex flex-col items-center justify-center py-16 gap-4"
            role="alert"
            aria-live="assertive"
          >
            <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle
                className="size-8 text-destructive"
                aria-hidden="true"
              />
            </div>
            <p className="text-destructive text-center text-lg">
              {showError.message}
            </p>
            <Button
              variant="secondary"
              size="lg"
              className="rounded-full px-6"
              onClick={handleRetry}
            >
              <RefreshCw className="size-4 mr-2" aria-hidden="true" />
              {t('common.retry')}
            </Button>
          </div>
        )}

        {showEmpty && (
          <output
            className="flex flex-col items-center justify-center py-16 text-center"
            aria-live="polite"
          >
            <div className="size-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <Search
                className="size-10 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <p className="text-muted-foreground text-lg">
              {t('items.noItems', { defaultValue: 'No items found' })}
            </p>
          </output>
        )}

        {paginatedItems.length > 0 && (
          <>
            <div className="flex justify-between items-center mb-6">
              <p
                className="text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {t('items.showing', {
                  start: (validCurrentPage - 1) * effectivePageSize + 1,
                  end: Math.min(
                    validCurrentPage * effectivePageSize,
                    totalItems,
                  ),
                  total: totalItems,
                  defaultValue: `Showing ${(validCurrentPage - 1) * effectivePageSize + 1}-${Math.min(validCurrentPage * effectivePageSize, totalItems)} of ${totalItems}`,
                })}
              </p>
            </div>

            {viewMode === 'list' ? (
              <div
                ref={gridRef}
                className={LIST_CLASS}
                {...gridProps}
                aria-label={t('items.mediaList', {
                  defaultValue: 'Media items',
                })}
              >
                {paginatedItems.map((item, index) => (
                  <MediaListRow
                    key={item.Id}
                    item={item}
                    index={index}
                    label={getMediaItemLabel(t, item)}
                    onActivate={() => navigateToMediaItem(navigate, item)}
                    interactiveProps={getItemProps(index)}
                  />
                ))}
              </div>
            ) : shouldVirtualizeGrid ? (
              <div
                ref={setVirtualizedGridRef}
                {...gridProps}
                aria-rowcount={rowCount}
                aria-label={t('items.mediaGrid', {
                  defaultValue: 'Media items',
                })}
                className="max-h-[72vh] overflow-auto overscroll-contain pr-1"
              >
                <div
                  style={{
                    height: totalVirtualGridHeight,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualRowIndexes.map((rowIndex) => {
                    const rowStartIndex = rowIndex * columns
                    const rowItems = paginatedItems.slice(
                      rowStartIndex,
                      rowStartIndex + columns,
                    )

                    return (
                      <div
                        key={`grid-row-${rowIndex}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          width: '100%',
                          transform: `translateY(${rowIndex * GRID_ROW_ESTIMATE_PX}px)`,
                        }}
                      >
                        <div className={GRID_CLASS}>
                          {rowItems.map((item, columnIndex) => {
                            const index = rowStartIndex + columnIndex
                            return (
                              <MediaCard
                                key={item.Id}
                                item={item}
                                index={index}
                                {...getItemProps(index)}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div
                ref={gridRef}
                className={GRID_CLASS}
                {...gridProps}
                aria-label={t('items.mediaGrid', {
                  defaultValue: 'Media items',
                })}
              >
                {paginatedItems.map((item, index) => (
                  <div
                    key={item.Id}
                    style={{
                      contentVisibility: 'auto',
                      containIntrinsicSize: '0 320px',
                    }}
                  >
                    <MediaCard
                      item={item}
                      index={index}
                      {...getItemProps(index)}
                    />
                  </div>
                ))}
              </div>
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
