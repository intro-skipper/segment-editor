import { Suspense, lazy, useState } from 'react'
import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys'
import {
  Link,
  getRouteApi,
  useCanGoBack,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronLeft, Home, Search, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSessionStore } from '@/stores/session-store'
import { useCollections, useItem } from '@/services/items/queries'
import { getBestImageUrl } from '@/services/video/api'
import { useArtworkColor } from '@/hooks/use-artwork-color'
import { DynamicThemeScope } from '@/components/ui/dynamic-theme-scope'
import { formatEpisodeLabel } from '@/lib/header-utils'
import { getSeriesNavigationRoute } from '@/lib/navigation-utils'
import { cn } from '@/lib/utils'
import type { BaseItemDto } from '@/types/jellyfin'

// React.lazy and hover/focus preloading require dynamic imports to preserve code splitting.
const loadCommandPalette = () => import('@/components/header/CommandPalette')
const rootRouteApi = getRouteApi('__root__')
const loadEpisodeSwitcher = () => import('@/components/header/EpisodeSwitcher')
const loadSettingsDialog = () => import('@/components/settings')

const ignorePreloadError = () => undefined

const preloadCommandPalette = () => {
  void loadCommandPalette().catch(ignorePreloadError)
}

const preloadSettingsDialog = () => {
  void loadSettingsDialog().catch(ignorePreloadError)
}

const CommandPalette = lazy(loadCommandPalette)

const EpisodeSwitcher = lazy(loadEpisodeSwitcher)

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-3 hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        aria-label={t('items.filter.selectCollection', 'Select collection')}
      >
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
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
            onClick={() => onSelect(c.ItemId ?? null)}
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

const iconButtonClass = cn(
  'size-11 rounded-full',
  'transition-colors duration-150',
  'focus-visible:ring-2 focus-visible:ring-ring',
)

/** Pre-computed platform-aware shortcut display for search button title */
const MOD_K_DISPLAY = formatForDisplay('Mod+K')

interface HeaderDetailInfo {
  isEpisode: boolean
  pageTitle: string
  seriesId?: string
}

interface DetailHeaderContentProps extends HeaderDetailInfo {
  currentItem: BaseItemDto | undefined
  isPlayerPage: boolean
  onBack: () => void
}

interface HeaderActionsProps {
  isDetailPage: boolean
  selectedCollection: string | undefined
  onOpenSearch: () => void
  onOpenSettings: () => void
}

function getHeaderDetailInfo(
  currentItem: BaseItemDto | undefined,
): HeaderDetailInfo {
  if (!currentItem) {
    return { isEpisode: false, pageTitle: '' }
  }

  const isEpisode = currentItem.Type === 'Episode' || !!currentItem.SeriesId
  return {
    isEpisode,
    pageTitle: isEpisode
      ? (formatEpisodeLabel(currentItem) ?? currentItem.Name ?? '')
      : (currentItem.Name ?? currentItem.SeriesName ?? ''),
    seriesId: currentItem.SeriesId ?? undefined,
  }
}

function DetailHeaderContent({
  currentItem,
  isEpisode,
  isPlayerPage,
  pageTitle,
  onBack,
}: DetailHeaderContentProps) {
  const { t } = useTranslation()

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack}
        className={cn(
          iconButtonClass,
          'bg-secondary/80 text-secondary-foreground hover:bg-secondary',
          'active:scale-95',
        )}
        aria-label={t('navigation.back', 'Go back')}
      >
        <ChevronLeft className="size-5" aria-hidden />
      </Button>
      {isPlayerPage && isEpisode && currentItem ? (
        <>
          <h1 className="sr-only">{pageTitle}</h1>
          <Suspense
            fallback={
              <span className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                {pageTitle}
              </span>
            }
          >
            <EpisodeSwitcher
              currentEpisode={currentItem}
              className="flex-1 min-w-0"
            />
          </Suspense>
        </>
      ) : (
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight truncate">
          {pageTitle}
        </h1>
      )}
    </>
  )
}

