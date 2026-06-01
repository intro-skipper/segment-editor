/**
 * CommandPalette - Quick search dialog for navigating media items
 * Accessible via Cmd/Ctrl+K or / keyboard shortcuts
 */

import {
  useDeferredValue,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Film, Loader2, Mic2, Play, Search, Tv, X } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useItems } from '@/services/items/queries'
import { useSelectedCollectionSearch } from '@/hooks/use-selected-collection-search'
import { useVirtualWindow } from '@/hooks/use-virtual-window'
import { cn } from '@/lib/utils'
import { navigateToMediaItem, preloadMediaRoute } from '@/lib/navigation-utils'
import { BaseItemKind } from '@/types/jellyfin'

const ITEM_HEIGHT = 64
const MAX_VISIBLE_ITEMS = 8
const SEARCH_RESULT_LIMIT = 80
const SEARCH_DEBOUNCE_MS = 140
const MIN_SEARCH_LENGTH = 1
const VIRTUAL_OVERSCAN = 4

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CommandPaletteState {
  search: string
  debouncedSearch: string
  selectedIndex: number
  includeEpisodes: boolean
}

type CommandPaletteAction =
  | { type: 'searchChanged'; value: string }
  | { type: 'searchCleared' }
  | { type: 'debouncedSearchChanged'; value: string }
  | { type: 'selectedIndexChanged'; value: number }
  | { type: 'episodeInclusionToggled' }
  | { type: 'closed' }

const COMMAND_PALETTE_INITIAL_STATE: CommandPaletteState = {
  search: '',
  debouncedSearch: '',
  selectedIndex: 0,
  includeEpisodes: false,
}

function commandPaletteReducer(
  state: CommandPaletteState,
  action: CommandPaletteAction,
): CommandPaletteState {
  switch (action.type) {
    case 'searchChanged':
      return { ...state, search: action.value, selectedIndex: 0 }
    case 'searchCleared':
      return { ...state, search: '', selectedIndex: 0 }
    case 'debouncedSearchChanged':
      return { ...state, debouncedSearch: action.value }
    case 'selectedIndexChanged':
      return { ...state, selectedIndex: action.value }
    case 'episodeInclusionToggled':
      return {
        ...state,
        includeEpisodes: !state.includeEpisodes,
        selectedIndex: 0,
      }
    case 'closed':
      return {
        ...state,
        search: '',
        debouncedSearch: '',
        selectedIndex: 0,
      }
  }
}

const ITEM_ICONS: Partial<Record<BaseItemKind, typeof Film>> = {
  [BaseItemKind.Movie]: Film,
  [BaseItemKind.Series]: Tv,
  [BaseItemKind.MusicArtist]: Mic2,
  [BaseItemKind.MusicAlbum]: Mic2,
  [BaseItemKind.Audio]: Mic2,
}

