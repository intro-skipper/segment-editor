/**
 * @vitest-environment jsdom
 */

import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'
import Header from '@/components/Header'

const itemsById: Record<string, BaseItemDto> = {
  'movie-1': {
    Id: 'movie-1',
    Name: 'Inception',
    Type: BaseItemKind.Movie,
  },
  'album-1': {
    Id: 'album-1',
    Name: 'Random Access Memories',
    Type: BaseItemKind.MusicAlbum,
  },
  'episode-1': {
    Id: 'episode-1',
    Name: 'Pilot',
    Type: BaseItemKind.Episode,
    SeriesId: 'series-1',
    SeriesName: 'The Expanse',
    ParentIndexNumber: 1,
    IndexNumber: 2,
  },
  'series-1': {
    Id: 'series-1',
    Name: 'The Expanse',
    Type: BaseItemKind.Series,
  },
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: vi.fn(), language: 'en-US' },
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback
      if (typeof fallback === 'object' && fallback.defaultValue)
        return fallback.defaultValue
      return key
    },
  }),
}))

vi.mock('@tanstack/react-hotkeys', () => ({
  formatForDisplay: (shortcut: string) => shortcut,
  useHotkey: vi.fn(),
}))

const collectionsRef: {
  current: Array<{ ItemId?: string | null; Name?: string | null }>
} = { current: [] }

vi.mock('@/services/items/queries', () => ({
  useCollections: () => ({ data: collectionsRef.current }),
  useItem: (itemId: string, opts?: { enabled?: boolean }) => ({
    data: (opts?.enabled ?? true) ? itemsById[itemId] : undefined,
  }),
}))

vi.mock('@/hooks/use-vibrant-color', () => ({
  useVibrantColor: () => null,
}))

vi.mock('@/services/video/api', () => ({
  getBestImageUrl: () => null,
}))

vi.mock('@/components/header/EpisodeSwitcher', () => ({
  default: ({ currentEpisode }: { currentEpisode: BaseItemDto }) => (
    <div data-testid="episode-switcher">{currentEpisode.Name}</div>
  ),
}))

function renderHeaderAt(initialPath: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Header />
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const playerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/player/$itemId',
    component: () => null,
  })
  const seriesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/series/$itemId',
    component: () => null,
  })
  const albumRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/album/$itemId',
    component: () => null,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      playerRoute,
      seriesRoute,
      albumRoute,
    ]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  // The generated app route tree owns the registered router type; this test
  // harness intentionally uses a minimal local tree.
  render(<RouterProvider router={router as never} />)
}

describe('Header on detail routes', () => {
  afterEach(() => {
    cleanup()
    collectionsRef.current = []
  })

  it('renders the movie name as the title on a player route', async () => {
    renderHeaderAt('/player/movie-1')

    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Inception')
  })

  it('renders the episode switcher with the episode label on a player route', async () => {
    renderHeaderAt('/player/episode-1')

    const switcher = await screen.findByTestId('episode-switcher')
    expect(switcher.textContent).toBe('Pilot')

    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('S1E2 Pilot')
  })

  it('renders the series name as the title on a series route', async () => {
    renderHeaderAt('/series/series-1')

    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('The Expanse')
  })

  it('renders the album name as the title on an album route', async () => {
    renderHeaderAt('/album/album-1')

    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Random Access Memories')
  })

  it('renders the collection selector without a detail title when no itemId param is present', async () => {
    collectionsRef.current = [{ ItemId: 'lib-1', Name: 'TV Shows' }]
    renderHeaderAt('/')

    // Index route: the header falls back to the collection selector heading
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('All Libraries')
    expect(screen.queryByTestId('episode-switcher')).toBeNull()
    // Settings action still renders, so the header is fully functional
    expect(screen.getByLabelText('Open settings')).toBeTruthy()
  })

  it('fails gracefully when the item is unknown on a detail route', async () => {
    renderHeaderAt('/player/unknown-item')

    // Back button renders, no crash
    expect(await screen.findByLabelText('Go back')).toBeTruthy()
    // Title falls back to empty until the item resolves; switcher stays absent
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('')
    expect(screen.queryByTestId('episode-switcher')).toBeNull()
  })
})
