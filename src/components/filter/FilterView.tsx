/**
 * FilterView - Main media browsing interface.
 * Displays library picker, search, and paginated media grid.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Film,
  Library,
  Loader2,
  Mic2,
  RefreshCw,
  Search,
  Settings2,
  Tv,
  Unplug,
} from 'lucide-react'

import { AnimatePresence, m, useIsPresent } from 'motion/react'
import type { ReactNode } from 'react'
import { LightRays } from '@/components/ui/light-rays'
import { MediaGridSkeleton } from '@/components/ui/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Freeze } from '@/components/ui/freeze'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useCollections } from '@/hooks/queries/use-collections'
import { useItems } from '@/hooks/queries/use-items'
import { usePluginMode } from '@/hooks/use-connection-init'
import { useGridKeyboardNavigation } from '@/hooks/use-grid-keyboard-navigation'
import { useVirtualWindow } from '@/hooks/use-virtual-window'
import { MediaCard } from '@/components/filter/MediaCard'
import { LibraryCard } from '@/components/filter/LibraryCard'
import { useSessionStore } from '@/stores/session-store'
import { getBestImageUrl } from '@/services/video/api'
import { preloadVibrantColors } from '@/hooks/use-vibrant-color'
import { cn } from '@/lib/utils'
import { getGridColumns } from '@/lib/responsive-utils'
import { COLUMN_BREAKPOINTS } from '@/lib/constants'
import { navigateToMediaItem } from '@/lib/navigation-utils'

// Stable selectors to prevent re-renders - defined outside component
const selectPageSize = (state: ReturnType<typeof useSessionStore.getState>) =>
  state.pageSize

const selectSetSettingsOpen = (
  state: ReturnType<typeof useSessionStore.getState>,
) => state.setSettingsOpen

/** O(1) icon lookup by collection keyword */
const COLLECTION_ICON_MAP = new Map<string, typeof Library>([
  ['movie', Film],
  ['film', Film],
  ['series', Tv],
  ['tv', Tv],
  ['show', Tv],
  ['music', Mic2],
  ['artist', Mic2],
])

const getCollectionIcon = (name: string) => {
  const lower = name.toLowerCase()
  for (const [key, icon] of COLLECTION_ICON_MAP) {
    if (lower.includes(key)) return icon
  }
  return Library
}

const GRID_CLASS =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'
const COLOR_PRELOAD_ROWS = 1
const VIRTUALIZED_GRID_THRESHOLD = 180
const GRID_ROW_ESTIMATE_PX = 360
const GRID_OVERSCAN_ROWS = 3

interface FreezeOnExitProps {
  children: ReactNode
}

function FreezeOnExit({ children }: FreezeOnExitProps) {
  const isPresent = useIsPresent()

  return <Freeze frozen={!isPresent}>{children}</Freeze>
}

/** Subscribe to window resize events */
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

/** Get current column count snapshot */
function getColumnsSnapshot() {
  return typeof window !== 'undefined'
    ? getGridColumns(window.innerWidth)
    : COLUMN_BREAKPOINTS.default
}

/** Server snapshot for SSR */
function getServerColumnsSnapshot() {
  return COLUMN_BREAKPOINTS.default
}

/** Hook to get current column count based on viewport width using useSyncExternalStore */
function useGridColumns(): number {
  return useSyncExternalStore(
    subscribeToResize,
    getColumnsSnapshot,
    getServerColumnsSnapshot,
  )
}

/** Builds the middle section of page numbers with ellipsis */
function buildMiddlePages(
  current: number,
  total: number,
): Array<number | 'ellipsis'> {
  const pages: Array<number | 'ellipsis'> = []
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  if (current > 3) pages.push('ellipsis')
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('ellipsis')

  return pages
}

function getPageNumbers(
  current: number,
  total: number,
): Array<number | 'ellipsis'> {
  // For small page counts, show all pages
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  // For larger counts, show first, middle section with ellipsis, and last
  const pages: Array<number | 'ellipsis'> = [1]
  pages.push(...buildMiddlePages(current, total))
  if (total > 1) pages.push(total)

  return pages
}

const routeApi = getRouteApi('/')

/**
 * FilterView provides the main browsing interface for media collections.
 * Users can select a collection, filter by name, and view items in a paginated grid.
 * State is stored in URL search params for shareability.
 */
export function FilterView() {
  return useRenderFilterView()
}