function SearchResultItem({
  item,
  optionId,
  isSelected,
  itemIndex,
  onSelect,
  onIntent,
}: {
  item: BaseItemDto
  optionId: string
  isSelected: boolean
  itemIndex: number
  onSelect: (item: BaseItemDto) => void
  onIntent: (item: BaseItemDto) => void
}) {
  const Icon = (item.Type && ITEM_ICONS[item.Type]) ?? Film
  const selectResult = () => {
    onSelect(item)
  }

  return (
    <button
      id={optionId}
      data-result-index={itemIndex}
      data-interactive-transition="true"
      type="button"
      onClick={selectResult}
      className={cn(
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left',
        'transition-[background-color,color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'bg-primary/15 text-primary'
          : 'hover:bg-muted/80 text-foreground',
      )}
      onPointerEnter={() => onIntent(item)}
      onFocus={() => onIntent(item)}
      aria-current={isSelected ? 'true' : undefined}
    >
      <div
        className={cn(
          'size-10 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-150',
          isSelected
            ? 'bg-primary/20 text-primary'
            : 'bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-medium truncate text-sm leading-tight',
            isSelected && 'font-semibold',
          )}
        >
          {item.Name ?? 'Unknown'}
        </p>
        {item.ProductionYear != null && item.ProductionYear > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {item.ProductionYear}
          </p>
        )}
      </div>
      <Play
        className={cn(
          'size-4 flex-shrink-0 transition-opacity duration-150',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        fill="currentColor"
        strokeWidth={0}
        aria-hidden="true"
      />
    </button>
  )
}

const getResultItemKey = (item: BaseItemDto, index: number) =>
  item.Id ?? `${item.Type ?? 'item'}-${index}`

// eslint-disable-next-line react-doctor/no-giant-component -- cohesive dialog controller; extracting single-use fragments would add prop-drilling without reducing complexity
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const selectedCollection = useSelectedCollectionSearch()
  const prefetchedItemIdsRef = useRef<Set<string> | null>(null)
  if (prefetchedItemIdsRef.current === null) {
    prefetchedItemIdsRef.current = new Set<string>()
  }
  const [state, dispatch] = useReducer(
    commandPaletteReducer,
    COMMAND_PALETTE_INITIAL_STATE,
  )
  const { search, debouncedSearch, selectedIndex, includeEpisodes } = state
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  )
  const scrollElementRef = useRef<HTMLDivElement | null>(null)
  const [setSearchResultsElement] = useState(
    () => (element: HTMLDivElement | null) => {
      scrollElementRef.current = element
      setScrollElement((currentElement) =>
        currentElement === element ? currentElement : element,
      )
    },
  )
  const triggerRef = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const deferredSearch = useDeferredValue(search)
  const trimmedSearch = deferredSearch.trim()
  const canSearch = debouncedSearch.length >= MIN_SEARCH_LENGTH
  const excludedItemTypes: Array<BaseItemKind> | undefined = includeEpisodes
    ? undefined
    : [BaseItemKind.Episode, BaseItemKind.Season]

  useEffect(() => {
    if (!open) return

    const timeoutId = window.setTimeout(() => {
      dispatch({ type: 'debouncedSearchChanged', value: trimmedSearch })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [trimmedSearch, open])

  const { data: itemsData, isFetching } = useItems({
    parentId: selectedCollection ?? '',
    nameFilter: debouncedSearch || undefined,
    excludeItemTypes: excludedItemTypes,
    limit: SEARCH_RESULT_LIMIT,
    includeMediaStreams: false,
    enabled: open && !!selectedCollection && canSearch,
  })
  const queriedItems = itemsData?.items ?? []
  const resultItems = excludedItemTypes
    ? queriedItems.filter(
        (item) =>
          item.Type === undefined || !excludedItemTypes.includes(item.Type),
      )
    : queriedItems

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'searchChanged', value: e.target.value })
  }

  const handleClearSearch = () => {
    dispatch({ type: 'searchCleared' })
  }

  const handleEpisodeInclusionToggle = () => {
    dispatch({ type: 'episodeInclusionToggled' })
  }

  const listHeight =
    Math.min(resultItems.length || 1, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT

  const shouldVirtualize = resultItems.length > MAX_VISIBLE_ITEMS

  const {
    totalSize: totalVirtualHeight,
    startIndex: virtualStartIndex,
    endIndex: virtualEndIndex,
  } = useVirtualWindow({
    enabled: open && shouldVirtualize,
    scrollElement,
    itemCount: resultItems.length,
    itemSize: ITEM_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
  })

  const totalListHeight = shouldVirtualize
    ? totalVirtualHeight
    : resultItems.length * ITEM_HEIGHT

  const visibleStartIndex = shouldVirtualize ? virtualStartIndex : 0
  const visibleEndIndex = shouldVirtualize
    ? virtualEndIndex
    : resultItems.length

  const visibleItems = resultItems.slice(visibleStartIndex, visibleEndIndex)

  const setSelectedIndexWithScroll = (nextIndex: number) => {
    dispatch({ type: 'selectedIndexChanged', value: nextIndex })
    const list = scrollElementRef.current
    if (open && resultItems.length > 0 && list) {
      const itemTop = nextIndex * ITEM_HEIGHT
      const itemBottom = itemTop + ITEM_HEIGHT
      const viewportTop = list.scrollTop
      const viewportBottom = viewportTop + listHeight

      if (itemTop < viewportTop) {
        list.scrollTop = itemTop
      } else if (itemBottom > viewportBottom) {
        list.scrollTop = itemBottom - listHeight
      }
    }
  }

  const safeIndex = Math.min(selectedIndex, Math.max(0, resultItems.length - 1))

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement
    }

    if (!isOpen) {
      dispatch({ type: 'closed' })
    }

    onOpenChange(isOpen)

    requestAnimationFrame(() => {
      if (isOpen) {
        inputRef.current?.focus()
      } else {
        triggerRef.current?.focus()
      }
    })
  }

  const handleSelect = (item: BaseItemDto) => {
    navigateToMediaItem(navigate, item)
    handleOpenChange(false)
  }

  const handleIntent = (item: BaseItemDto) => {
    const prefetchedItemIds = prefetchedItemIdsRef.current
    if (prefetchedItemIds === null) return

    const itemId = item.Id
    if (!itemId || prefetchedItemIds.has(itemId)) {
      return
    }

    prefetchedItemIds.add(itemId)
    preloadMediaRoute(router.preloadRoute, item)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!resultItems.length) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndexWithScroll(
          Math.min(safeIndex + 1, resultItems.length - 1),
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndexWithScroll(Math.max(safeIndex - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (resultItems[safeIndex]) {
          handleSelect(resultItems[safeIndex])
        }
        break
    }
  }

  const activeDescendantId = resultItems[safeIndex]
    ? `search-result-${getResultItemKey(resultItems[safeIndex], safeIndex)}`
    : undefined
  const showLoading = isFetching && canSearch
  const showEmpty = !isFetching && canSearch && resultItems.length === 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-full sm:max-w-lg p-0 bg-popover/95 backdrop-blur-xl border-border/50 shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
        aria-label={t('search.title', 'Search')}
      >
        <div className="relative border-b border-border/50 p-4 overflow-hidden">
          {showLoading ? (
            <div
              className="absolute left-7 top-1/2 -translate-y-1/2 animate-spin"
              aria-hidden
            >
              <Loader2 className="size-5 text-muted-foreground" />
            </div>
          ) : (
            <Search
              className="absolute left-7 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none"
              aria-hidden
            />
          )}
          <input
            ref={inputRef}
            value={search}
            onChange={handleSearchChange}
            placeholder={t('search.placeholder', 'Search media…')}
            name="media-search"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              'w-full min-w-0 max-w-full box-border bg-transparent pl-10 h-11 sm:h-10 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md placeholder:text-muted-foreground',
              search ? 'pr-24 sm:pr-32' : 'pr-16 sm:pr-24',
            )}
            aria-haspopup="listbox"
            aria-label={t('search.placeholder', 'Search media…')}
            aria-controls={
              resultItems.length > 0 ? 'search-results' : undefined
            }
            aria-activedescendant={activeDescendantId}
            aria-autocomplete="list"
          />
          <Button
            type="button"
            variant={includeEpisodes ? 'secondary' : 'outline'}
            size="sm"
            className={cn(
              'absolute top-1/2 -translate-y-1/2 h-8 sm:h-7 rounded-full px-1.5 sm:px-2 text-[10px] sm:text-[11px]',
              search ? 'right-13 sm:right-14' : 'right-4 sm:right-5',
            )}
            onClick={handleEpisodeInclusionToggle}
            aria-pressed={includeEpisodes}
            aria-label={t(
              'search.includeEpisodes',
              'Include episodes in search results',
            )}
          >
            {t('search.includeEpisodesLabel', 'Episodes')}
          </Button>
          {search && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 hover:bg-muted/80"
              onClick={handleClearSearch}
              aria-label={t('search.clear', 'Clear search')}
            >
              <X className="size-4" aria-hidden />
            </Button>
          )}
        </div>

        <div className="px-2 pb-2">
          {resultItems.length > 0 && (
            <div className="px-3 py-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {t('search.results', 'Results')}
                <span className="ml-1.5 opacity-60">
                  ({resultItems.length})
                </span>
              </span>
            </div>
          )}

          {resultItems.length > 0 ? (
            <div
              id="search-results"
              ref={setSearchResultsElement}
              className="overflow-y-auto"
              style={{ height: listHeight }}
              aria-label={t('search.results', 'Search results')}
            >
              <div
                style={
                  shouldVirtualize
                    ? { height: totalListHeight, position: 'relative' }
                    : undefined
                }
              >
                {visibleItems.map((item, virtualIndex) => {
                  const index = visibleStartIndex + virtualIndex
                  const key = getResultItemKey(item, index)
                  return (
                    <div
                      key={key}
                      style={
                        shouldVirtualize
                          ? {
                              position: 'absolute',
                              top: index * ITEM_HEIGHT,
                              left: 0,
                              right: 0,
                            }
                          : undefined
                      }
                    >
                      <SearchResultItem
                        item={item}
                        optionId={`search-result-${key}`}
                        isSelected={index === safeIndex}
                        itemIndex={index}
                        onSelect={handleSelect}
                        onIntent={handleIntent}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <output
              id="search-empty-status"
              className="flex flex-col items-center justify-center py-12 text-muted-foreground"
              aria-live="polite"
            >
              <Search
                className="size-8 mb-3 opacity-40"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="text-sm">
                {showEmpty && search
                  ? t('search.no_results', 'No results found')
                  : t('search.start_typing', 'Start typing to search…')}
              </p>
            </output>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
