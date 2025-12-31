import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Home, Scissors, Search, Settings, X } from 'lucide-react'
import { useShallow } from 'zustand/shallow'

import type { BaseItemDto } from '@/types/jellyfin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { useSessionStore } from '@/stores/session-store'
import { useCollections } from '@/hooks/queries/use-collections'
import { useAllEpisodes, useItem, useItems } from '@/hooks/queries/use-items'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

type PageType = 'home' | 'player' | 'album' | 'artist' | 'series'

interface QuickSwitchProps {
  itemId: string
  currentItemName: string
  isEpisode: boolean
  seriesId: string | null | undefined
  selectedCollection: string | null
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Determine page type from pathname */
function getPageType(pathname: string): PageType {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/player/')) return 'player'
  if (pathname.startsWith('/album/')) return 'album'
  if (pathname.startsWith('/artist/')) return 'artist'
  if (pathname.startsWith('/series/')) return 'series'
  return 'home'
}

/** Format episode label (S1E2 format) */
function formatEpisodeLabel(item: BaseItemDto | null): string | null {
  if (!item) return null
  const { ParentIndexNumber: season, IndexNumber: episode, Name: name } = item

  if (season !== undefined && episode !== undefined) {
    const label = `S${season}E${episode}`
    return name && !name.toLowerCase().startsWith('episode')
      ? `${label} ${name}`
      : label
  }
  return name || null
}

/** Format item for combobox display */
function formatComboboxItem(item: BaseItemDto, isEpisode: boolean): string {
  if (isEpisode && item.Type === 'Episode') {
    const { ParentIndexNumber: s, IndexNumber: e, Name } = item
    if (s !== undefined && e !== undefined) {
      return `S${s}E${e} ${Name || ''}`
    }
  }
  return item.Name || ''
}

/** Get route for item type */
function getItemRoute(itemType: string | undefined): string {
  switch (itemType?.toLowerCase()) {
    case 'series':
      return '/series/$itemId'
    case 'musicalbum':
    case 'album':
      return '/album/$itemId'
    case 'musicartist':
      return '/artist/$itemId'
    default:
      return '/player/$itemId'
  }
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Quick switch combobox - isolated to prevent parent re-renders */
const QuickSwitch = memo(function QuickSwitch({
  itemId,
  currentItemName,
  isEpisode,
  seriesId,
  selectedCollection,
}: QuickSwitchProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Only fetch when dropdown is open (lazy loading)
  const { data: episodeItems, isLoading: loadingEpisodes } = useAllEpisodes(
    seriesId ?? '',
    { enabled: open && !!seriesId && isEpisode },
  )

  const { data: collectionItems, isLoading: loadingCollection } = useItems({
    parentId: selectedCollection ?? '',
    enabled: open && !!selectedCollection && !isEpisode,
  })

  const items = isEpisode ? episodeItems : collectionItems
  const isLoading = isEpisode ? loadingEpisodes : loadingCollection

  // Memoized filtered items
  const filteredItems = useMemo(() => {
    if (!items) return []
    if (!search.trim()) return items.slice(0, 30)
    const lowerSearch = search.toLowerCase()
    return items
      .filter((item) => item.Name?.toLowerCase().includes(lowerSearch))
      .slice(0, 30)
  }, [items, search])

  const handleSelect = useCallback(
    (newItemId: string | null) => {
      if (!newItemId || !items) return
      const item = items.find((i) => i.Id === newItemId)
      if (!item) return

      if (isEpisode) {
        navigate({
          to: '/player/$itemId',
          params: { itemId: newItemId },
          search: { fetchSegments: 'true' },
        })
      } else {
        navigate({
          to: getItemRoute(item.Type),
          params: { itemId: newItemId },
        })
      }
      setOpen(false)
      setSearch('')
    },
    [items, isEpisode, navigate],
  )

  return (
    <Combobox
      open={open}
      onOpenChange={setOpen}
      value={itemId}
      onValueChange={handleSelect}
    >
      <ComboboxInput
        placeholder={currentItemName}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        showTrigger
        showClear={false}
        className="h-7 w-auto min-w-[100px] max-w-[140px] sm:max-w-[200px] text-sm border-none bg-transparent hover:bg-accent/50 rounded-md transition-colors [&_input]:text-foreground [&_input]:placeholder:text-foreground [&_input]:font-normal"
      />
      <ComboboxContent className="w-[300px]">
        <ComboboxList>
          {isLoading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {t('common.loading', { defaultValue: 'Loading...' })}
            </div>
          ) : filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <ComboboxItem key={item.Id} value={item.Id ?? ''}>
                <span className="truncate">
                  {formatComboboxItem(item, isEpisode)}
                </span>
              </ComboboxItem>
            ))
          ) : search ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {t('items.noResults', { defaultValue: 'No items found' })}
            </div>
          ) : null}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
})