function useRenderFilterView() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Get URL search params for shareable state
  const {
    collection: selectedCollection,
    page,
    search: searchFilter,
  } = routeApi.useSearch()
  const currentPage = page ?? 1

  // Page size is kept in session store as it's a user preference
  // Use individual selector to avoid object creation
  const pageSize = useSessionStore(selectPageSize)
  const effectivePageSize =
    Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 240 ? pageSize : 24
  const requestedPage = Math.max(1, currentPage)
  const startIndex = (requestedPage - 1) * effectivePageSize

  const setCurrentPage = (pageNum: number) => {
    navigate({
      to: '/',
      search: (prev) => ({
        ...prev,
        page: pageNum > 1 ? pageNum : undefined,
      }),
      replace: true,
    })
  }

  const columns = useGridColumns()

  // Plugin mode and connection state
  const { isPlugin, hasCredentials, isConnected } = usePluginMode()
  const setSettingsOpen = useSessionStore(selectSetSettingsOpen)

  // Fetch collections and items
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

  // Calculate pagination with bounds checking
  const totalItems = itemsData?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize))
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages)

  const paginatedItems = itemsData?.items ?? []
  const shouldVirtualizeGrid =
    paginatedItems.length > VIRTUALIZED_GRID_THRESHOLD
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
      setCurrentPage(validCurrentPage)
    }
  }, [currentPage, validCurrentPage, setCurrentPage])

  // Grid keyboard navigation using the shared hook
  const handleItemActivate = (index: number) => {
    const item = paginatedItems.at(index)
    if (item === undefined) return
    navigateToMediaItem(navigate, item)
  }

  // Scroll a virtualized grid item into view by programmatically scrolling
  // the container. The hook will retry focus after the element renders.
  const handleScrollToIndex = (index: number) => {
    const container = virtualizedGridElement
    if (!container) return
    const rowIndex = Math.floor(index / columns)
    const targetScrollTop = rowIndex * GRID_ROW_ESTIMATE_PX
    container.scrollTo({ top: targetScrollTop, behavior: 'instant' })
  }

  const { setFocusedIndex, gridProps, getItemProps, gridRef } =
    useGridKeyboardNavigation({
      itemCount: paginatedItems.length,
      columns,
      enabled: paginatedItems.length > 0,
      onActivate: handleItemActivate,
      onScrollToIndex: shouldVirtualizeGrid ? handleScrollToIndex : undefined,
    })

  // Merged ref callback: sets both the virtualizer scroll element and the
  // grid keyboard navigation ref so both systems work on the same DOM node.
  const setVirtualizedGridRef = (node: HTMLDivElement | null) => {
    setVirtualizedGridElement(node)
    gridRef.current = node
  }

  // Track URLs already requested for preloading
  const preloadedUrlsRef = useRef(new Set<string>())

  // Clear preload cache when collection changes
  useEffect(() => {
    preloadedUrlsRef.current.clear()
  }, [selectedCollection])

  // Preload vibrant colors for above-the-fold items only
  useEffect(() => {
    if (paginatedItems.length === 0) return

    const maxPreloadCount = Math.min(
      paginatedItems.length,
      Math.max(columns * COLOR_PRELOAD_ROWS, columns),
    )

    const preloadVisibleColors = () => {
      const imageUrls: Array<string> = []

      for (let index = 0; index < maxPreloadCount; index++) {
        const item = paginatedItems[index]

        const url = getBestImageUrl(item, 200)
        if (!url || preloadedUrlsRef.current.has(url)) continue

        imageUrls.push(url)
      }

      if (imageUrls.length > 0) {
        imageUrls.forEach((url) => preloadedUrlsRef.current.add(url))
        preloadVibrantColors(imageUrls)
      }
    }

    let timeoutId: number | null = null
    let idleId: number | null = null

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(preloadVisibleColors, {
        timeout: 250,
      })
    } else {
      timeoutId = window.setTimeout(preloadVisibleColors, 100)
    }

    return () => {
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [paginatedItems, columns])

  const handleCollectionChange = (value: string | null) => {
    setFocusedIndex(-1)
    navigate({
      to: '/',
      search: {
        collection: value ?? undefined,
        page: undefined,
        search: undefined,
      },
      replace: true,
    })
  }

  const handlePageChange = (newPage: number) => {
    setFocusedIndex(-1)
    setCurrentPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleRetry = () => {
    if (collectionsError) refetchCollections()
    else refetchItems()
  }

  const pageNumbers = getPageNumbers(validCurrentPage, totalPages)

  // Derived state
  const showLoading =
    collectionsLoading ||
    (selectedCollection && !itemsError && itemsLoading && !itemsData)
  const showError = collectionsError || itemsError
  const showEmpty =
    selectedCollection && !itemsLoading && !itemsError && totalItems === 0

  // Not connected state (standalone mode only)
  const showNotConnected = !isPlugin && !hasCredentials && !isConnected

  // Connecting state - only in plugin mode before credentials are processed
  // With immediate trust of plugin credentials, this should rarely show
  const showConnecting = isPlugin && !isConnected

  return (
    <div className="relative px-4 pb-8 sm:px-6">
      <LightRays
        className="fixed inset-0 z-0"
        count={5}
        color="rgba(120, 180, 255, 0.15)"
        blur={48}
        speed={18}
        length="60vh"
      />
      <div className="max-w-7xl mx-auto">
        {/* Not Connected State - standalone mode without credentials */}
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

        {/* Connecting State - plugin mode waiting for credentials */}
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

        {/* Library Picker - shown when no collection selected */}
        {!showNotConnected &&
          !showConnecting &&
          !selectedCollection &&
          !collectionsLoading &&
          !collectionsError && (
            <div className="flex items-center justify-center py-8">
              <div className="w-full max-w-6xl">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center size-16 rounded-full bg-primary/10 mb-4">
                    <Library
                      className="size-8 text-secondary"
                      aria-hidden="true"
                    />
                  </div>
                  <h2 className="text-2xl font-semibold mb-2">
                    {t('items.selectLibrary', {
                      defaultValue: 'Select a Library',
                    })}
                  </h2>
                  <p className="text-base text-muted-foreground">
                    {t('items.selectLibraryDescription', {
                      defaultValue:
                        'Choose a library to browse your media collection',
                    })}
                  </p>
                </div>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6"
                  role="group"
                  aria-label={t('items.selectLibrary', {
                    defaultValue: 'Select a Library',
                  })}
                >
                  {collections?.map((collection, index) => {
                    const Icon = getCollectionIcon(collection.Name || '')
                    return (
                      <LibraryCard
                        key={collection.ItemId}
                        collection={collection}
                        Icon={Icon}
                        onSelect={handleCollectionChange}
                        index={index}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          )}

        {/* Loading State */}
        <AnimatePresence mode="wait">
          {showLoading && (
            <m.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <FreezeOnExit>
                <MediaGridSkeleton
                  count={Math.min(effectivePageSize, 24)}
                  gridClassName={GRID_CLASS}
                />
              </FreezeOnExit>
            </m.div>
          )}
        </AnimatePresence>

        {/* Error State */}
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
              {collectionsError?.message || itemsError?.message}
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

        {/* Empty State */}
        {showEmpty && (
          <div
            className="flex flex-col items-center justify-center py-16 text-center"
            role="status"
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
          </div>
        )}

        {/* Media Grid */}
        {paginatedItems.length > 0 && (
          <>
            {/* Item count with aria-live for screen readers */}
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

            {shouldVirtualizeGrid ? (
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
                        role="row"
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-10">
                <Pagination>
                  <PaginationContent className="gap-2">
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={
                          validCurrentPage === 1
                            ? undefined
                            : () =>
                                handlePageChange(
                                  Math.max(1, validCurrentPage - 1),
                                )
                        }
                        aria-disabled={validCurrentPage === 1}
                        tabIndex={validCurrentPage === 1 ? -1 : undefined}
                        aria-label={t('accessibility.pagination.previous')}
                        className={cn(
                          'rounded-full',
                          validCurrentPage === 1
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer',
                        )}
                      />
                    </PaginationItem>

                    {pageNumbers.map((pageNum, idx) =>
                      pageNum === 'ellipsis' ? (
                        <PaginationItem
                          key={`ellipsis-${String(pageNumbers[idx - 1] ?? 'start')}-${String(pageNumbers[idx + 1] ?? 'end')}`}
                        >
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => handlePageChange(pageNum)}
                            isActive={validCurrentPage === pageNum}
                            aria-label={t('accessibility.pagination.page', {
                              page: pageNum,
                            })}
                            aria-current={
                              validCurrentPage === pageNum ? 'page' : undefined
                            }
                            className={cn(
                              'cursor-pointer rounded-full',
                              validCurrentPage === pageNum &&
                                'bg-primary text-primary-foreground',
                            )}
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}

                    <PaginationItem>
                      <PaginationNext
                        onClick={
                          validCurrentPage === totalPages
                            ? undefined
                            : () =>
                                handlePageChange(
                                  Math.min(totalPages, validCurrentPage + 1),
                                )
                        }
                        aria-disabled={validCurrentPage === totalPages}
                        tabIndex={
                          validCurrentPage === totalPages ? -1 : undefined
                        }
                        aria-label={t('accessibility.pagination.next')}
                        className={cn(
                          'rounded-full',
                          validCurrentPage === totalPages
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer',
                        )}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
