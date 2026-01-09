/**
 * Header - Minimal navigation header
 * Single-responsibility: Navigation + collection selection + settings access
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronLeft, Search, Settings } from 'lucide-react'
import { useShallow } from 'zustand/shallow'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSessionStore } from '@/stores/session-store'
import { useCollections } from '@/hooks/queries/use-collections'
import { useItem } from '@/hooks/queries/use-items'
import { formatEpisodeLabel } from '@/lib/header-utils'
import { cn } from '@/lib/utils'
import { CommandPalette } from '@/components/header/CommandPalette'
import { EpisodeSwitcher } from '@/components/header/EpisodeSwitcher'

// ============================================================================
// Sub-Components (inline for performance - avoids memo overhead for simple UI)
// ============================================================================

interface CollectionSelectorProps {
  collections: Array<{ ItemId?: string | null; Name?: string | null }>
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/** Collection dropdown - extracted props to avoid internal store subscriptions */
function CollectionSelector({
  collections,
  selectedId,
  onSelect,
}: CollectionSelectorProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentName = collections.find((c) => c.ItemId === selectedId)?.Name

  // Handle collection selection - navigate to update URL which syncs to store
  const handleSelect = useCallback(
    (id: string | null) => {
      // Update store for immediate UI feedback
      onSelect(id)
      // Navigate to update URL (source of truth)
      navigate({
        to: '/',
        search: {
          collection: id ?? undefined,
          page: undefined,
          search: undefined,
        },
      })
    },
    [onSelect, navigate],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-3 hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        aria-label={t('items.filter.selectCollection', 'Select collection')}
      >
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          {currentName ?? t('items.filter.collection', 'All Libraries')}
        </h1>
        <ChevronDown className="size-5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[var(--spacing-dropdown-min)]"
      >
        {collections.map((c, index) => (
          <DropdownMenuItem
            key={c.ItemId ?? c.Name ?? `collection-${index}`}
            onClick={() => handleSelect(c.ItemId ?? null)}
            className={cn(
              'cursor-pointer',
              selectedId === c.ItemId && 'bg-primary/10 text-primary',
            )}
          >
            {c.Name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Shared styles for icon buttons */
const iconButtonClass = cn(
  'size-11 rounded-full',
  'transition-colors duration-150',
  'focus-visible:ring-2 focus-visible:ring-ring',
)

// ============================================================================
// Main Component
// ============================================================================

export default function Header() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // Single store subscription - extract all needed values at once
  const {
    toggleSettings,
    selectedCollection,
    setSelectedCollection,
    vibrantColors,
  } = useSessionStore(
    useShallow((s) => ({
      toggleSettings: s.toggleSettings,
      selectedCollection: s.selectedCollectionId,
      setSelectedCollection: s.setSelectedCollectionId,
      vibrantColors: s.vibrantColors,
    })),
  )

  // Collections query
  const { data: collections } = useCollections()

  // Derived state
  const itemId = (params as { itemId?: string }).itemId
  const isDetailPage = location.pathname !== '/'

  // Fetch current item only on detail pages
  const { data: currentItem } = useItem(itemId ?? '', {
    enabled: isDetailPage && !!itemId,
  })

  // Compute page title and check if on player page - memoized to avoid recalculation
  const { pageTitle, isEpisode, seriesId, isPlayerPage } = useMemo(() => {
    const onPlayerPage = location.pathname.startsWith('/player/')

    if (!currentItem)
      return {
        pageTitle: '',
        isEpisode: false,
        seriesId: undefined,
        isPlayerPage: onPlayerPage,
      }

    const isEp = currentItem.Type === 'Episode' || !!currentItem.SeriesId
    const title = isEp
      ? (formatEpisodeLabel(currentItem) ?? currentItem.Name ?? '')
      : (currentItem.Name ?? currentItem.SeriesName ?? '')

    return {
      pageTitle: title,
      isEpisode: isEp,
      seriesId: currentItem.SeriesId,
      isPlayerPage: onPlayerPage,
    }
  }, [currentItem, location.pathname])

  // Keyboard shortcut for command palette (Cmd/Ctrl+K or /)
  useEffect(() => {
    const controller = new AbortController()

    document.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        const isSearchShortcut =
          (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
          (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey)

        if (!isSearchShortcut) return

        const target = e.target as HTMLElement
        const isEditable =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable

        if (isEditable) return

        e.preventDefault()
        setCommandPaletteOpen(true)
      },
      { signal: controller.signal },
    )

    return () => controller.abort()
  }, [])

  // Back navigation - go to series page if viewing episode, otherwise home with collection preserved
  const handleBack = useCallback(() => {
    if (isEpisode && seriesId) {
      navigate({ to: '/series/$itemId', params: { itemId: seriesId } })
    } else {
      // Preserve selected collection when going back to home
      navigate({
        to: '/',
        search: selectedCollection
          ? { collection: selectedCollection }
          : undefined,
      })
    }
  }, [isEpisode, seriesId, navigate, selectedCollection])

  // Memoize style objects to prevent re-renders
  const headerStyle = useMemo(
    () =>
      vibrantColors
        ? ({
            backgroundColor: `${vibrantColors.background}99`,
          } as React.CSSProperties)
        : undefined,
    [vibrantColors],
  )

  const accentButtonStyle = useMemo(
    () =>
      vibrantColors
        ? {
            backgroundColor: vibrantColors.accent,
            color: vibrantColors.accentText,
          }
        : undefined,
    [vibrantColors],
  )

  return (
    <>
      <header
        className="sticky top-0 z-40 backdrop-blur-xl"
        role="banner"
        style={headerStyle}
      >
        <nav
          className="px-4 py-4 sm:px-6"
          role="navigation"
          aria-label={t('accessibility.navigation', 'Main navigation')}
        >
          <div className="flex items-center justify-between gap-4">
            {/* Left: Navigation / Collection selector */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {isDetailPage ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleBack}
                    className={cn(
                      iconButtonClass,
                      !vibrantColors && 'bg-secondary/80 hover:bg-secondary',
                      'active:scale-95',
                    )}
                    style={accentButtonStyle}
                    aria-label={t('navigation.back', 'Go back')}
                  >
                    <ChevronLeft className="size-5" aria-hidden />
                  </Button>
                  {/* Episode switcher replaces title for episodes on player page */}
                  {isPlayerPage && isEpisode && currentItem ? (
                    <EpisodeSwitcher
                      currentEpisode={currentItem}
                      vibrantColors={vibrantColors}
                      className="flex-1 min-w-0"
                    />
                  ) : (
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                      {pageTitle}
                    </h1>
                  )}
                </>
              ) : (
                collections?.length && (
                  <CollectionSelector
                    collections={collections}
                    selectedId={selectedCollection}
                    onSelect={setSelectedCollection}
                  />
                )
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {selectedCollection && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCommandPaletteOpen(true)}
                  className={cn(
                    iconButtonClass,
                    !vibrantColors && 'bg-secondary/60 hover:bg-secondary',
                  )}
                  style={accentButtonStyle}
                  aria-label={t('search.open', 'Open search')}
                >
                  <Search className="size-5" aria-hidden />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSettings}
                className={cn(
                  iconButtonClass,
                  !vibrantColors && 'bg-secondary/60 hover:bg-secondary',
                )}
                style={accentButtonStyle}
                aria-label={t('settings.open', 'Open settings')}
              >
                <Settings className="size-5" aria-hidden />
              </Button>
            </div>
          </div>
        </nav>
      </header>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
    </>
  )
}