/** Expandable search input */
const SearchInput = memo(function SearchInput() {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const { searchExpanded, searchFilter, setSearchExpanded, setSearchFilter } =
    useSessionStore(
      useShallow((state) => ({
        searchExpanded: state.searchExpanded,
        searchFilter: state.searchFilter,
        setSearchExpanded: state.setSearchExpanded,
        setSearchFilter: state.setSearchFilter,
      })),
    )

  // Focus input when expanded
  useEffect(() => {
    if (searchExpanded) {
      inputRef.current?.focus()
    }
  }, [searchExpanded])

  const handleToggle = useCallback(() => {
    if (searchExpanded) {
      setSearchExpanded(false)
      setSearchFilter('')
    } else {
      setSearchExpanded(true)
    }
  }, [searchExpanded, setSearchExpanded, setSearchFilter])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchExpanded(false)
        setSearchFilter('')
      }
    },
    [setSearchExpanded, setSearchFilter],
  )

  const handleBlur = useCallback(() => {
    if (!searchFilter.trim()) {
      setSearchExpanded(false)
    }
  }, [searchFilter, setSearchExpanded])

  if (!searchExpanded) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        aria-label={t('items.filter.name')}
        className="size-8 text-muted-foreground hover:text-foreground"
      >
        <Search className="size-4" />
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1 w-full sm:w-auto">
      <div className="relative flex-1 sm:w-64">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={t('items.filter.name')}
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="pl-8 pr-8 h-8 bg-background border-border/50"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggle}
          className="absolute right-0 top-0 size-8 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
})