function HeaderActions({
  isDetailPage,
  selectedCollection,
  onOpenSearch,
  onOpenSettings,
}: HeaderActionsProps) {
  const { t } = useTranslation()
  const actionButtonClassName = cn(
    iconButtonClass,
    'bg-secondary/60 text-secondary-foreground hover:bg-secondary',
  )

  return (
    <div className="flex items-center gap-2 shrink-0">
      {selectedCollection && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSearch}
          onPointerEnter={preloadCommandPalette}
          onFocus={preloadCommandPalette}
          className={actionButtonClassName}
          aria-label={t('search.open', 'Open search')}
          title={`${t('search.open', 'Open search')} (${MOD_K_DISPLAY})`}
        >
          <Search className="size-5" aria-hidden />
        </Button>
      )}
      {isDetailPage && (
        <Link
          to="/"
          search={
            selectedCollection ? { collection: selectedCollection } : undefined
          }
          className={cn(
            'touch-manipulation',
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            actionButtonClassName,
          )}
          aria-label={t('navigation.home', 'Go to library')}
        >
          <Home className="size-5" aria-hidden />
        </Link>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenSettings}
        onPointerEnter={preloadSettingsDialog}
        onFocus={preloadSettingsDialog}
        className={actionButtonClassName}
        aria-label={t('settings.open', 'Open settings')}
      >
        <Settings className="size-5" aria-hidden />
      </Button>
    </div>
  )
}

export default function Header() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { itemId } = useParams({ strict: false })
  const selectedCollection = rootRouteApi.useSearch({
    select: (search) => search.collection,
  })
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const toggleSettings = useSessionStore((s) => s.toggleSettings)

  const handleSettingsClick = () => {
    preloadSettingsDialog()
    toggleSettings()
  }

  const handleCollectionSelect = (collectionId: string | null) => {
    void navigate({
      to: '/',
      search: {
        collection: collectionId ?? undefined,
        page: undefined,
        search: undefined,
      },
      replace: true,
    })
  }

  const { data: collections } = useCollections()

  const isDetailPage = location.pathname !== '/'
  const isPlayerPage = location.pathname.startsWith('/player/')

  const { data: queriedItem } = useItem(itemId ?? '', {
    enabled: isDetailPage && !!itemId,
  })
  const currentItem = queriedItem ?? undefined

  // Same artwork URL as the detail routes, so the header shares the cached
  // seed and renders the same M3 dynamic scheme as the page below it.
  const imageUrl = currentItem ? getBestImageUrl(currentItem, 300) : null
  const seedColor = useArtworkColor(imageUrl || null, {
    enabled: !!imageUrl,
  })

  const detailInfo = getHeaderDetailInfo(currentItem)

  const openCommandPalette = () => {
    preloadCommandPalette()
    setCommandPaletteOpen(true)
  }

  // Mod+K fires in inputs by default (modifier shortcut smart default)
  useHotkey('Mod+K', openCommandPalette)
  // "/" key — ignored in inputs by default (single-key smart default)
  useHotkey('/', openCommandPalette)

  const handleGoHome = () => {
    void navigate({
      to: '/',
      search: selectedCollection
        ? { collection: selectedCollection }
        : undefined,
    })
  }

  const handleBack = () => {
    if (canGoBack) {
      router.history.back()
      return
    }

    if (detailInfo.isEpisode && detailInfo.seriesId) {
      void navigate({
        ...getSeriesNavigationRoute(detailInfo.seriesId, currentItem?.SeasonId),
        replace: true,
      })
      return
    }

    handleGoHome()
  }

  return (
    <>
      <header className="sticky top-0 z-40">
        <DynamicThemeScope
          seedColor={seedColor}
          className="bg-background/80 backdrop-blur-xl border-b border-border/40"
        >
          <nav
            className="px-4 py-4 sm:px-6"
            aria-label={t('accessibility.navigation', 'Main navigation')}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {isDetailPage ? (
                  <DetailHeaderContent
                    {...detailInfo}
                    currentItem={currentItem}
                    isPlayerPage={isPlayerPage}
                    onBack={handleBack}
                  />
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

              <HeaderActions
                selectedCollection={selectedCollection}
                isDetailPage={isDetailPage}
                onOpenSearch={openCommandPalette}
                onOpenSettings={handleSettingsClick}
              />
            </div>
          </nav>
        </DynamicThemeScope>
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
