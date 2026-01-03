/**
 * CommandPalette - Quick search dialog for navigating media items
 * Accessible via Cmd/Ctrl+K or / keyboard shortcuts
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { Film, Loader2, Mic2, Play, Search, Tv, X } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import type { SessionStore } from '@/stores/session-store'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useItems } from '@/hooks/queries/use-items'
import { useSessionStore } from '@/stores/session-store'
import { cn } from '@/lib/utils'
import { BaseItemKind } from '@/types/jellyfin'

const ITEM_HEIGHT = 64
const MAX_VISIBLE_ITEMS = 8
const SEARCH_DEBOUNCE_MS = 150

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ITEM_ICONS: Partial<Record<BaseItemKind, typeof Film>> = {
  [BaseItemKind.Movie]: Film,
  [BaseItemKind.Series]: Tv,
  [BaseItemKind.MusicArtist]: Mic2,
  [BaseItemKind.MusicAlbum]: Mic2,
  [BaseItemKind.Audio]: Mic2,
}

const ROUTES: Partial<Record<BaseItemKind, string>> = {
  [BaseItemKind.Series]: '/series/$itemId',
  [BaseItemKind.MusicArtist]: '/artist/$itemId',
  [BaseItemKind.MusicAlbum]: '/album/$itemId',
}

const selectCollectionId = (s: SessionStore): string | null =>
  s.selectedCollectionId

const SearchResultItem = memo(function SearchResultItem({
  item,
  optionId,
  isSelected,
  onSelect,
  style,
}: {
  item: BaseItemDto
  optionId: string
  isSelected: boolean
  onSelect: () => void
  style: React.CSSProperties
}) {
  const Icon = (item.Type && ITEM_ICONS[item.Type]) ?? Film

  return (
    <button
      id={optionId}
      type="button"
      onClick={onSelect}
      className={cn(
        'group absolute top-0 left-0 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left',
        'transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'bg-primary/15 text-primary'
          : 'hover:bg-muted/80 text-foreground',
      )}
      style={style}
      role="option"
      aria-selected={isSelected}
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
        {item.ProductionYear && (
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
})

// Custom hook for debounced search
const useDebouncedSearch = (search: string, delay: number) => {
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const trimmed = search.trim()
    if (!trimmed) {
      setDebouncedSearch('')
      return
    }
    const timer = setTimeout(() => setDebouncedSearch(trimmed), delay)
    return () => clearTimeout(timer)
  }, [search, delay])

  return debouncedSearch
}

export const CommandPalette = memo(function CommandPalette({
  open,
  onOpenChange,
}: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const selectedCollection = useSessionStore(selectCollectionId)

  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  )
  const triggerRef = useRef<HTMLElement | null>(null)

  const debouncedSearch = useDebouncedSearch(search, SEARCH_DEBOUNCE_MS)

  const { data: items = [], isFetching } = useItems({
    parentId: selectedCollection ?? '',
    nameFilter: debouncedSearch || undefined,
    enabled: open && !!selectedCollection,
  })

  const listHeight =
    Math.min(items.length || 1, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT
  const getScrollElement = useCallback(() => scrollElement, [scrollElement])
  const estimateSize = useCallback(() => ITEM_HEIGHT, [])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize,
    overscan: 5,
  })

  // Store trigger for focus restoration
  useEffect(() => {
    if (open) triggerRef.current = document.activeElement as HTMLElement
  }, [open])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSearch('')
      setSelectedIndex(0)
    }
  }, [open])

  // Reset selection when items change
  useEffect(() => setSelectedIndex(0), [items])

  // Scroll selected into view
  const prevIndex = useRef(selectedIndex)
  useEffect(() => {
    if (!open || items.length === 0 || prevIndex.current === selectedIndex)
      return
    virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    prevIndex.current = selectedIndex
  }, [selectedIndex, items.length, virtualizer, open])

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen)
      if (!isOpen) setTimeout(() => triggerRef.current?.focus(), 0)
    },
    [onOpenChange],
  )

  const handleSelect = useCallback(
    (item: BaseItemDto) => {
      const itemId = item.Id ?? ''
      const route = item.Type ? ROUTES[item.Type] : undefined

      void navigate(
        route
          ? { to: route, params: { itemId } }
          : {
              to: '/player/$itemId',
              params: { itemId },
              search: { fetchSegments: 'true' },
            },
      )
      handleOpenChange(false)
    },
    [navigate, handleOpenChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!items.length) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, items.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          handleSelect(items[selectedIndex])
          break
      }
    },
    [items, selectedIndex, handleSelect],
  )

  const safeIndex = Math.min(selectedIndex, Math.max(0, items.length - 1))
  const activeDescendantId = items[safeIndex]?.Id
    ? `search-result-${items[safeIndex].Id}`
    : undefined
  const showLoading = isFetching && debouncedSearch
  const showEmpty = !isFetching && items.length === 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg p-0 bg-popover/95 backdrop-blur-xl border-border/50 shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
        aria-label={t('search.title', 'Search')}
        showCloseButton={false}
      >
        {/* Search Input Section */}
        <div className="relative border-b border-border/50 p-4">
          {showLoading ? (
            <Loader2
              className="absolute left-7 top-1/2 -translate-y-1/2 size-5 text-muted-foreground animate-spin"
              aria-hidden
            />
          ) : (
            <Search
              className="absolute left-7 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none"
              aria-hidden
            />
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search.placeholder', 'Search media...')}
            className="w-full bg-transparent pl-10 pr-10 h-10 text-base outline-none placeholder:text-muted-foreground"
            autoFocus
            role="combobox"
            aria-expanded={items.length > 0}
            aria-haspopup="listbox"
            aria-label={t('search.placeholder', 'Search media...')}
            aria-controls="search-results"
            aria-activedescendant={activeDescendantId}
            aria-autocomplete="list"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-5 top-1/2 -translate-y-1/2 hover:bg-muted/80"
              onClick={() => setSearch('')}
              aria-label={t('search.clear', 'Clear search')}
            >
              <X className="size-4" aria-hidden />
            </Button>
          )}
        </div>

        {/* Results Section */}
        <div className="px-2 pb-2">
          {items.length > 0 && (
            <div className="px-3 py-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {t('search.results', 'Results')}
                <span className="ml-1.5 opacity-60">({items.length})</span>
              </span>
            </div>
          )}

          {items.length > 0 ? (
            <div
              id="search-results"
              ref={setScrollElement}
              className="overflow-y-auto"
              style={{ height: listHeight }}
              role="listbox"
              aria-label={t('search.results', 'Search results')}
            >
              <div
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((row) => {
                  const item = items[row.index]
                  const key = item.Id ?? `${item.Type ?? 'item'}-${row.index}`
                  return (
                    <SearchResultItem
                      key={key}
                      item={item}
                      optionId={`search-result-${key}`}
                      isSelected={row.index === safeIndex}
                      onSelect={() => handleSelect(item)}
                      style={{
                        height: row.size,
                        transform: `translateY(${row.start}px)`,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          ) : (
            <div
              id="search-results"
              className="flex flex-col items-center justify-center py-12 text-muted-foreground"
              role="status"
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
                  : t('search.start_typing', 'Start typing to search...')}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
})