/** Collection dropdown selector */
const CollectionSelector = memo(function CollectionSelector() {
  const { t } = useTranslation()
  const { data: collections } = useCollections()

  const { selectedCollection, setSelectedCollection } = useSessionStore(
    useShallow((state) => ({
      selectedCollection: state.selectedCollectionId,
      setSelectedCollection: state.setSelectedCollectionId,
    })),
  )

  const currentName = useMemo(
    () => collections?.find((c) => c.ItemId === selectedCollection)?.Name,
    [collections, selectedCollection],
  )

  if (!collections?.length) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 h-7 px-2 text-sm font-normal text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
        {currentName || t('items.filter.collection')}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {collections.map((collection) => (
          <DropdownMenuItem
            key={collection.ItemId}
            onClick={() => setSelectedCollection(collection.ItemId || null)}
            className={
              selectedCollection === collection.ItemId ? 'bg-accent' : ''
            }
          >
            {collection.Name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export default function Header() {
  const { t } = useTranslation()
  const location = useLocation()
  const params = useParams({ strict: false })

  const { toggleSettings, searchExpanded, selectedCollection } =
    useSessionStore(
      useShallow((state) => ({
        toggleSettings: state.toggleSettings,
        searchExpanded: state.searchExpanded,
        selectedCollection: state.selectedCollectionId,
      })),
    )

  // Derived state
  const itemId = (params as { itemId?: string }).itemId
  const pageType = getPageType(location.pathname)
  const isHome = pageType === 'home'
  const isDetailPage = pageType !== 'home'

  // Fetch collections (needed for breadcrumb on detail pages)
  const { data: collections } = useCollections()

  // Fetch current item only on detail pages
  const { data: currentItem } = useItem(itemId ?? '', {
    enabled: isDetailPage && !!itemId,
  })

  // Episode detection
  const isEpisode = currentItem?.Type === 'Episode' || !!currentItem?.SeriesId
  const seriesId = currentItem?.SeriesId

  // Fetch parent series only for episodes (for breadcrumb)
  const { data: parentSeries } = useItem(seriesId ?? '', {
    enabled: isEpisode && !!seriesId,
  })

  // Memoized derived values
  const currentCollectionName = useMemo(
    () => collections?.find((c) => c.ItemId === selectedCollection)?.Name,
    [collections, selectedCollection],
  )

  const seriesName = useMemo(
    () => (isEpisode ? currentItem.SeriesName || parentSeries?.Name : null),
    [isEpisode, currentItem?.SeriesName, parentSeries?.Name],
  )

  const currentItemName = useMemo(
    () =>
      isEpisode
        ? formatEpisodeLabel(currentItem)
        : currentItem?.Name || currentItem?.SeriesName,
    [isEpisode, currentItem],
  )

  // Close search on navigation away from home
  const setSearchExpanded = useSessionStore((state) => state.setSearchExpanded)
  useEffect(() => {
    if (!isHome) {
      setSearchExpanded(false)
    }
  }, [location.pathname, isHome, setSearchExpanded])

  // Page type labels for breadcrumb fallback
  const pageLabels: Record<PageType, string> = {
    home: '',
    player: t('player.title', 'Player'),
    album: t('album.title', 'Album'),
    artist: t('artist.title', 'Artist'),
    series: t('series.title', 'Series'),
  }

  return (
    <header className="h-12 px-3 flex items-center justify-between bg-background/95 backdrop-blur-sm border-b border-border/40 sticky top-0 z-50">
      {/* Left: Logo + Breadcrumb */}
      <div
        className={cn(
          'flex items-center gap-2 min-w-0 flex-1 transition-opacity duration-200',
          searchExpanded &&
            'opacity-0 pointer-events-none sm:opacity-100 sm:pointer-events-auto',
        )}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0 group">
          <div className="size-7 rounded-md bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
            <Scissors className="size-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold tracking-tight hidden sm:inline group-hover:text-primary transition-colors">
            {t('app.title')}
          </span>
        </Link>

        {/* Breadcrumb Navigation */}
        {isDetailPage && (
          <>
            <BreadcrumbSeparator className="text-muted-foreground/50 hidden sm:block" />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap">
                {/* Mobile: Home icon */}
                <BreadcrumbItem className="sm:hidden">
                  <BreadcrumbLink render={<Link to="/" />}>
                    <Home className="size-4" />
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="sm:hidden" />

                {/* Collection link (desktop) */}
                {currentCollectionName && (
                  <>
                    <BreadcrumbItem className="hidden sm:inline-flex">
                      <BreadcrumbLink
                        render={<Link to="/" />}
                        className="max-w-[80px] truncate text-xs"
                      >
                        {currentCollectionName}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden sm:block" />
                  </>
                )}

                {/* Series link (for episodes) */}
                {isEpisode && seriesName && seriesId && (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        render={
                          <Link
                            to="/series/$itemId"
                            params={{ itemId: seriesId }}
                          />
                        }
                        className="max-w-[100px] sm:max-w-[140px] truncate"
                      >
                        {seriesName}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </>
                )}

                {/* Current item with quick switch */}
                <BreadcrumbItem>
                  {currentItemName && itemId ? (
                    <QuickSwitch
                      itemId={itemId}
                      currentItemName={currentItemName}
                      isEpisode={isEpisode}
                      seriesId={seriesId}
                      selectedCollection={selectedCollection}
                    />
                  ) : (
                    <BreadcrumbPage className="max-w-[150px] sm:max-w-[200px] truncate">
                      {pageLabels[pageType]}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </>
        )}

        {/* Collection selector (home only) */}
        {isHome && (
          <>
            <BreadcrumbSeparator className="text-muted-foreground/50 hidden sm:block" />
            <CollectionSelector />
          </>
        )}
      </div>

      {/* Right: Search + Settings */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Search (home only) */}
        {isHome && selectedCollection && (
          <div
            className={cn(
              'flex items-center transition-all duration-200 ease-out',
              searchExpanded
                ? 'absolute inset-x-3 sm:relative sm:inset-auto'
                : '',
            )}
          >
            <SearchInput />
          </div>
        )}

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSettings}
          aria-label={t('app.theme.title')}
          className={cn(
            'size-8 text-muted-foreground hover:text-foreground shrink-0',
            searchExpanded && 'hidden sm:flex',
          )}
        >
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  )
}
