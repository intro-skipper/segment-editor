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
    useHotkeyMock: vi.fn(),
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

/** The handler EpisodeNavigation registered for a hotkey, via the mocked useHotkey. */
function registeredHandler(hotkey: string): () => void {
  const call = useHotkeyMock.mock.calls.findLast(
    ([registered]) => registered === hotkey,
  )
  if (!call) throw new Error(`No handler registered for ${hotkey}`)
  return call[1] as () => void
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
    adjacentRef.current = { previous, next: null }
  })

  afterEach(() => {
    cleanup()
  })

  it('enables the arrow that has a target and disables the one at the series boundary', () => {
    render(<EpisodeNavigation currentEpisode={current} />)

    const prevButton = screen.getByRole('button', {
      name: 'Previous episode: S1E1 First',
    })
    const nextButton = screen.getByRole('button', { name: 'Next episode' })

    expect(prevButton.hasAttribute('disabled')).toBe(false)
    expect(nextButton.hasAttribute('disabled')).toBe(true)
    expect(prevButton.getAttribute('title')).toBe(
      `S1E1 First (${EPISODE_HOTKEYS.previousEpisode})`,
    )
  })

  it('navigates to the target on click and preloads it on hover', () => {
    render(<EpisodeNavigation currentEpisode={current} />)

    const prevButton = screen.getByRole('button', {
      name: 'Previous episode: S1E1 First',
    })

    fireEvent.pointerEnter(prevButton)
    expect(preloadRouteMock).toHaveBeenCalledWith(expectedRoute('ep-1'))

    fireEvent.click(prevButton)
    expect(navigateMock).toHaveBeenCalledWith(expectedRoute('ep-1'))
  })

  it('binds the hotkeys and makes them no-ops without a target', () => {
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
