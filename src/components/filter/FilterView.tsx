/**
 * FilterView - Main media browsing interface.
 * Displays library picker, search, and paginated media grid.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
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

import { AnimatePresence, motion } from 'motion/react'
import type { SessionStore } from '@/stores/session-store'
import { BlurFade } from '@/components/ui/blur-fade'
import { LightRays } from '@/components/ui/light-rays'
import { MediaGridSkeleton } from '@/components/ui/loading-skeleton'
import { Button } from '@/components/ui/button'
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
import { MediaCard } from '@/components/filter/MediaCard'
import { useSessionStore } from '@/stores/session-store'
import { getBestImageUrl } from '@/services/video/api'
import { preloadVibrantColors } from '@/hooks/use-vibrant-color'
import { cn } from '@/lib/utils'
import { getGridColumns } from '@/lib/responsive-utils'
import { COLUMN_BREAKPOINTS } from '@/lib/constants'
import { getNavigationRoute } from '@/lib/navigation-utils'

// Stable selectors to prevent re-renders - defined outside component
const selectPageSize = (state: SessionStore) => state.pageSize
const selectSetSelectedCollectionId = (state: SessionStore) =>
  state.setSelectedCollectionId
const selectSetSearchFilter = (state: SessionStore) => state.setSearchFilter

/** Icon mapping for collection types */
const COLLECTION_ICONS: Record<string, typeof Library> = {
  movie: Film,
  film: Film,
  series: Tv,
  tv: Tv,
  show: Tv,
  music: Mic2,
  artist: Mic2,
}

const getCollectionIcon = (name: string) => {
  const lower = name.toLowerCase()
  return (
    Object.entries(COLLECTION_ICONS).find(([key]) =>
      lower.includes(key),
    )?.[1] ?? Library
  )
}

const GRID_CLASS =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'

