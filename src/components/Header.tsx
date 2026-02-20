/**
 * Header - Minimal navigation header
 * Single-responsibility: Navigation + collection selection + settings access
 */

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react'
import {
  useCanGoBack,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronLeft, Search, Settings } from 'lucide-react'

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
import { useVibrantColor } from '@/hooks/use-vibrant-color'
import { formatEpisodeLabel } from '@/lib/header-utils'
import { cn } from '@/lib/utils'
import { useSelectedCollectionSearch } from '@/hooks/use-selected-collection-search'
import { getBestImageUrl } from '@/services/video/api'

const loadCommandPalette = () => import('@/components/header/CommandPalette')
const loadEpisodeSwitcher = () => import('@/components/header/EpisodeSwitcher')
const loadSettingsDialog = () => import('@/components/settings')

const CommandPalette = lazy(() =>
  loadCommandPalette().then((module) => ({
    default: module.CommandPalette,
  })),
)

const EpisodeSwitcher = lazy(() =>
  loadEpisodeSwitcher().then((module) => ({
    default: module.EpisodeSwitcher,
  })),
)

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
  const currentName = collections.find((c) => c.ItemId === selectedId)?.Name

  // Handle collection selection
  const handleSelect = useCallback(
    (id: string | null) => {
      onSelect(id)
    },
    [onSelect],
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
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const params = useParams({ strict: false })
  const selectedCollection = useSelectedCollectionSearch()
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const toggleSettings = useSessionStore((s) => s.toggleSettings)

  const handleCollectionSelect = useCallback(
    (collectionId: string | null) => {
      navigate({
        to: '/',
        search: {
          collection: collectionId ?? undefined,
          page: undefined,
          search: undefined,
        },
        replace: true,
      })
    },
    [navigate],
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

  const headerImageUrl = currentItem ? getBestImageUrl(currentItem, 300) : null
  const vibrantColors = useVibrantColor(headerImageUrl || null, {
    enabled: isDetailPage && !!headerImageUrl,
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

  const handleCommandPaletteShortcut = useEffectEvent((e: KeyboardEvent) => {
    const isSearchShortcut =
      (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
      (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey)

    if (!isSearchShortcut) return

    // Skip if user is typing in an input field
    const target = e.target as HTMLElement
    const tagName = target.tagName.toUpperCase()
    if (
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    e.preventDefault()
    void loadCommandPalette()
    setCommandPaletteOpen(true)
  })

  // Keyboard shortcut for command palette (Cmd/Ctrl+K or /)
  useEffect(() => {
    const controller = new AbortController()

    document.addEventListener('keydown', handleCommandPaletteShortcut, {
      signal: controller.signal,
    })

    return () => controller.abort()
  }, [])

  // Back navigation - go to series page if viewing episode, otherwise home with collection preserved
  const handleBack = useCallback(() => {
    if (canGoBack) {
      router.history.back()
      return
    }

    if (isEpisode && seriesId) {
      navigate({
        to: '/series/$itemId',
        params: { itemId: seriesId },
        replace: true,
      })
      return
    }

    // Preserve selected collection when going back to home
    navigate({
      to: '/',
      search: selectedCollection
        ? { collection: selectedCollection }
        : undefined,
    })
  }, [canGoBack, isEpisode, navigate, router, selectedCollection, seriesId])

  // Memoize style objects to prevent re-renders
  const headerStyle = useMemo(
    () =>
      vibrantColors
        ? ({
            backgroundColor: `${vibrantColors.background}00`,
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
                    <Suspense
                      fallback={
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                          {pageTitle}
                        </h1>
                      }
                    >
                      <EpisodeSwitcher
                        currentEpisode={currentItem}
                        vibrantColors={vibrantColors}
                        className="flex-1 min-w-0"
                      />
                    </Suspense>
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
                    selectedId={selectedCollection ?? null}
                    onSelect={handleCollectionSelect}
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
                  onPointerEnter={() => {
                    void loadCommandPalette()
                  }}
                  onFocus={() => {
                    void loadCommandPalette()
                  }}
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
                onPointerEnter={() => {
                  void loadSettingsDialog()
                }}
                onFocus={() => {
                  void loadSettingsDialog()
                }}
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

      {commandPaletteOpen ? (
        <Suspense fallback={null}>
          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
          />
        </Suspense>
      ) : null}
    </>
  )
}
