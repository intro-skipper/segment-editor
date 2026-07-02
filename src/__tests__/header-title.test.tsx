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

vi.mock('@/services/items/queries', () => ({
  useCollections: () => ({ data: [] }),
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

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, playerRoute, seriesRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  // The generated app route tree owns the registered router type; this test
  // harness intentionally uses a minimal local tree.
  render(<RouterProvider router={router as never} />)
}

describe('Header on detail routes', () => {
  afterEach(() => {
    cleanup()
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
})