/** Subscribe to window resize events */
function subscribeToResize(callback: () => void) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const debouncedCallback = () => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(callback, 150)
  }
  window.addEventListener('resize', debouncedCallback)
  return () => {
    window.removeEventListener('resize', debouncedCallback)
    if (timeoutId) clearTimeout(timeoutId)
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
  // Use individual selectors instead of useShallow to avoid object creation
  const pageSize = useSessionStore(selectPageSize)
  const setSelectedCollectionId = useSessionStore(selectSetSelectedCollectionId)
  const setStoreSearchFilter = useSessionStore(selectSetSearchFilter)

  // Sync URL state to session store for Header and other components
  useEffect(() => {
    setSelectedCollectionId(selectedCollection ?? null)
    setStoreSearchFilter(searchFilter ?? '')
  }, [
    selectedCollection,
    searchFilter,
    setSelectedCollectionId,
    setStoreSearchFilter,
  ])

  const setCurrentPage = useCallback(
    (pageNum: number) => {
      navigate({
        to: '/',
        search: (prev) => ({
          ...prev,
          page: pageNum > 1 ? pageNum : undefined,
        }),
        replace: true,
      })
    },
    [navigate],
  )

  const columns = useGridColumns()

  // Plugin mode and connection state
  const { isPlugin, hasCredentials, isConnected } = usePluginMode()
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen)

  // Fetch collections and items
  const {
    data: collections,
    isLoading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useCollections()
  const {
    data: items,
    isLoading: itemsLoading,
    error: itemsError,
    refetch: refetchItems,
  } = useItems({
    parentId: selectedCollection ?? '',
    nameFilter: searchFilter,
    enabled: !!selectedCollection,
  })

  // Memoize the collection options for the dropdown
  const collectionOptions = useMemo(() => {
    if (!collections) return []
    return collections.map((c) => ({
      id: c.ItemId || '',
      name: c.Name || 'Unknown',
    }))
  }, [collections])

  // Calculate pagination with bounds checking
  const totalItems = items?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages)

  // Get paginated items
  const paginatedItems = useMemo(() => {
    if (!items) return []
    const startIndex = (validCurrentPage - 1) * pageSize
    return items.slice(startIndex, startIndex + pageSize)
  }, [items, validCurrentPage, pageSize])

  // Grid keyboard navigation using the shared hook
  const handleItemActivate = useCallback(
    (index: number) => {
      const item = paginatedItems[index]
      navigate(
        getNavigationRoute(item) as unknown as Parameters<typeof navigate>[0],
      )
    },
    [paginatedItems, navigate],
  )

  const { setFocusedIndex, gridProps, getItemProps, gridRef } =
    useGridKeyboardNavigation({
      itemCount: paginatedItems.length,
      columns,
      enabled: paginatedItems.length > 0,
      onActivate: handleItemActivate,
    })

  // Track URLs already requested for preloading
  const preloadedUrlsRef = useRef(new Set<string>())

  // Clear preload cache when collection changes
  useEffect(() => {
    preloadedUrlsRef.current.clear()
  }, [selectedCollection])

  // Preload vibrant colors for visible items
  useEffect(() => {
    if (paginatedItems.length === 0) return

    // Use AbortController to prevent state updates after unmount
    const controller = new AbortController()

    const timeoutId = setTimeout(() => {
      // Check if aborted before processing
      if (controller.signal.aborted) return

      const imageUrls = paginatedItems
        .map((item) => getBestImageUrl(item, 200))
        .filter(
          (url): url is string => !!url && !preloadedUrlsRef.current.has(url),
        )
      if (imageUrls.length > 0) {
        imageUrls.forEach((url) => preloadedUrlsRef.current.add(url))
        preloadVibrantColors(imageUrls)
      }
    }, 100)

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [paginatedItems])

  // Sync URL page to valid bounds
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages)
  }, [currentPage, totalPages, setCurrentPage])

  // Reset focus when page changes
  useEffect(() => {
    setFocusedIndex(-1)
  }, [validCurrentPage, setFocusedIndex])

  const handleCollectionChange = useCallback(
    (value: string | null) => {
      navigate({
        to: '/',
        search: {
          collection: value ?? undefined,
          page: undefined,
          search: undefined,
        },
        replace: true,
      })
    },
    [navigate],
  )

  const handlePageChange = useCallback(
    (newPage: number) => {
      setCurrentPage(newPage)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [setCurrentPage],
  )

  const handleRetry = useCallback(() => {
    if (collectionsError) refetchCollections()
    else refetchItems()
  }, [collectionsError, refetchCollections, refetchItems])

  const pageNumbers = useMemo(
    () => getPageNumbers(validCurrentPage, totalPages),
    [validCurrentPage, totalPages],
  )

  // Derived state
  const showLoading =
    collectionsLoading ||
    (selectedCollection && !itemsError && itemsLoading && !items)
  const showError = collectionsError || itemsError
  const showEmpty =
    selectedCollection && !itemsLoading && !itemsError && items?.length === 0

  // Not connected state (standalone mode only)
  const showNotConnected = !isPlugin && !hasCredentials && !isConnected

  // Connecting state - only in plugin mode before credentials are processed
  // With immediate trust of plugin credentials, this should rarely show
  const showConnecting = isPlugin && !isConnected

  return (
    <div className="relative px-4 pb-8 sm:px-6">
      <LightRays
        className="fixed inset-0 -z-10"
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
                  <Loader2
                    className="size-12 animate-spin"
                    aria-hidden="true"
                  />
                </EmptyMedia>
                <EmptyTitle className="text-2xl">
                  {t('connection.connecting', {
                    defaultValue: 'Connecting...',
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
            <div className="flex items-center justify-center min-h-[var(--spacing-empty-state-min-height)]">
              <Empty className="border-none bg-transparent">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Library className="size-12" aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle className="text-2xl">
                    {t('items.selectLibrary', {
                      defaultValue: 'Select a Library',
                    })}
                  </EmptyTitle>
                  <EmptyDescription className="text-base">
                    {t('items.selectLibraryDescription', {
                      defaultValue:
                        'Choose a library to browse your media collection',
                    })}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <div
                    className="flex flex-wrap gap-3 justify-center mt-4"
                    role="group"
                    aria-label={t('items.selectLibrary', {
                      defaultValue: 'Select a Library',
                    })}
                  >
                    {collectionOptions.map((collection) => {
                      const Icon = getCollectionIcon(collection.name)
                      return (
                        <Button
                          key={collection.id}
                          variant="secondary"
                          size="lg"
                          className={cn(
                            'gap-3 min-w-[var(--spacing-library-button-min)] h-14',
                            'rounded-2xl text-base font-medium',
                            'border border-border/50',
                            'transition-all duration-200',
                            'hover:scale-[1.02] active:scale-[0.98]',
                          )}
                          onClick={() => handleCollectionChange(collection.id)}
                          aria-label={t('items.selectLibraryButton', {
                            name: collection.name,
                            defaultValue: `Browse ${collection.name} library`,
                          })}
                        >
                          <Icon className="size-5" aria-hidden="true" />
                          {collection.name}
                        </Button>
                      )
                    })}
                  </div>
                </EmptyContent>
              </Empty>
            </div>
          )}

        {/* Loading State */}
        <AnimatePresence mode="wait">
          {showLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MediaGridSkeleton count={pageSize} gridClassName={GRID_CLASS} />
            </motion.div>
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
                  start: (validCurrentPage - 1) * pageSize + 1,
                  end: Math.min(validCurrentPage * pageSize, totalItems),
                  total: totalItems,
                  defaultValue: `Showing ${(validCurrentPage - 1) * pageSize + 1}-${Math.min(validCurrentPage * pageSize, totalItems)} of ${totalItems}`,
                })}
              </p>
            </div>

            <div
              ref={gridRef}
              className={GRID_CLASS}
              {...gridProps}
              aria-label={t('items.mediaGrid', {
                defaultValue: 'Media items',
              })}
            >
              {paginatedItems.map((item, index) => (
                <BlurFade
                  key={item.Id}
                  delay={0.04 + index * 0.03}
                  direction="up"
                >
                  <MediaCard
                    item={item}
                    index={index}
                    {...getItemProps(index)}
                  />
                </BlurFade>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-10">
                <Pagination>
                  <PaginationContent className="gap-2">
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() =>
                          handlePageChange(Math.max(1, validCurrentPage - 1))
                        }
                        aria-disabled={validCurrentPage === 1}
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
                        <PaginationItem key={`ellipsis-${idx}`}>
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
                        onClick={() =>
                          handlePageChange(
                            Math.min(totalPages, validCurrentPage + 1),
                          )
                        }
                        aria-disabled={validCurrentPage === totalPages}
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

export default FilterView
