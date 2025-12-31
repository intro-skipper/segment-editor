/**
 * FilterView component for browsing media collections.
 * Displays a collection dropdown, search input, pagination, and responsive media grid.
 * Requirements: 2.1, 2.2, 2.3
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Film,
  Library,
  Mic2,
  RefreshCw,
  Search,
  Tv,
} from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
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
import { MediaCard } from '@/components/filter/MediaCard'
import { useSessionStore } from '@/stores/session-store'

/** Available page size options */
const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

/** Get icon for collection type based on name */
function getCollectionIcon(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('movie') || lowerName.includes('film')) {
    return Film
  }
  if (
    lowerName.includes('series') ||
    lowerName.includes('tv') ||
    lowerName.includes('show')
  ) {
    return Tv
  }
  if (lowerName.includes('music') || lowerName.includes('artist')) {
    return Mic2
  }
  return Library
}

/**
 * Skeleton loader for media cards.
 * Displays a placeholder while media items are loading.
 */
function MediaCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}

/**
 * Grid of skeleton loaders for the media grid.
 */
function MediaGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <MediaCardSkeleton key={index} />
      ))}
    </div>
  )
}

/**
 * Generate page numbers to display with ellipsis for large page counts.
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number,
): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: Array<number | 'ellipsis'> = []

  // Always show first page
  pages.push(1)

  if (currentPage > 3) {
    pages.push('ellipsis')
  }

  // Show pages around current
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (currentPage < totalPages - 2) {
    pages.push('ellipsis')
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages)
  }

  return pages
}

/**
 * FilterView provides the main browsing interface for media collections.
 * Users can select a collection, filter by name, and view items in a paginated grid.
 */
export function FilterView() {
  const { t } = useTranslation()
  const selectedCollection = useSessionStore(
    (state) => state.selectedCollectionId,
  )
  const setSelectedCollection = useSessionStore(
    (state) => state.setSelectedCollectionId,
  )
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(24)

  // Fetch collections from the server
  const {
    data: collections,
    isLoading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useCollections()

  // Fetch items for the selected collection with name filtering
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
    return collections.map((collection) => ({
      id: collection.ItemId || '',
      name: collection.Name || 'Unknown',
    }))
  }, [collections])

  // Calculate pagination
  const totalItems = items?.length ?? 0
  const totalPages = Math.ceil(totalItems / pageSize)

  // Get paginated items
  const paginatedItems = useMemo(() => {
    if (!items) return []
    const startIndex = (currentPage - 1) * pageSize
    return items.slice(startIndex, startIndex + pageSize)
  }, [items, currentPage, pageSize])

  // Reset to page 1 when filter/collection changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCollection, searchFilter, pageSize])

  const handleCollectionChange = (value: string | null) => {
    setSelectedCollection(value)
    setSearchFilter('')
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchFilter(e.target.value)
  }

  const handlePageSizeChange = (value: string | null) => {
    if (value) {
      setPageSize(Number(value) as PageSize)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // Scroll to top of content area
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Get display text for the selected collection
  const selectedCollectionName = useMemo(() => {
    if (!selectedCollection) return null
    const collection = collectionOptions.find(
      (c) => c.id === selectedCollection,
    )
    return collection?.name
  }, [selectedCollection, collectionOptions])

  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <div className="flex flex-col h-full">
      {/* Filter Controls */}
      <div className="p-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex flex-col sm:flex-row gap-3 max-w-7xl mx-auto">
          {/* Collection Dropdown */}
          <div className="flex items-center gap-2 min-w-[200px]">
            <Library className="size-4 text-muted-foreground shrink-0" />
            <Select
              value={selectedCollection}
              onValueChange={handleCollectionChange}
              disabled={collectionsLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedCollectionName || t('items.filter.collection')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {collectionOptions.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder={t('items.filter.name')}
              value={searchFilter}
              onChange={handleSearchChange}
              disabled={!selectedCollection}
              className="w-full"
            />
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t('items.perPage', { defaultValue: 'Per page' })}:
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={handlePageSizeChange}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-7xl mx-auto">
          {/* Library Picker - shown when no collection selected */}
          {!selectedCollection && !collectionsLoading && !collectionsError && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <Empty className="border-none">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Library />
                  </EmptyMedia>
                  <EmptyTitle>
                    {t('items.selectLibrary', {
                      defaultValue: 'Select a Library',
                    })}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t('items.selectLibraryDescription', {
                      defaultValue:
                        'Choose a library to browse your media collection',
                    })}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {collectionOptions.map((collection) => {
                      const Icon = getCollectionIcon(collection.name)
                      return (
                        <Button
                          key={collection.id}
                          variant="outline"
                          size="lg"
                          className="gap-2 min-w-[140px]"
                          onClick={() => handleCollectionChange(collection.id)}
                        >
                          <Icon className="size-4" />
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
          {(collectionsLoading || (selectedCollection && itemsLoading)) && (
            <MediaGridSkeleton count={pageSize} />
          )}

          {/* Error State */}
          {(collectionsError || itemsError) && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertCircle className="size-12 text-destructive/70" />
              <p className="text-destructive text-center">
                {collectionsError?.message || itemsError?.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (collectionsError) {
                    refetchCollections()
                  } else {
                    refetchItems()
                  }
                }}
              >
                <RefreshCw className="size-4 mr-2" />
                {t('common.retry')}
              </Button>
            </div>
          )}

          {/* Empty State */}
          {selectedCollection &&
            !itemsLoading &&
            items &&
            items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="size-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No items found</p>
              </div>
            )}

          {/* Media Grid */}
          {paginatedItems.length > 0 && (
            <>
              {/* Item count */}
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">
                  {t('items.showing', {
                    start: (currentPage - 1) * pageSize + 1,
                    end: Math.min(currentPage * pageSize, totalItems),
                    total: totalItems,
                    defaultValue: `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalItems)} of ${totalItems}`,
                  })}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {paginatedItems.map((item) => (
                  <MediaCard key={item.Id} item={item} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() =>
                            handlePageChange(Math.max(1, currentPage - 1))
                          }
                          aria-disabled={currentPage === 1}
                          className={
                            currentPage === 1
                              ? 'pointer-events-none opacity-50'
                              : 'cursor-pointer'
                          }
                        />
                      </PaginationItem>

                      {pageNumbers.map((page, index) =>
                        page === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${index}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => handlePageChange(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        ),
                      )}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            handlePageChange(
                              Math.min(totalPages, currentPage + 1),
                            )
                          }
                          aria-disabled={currentPage === totalPages}
                          className={
                            currentPage === totalPages
                              ? 'pointer-events-none opacity-50'
                              : 'cursor-pointer'
                          }
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
    </div>
  )
}

export default FilterView
