/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'
import type { AdjacentEpisodes } from '@/lib/adjacent-episodes'
import { EPISODE_HOTKEYS } from '@/lib/player-shortcuts'
import EpisodeNavigation from '@/components/header/EpisodeNavigation'
import { resolveTranslation } from './helpers/i18n-mock'
import type { TranslationArg } from './helpers/i18n-mock'

const { navigateMock, preloadRouteMock, useHotkeyMock, adjacentRef } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    preloadRouteMock: vi.fn(),
    useHotkeyMock: vi.fn<(hotkey: string, callback: () => void) => void>(),
    adjacentRef: { current: null as AdjacentEpisodes | null },
  }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: TranslationArg) =>
      resolveTranslation(key, fallback),
  }),
}))

vi.mock('@tanstack/react-hotkeys', () => ({
  formatForDisplay: (shortcut: string) => shortcut,
  useHotkey: useHotkeyMock,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useRouter: () => ({ preloadRoute: preloadRouteMock }),
}))

vi.mock('@/services/items/queries', () => ({
  useAdjacentEpisodes: () => ({ data: adjacentRef.current }),
}))

vi.mock('@/components/header/EpisodeSwitcher', () => ({
  default: () => <div data-testid="episode-switcher" />,
}))

const current: BaseItemDto = {
  Id: 'ep-2',
  Type: BaseItemKind.Episode,
  SeriesId: 'series',
  SeasonId: 's1',
  ParentIndexNumber: 1,
  IndexNumber: 2,
  Name: 'Middle',
}

const previous: BaseItemDto = {
  Id: 'ep-1',
  Type: BaseItemKind.Episode,
  ParentIndexNumber: 1,
  IndexNumber: 1,
  Name: 'First',
}

const next: BaseItemDto = {
  Id: 'ep-3',
  Type: BaseItemKind.Episode,
  ParentIndexNumber: 1,
  IndexNumber: 3,
  Name: 'Last',
}

/** The handler EpisodeNavigation registered for a hotkey, via the mocked useHotkey. */
function registeredHandler(hotkey: string): () => void {
  const call = useHotkeyMock.mock.calls.findLast(
    ([registered]) => registered === hotkey,
  )
  if (!call) throw new Error(`No handler registered for ${hotkey}`)
  return call[1]
}

const expectedRoute = (itemId: string) => ({
  to: '/player/$itemId',
  params: { itemId },
  search: { fetchSegments: 'true' },
})

describe('EpisodeNavigation', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    preloadRouteMock.mockReset()
    useHotkeyMock.mockReset()
    adjacentRef.current = { previous, next }
  })

  afterEach(() => {
    cleanup()
  })

  it('shows only a next arrow, naming its target and shortcut', () => {
    render(<EpisodeNavigation currentEpisode={current} />)

    const nextButton = screen.getByRole('button', {
      name: 'Next episode: S1E3 Last',
    })

    expect(nextButton.hasAttribute('disabled')).toBe(false)
    expect(nextButton.getAttribute('title')).toBe(
      `S1E3 Last (${EPISODE_HOTKEYS.nextEpisode})`,
    )
    expect(screen.queryByRole('button', { name: /previous/i })).toBeNull()
  })

  it('disables the next arrow at the end of the series', () => {
    adjacentRef.current = { previous, next: null }
    render(<EpisodeNavigation currentEpisode={current} />)

    const nextButton = screen.getByRole('button', { name: 'Next episode' })
    expect(nextButton.hasAttribute('disabled')).toBe(true)
  })

  it('navigates to the next episode on click and preloads it on hover', () => {
    render(<EpisodeNavigation currentEpisode={current} />)

    const nextButton = screen.getByRole('button', {
      name: 'Next episode: S1E3 Last',
    })

    fireEvent.pointerEnter(nextButton)
    expect(preloadRouteMock).toHaveBeenCalledWith(expectedRoute('ep-3'))

    fireEvent.click(nextButton)
    expect(navigateMock).toHaveBeenCalledWith(expectedRoute('ep-3'))
  })

  it('binds both hotkeys and makes them no-ops without a target', () => {
    adjacentRef.current = { previous, next: null }
    render(<EpisodeNavigation currentEpisode={current} />)

    registeredHandler(EPISODE_HOTKEYS.nextEpisode)()
    expect(navigateMock).not.toHaveBeenCalled()

    registeredHandler(EPISODE_HOTKEYS.previousEpisode)()
    expect(navigateMock).toHaveBeenCalledWith(expectedRoute('ep-1'))
  })

  it('renders nothing for items that are not episodes', () => {
    const { container } = render(
      <EpisodeNavigation
        currentEpisode={{ ...current, Type: BaseItemKind.Movie }}
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
