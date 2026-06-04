/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto, VirtualFolderInfo } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'
import FilterView from '@/components/filter/FilterView'
import { useSessionStore } from '@/stores/session-store'

const navigateMock = vi.hoisted(() => vi.fn())
const refetchCollectionsMock = vi.hoisted(() => vi.fn())
const refetchItemsMock = vi.hoisted(() => vi.fn())
const useItemsOptionsMock = vi.hoisted(() => vi.fn())

const routeSearchState = vi.hoisted(() => ({
  current: {} as { collection?: string; page?: number; search?: string },
}))

const pluginModeState = vi.hoisted(() => ({
  current: {
    isPlugin: false,
    hasCredentials: true,
    isConnected: true,
  },
}))

const collectionsQueryState = vi.hoisted(() => ({
  current: {
    data: [] as Array<VirtualFolderInfo> | undefined,
    isLoading: false,
    error: null as Error | null,
    refetch: refetchCollectionsMock,
  },
}))

const itemsQueryState = vi.hoisted(() => ({
  current: {
    data: undefined as
      | { items: Array<BaseItemDto>; totalCount: number }
      | undefined,
    isLoading: false,
    error: null as Error | null,
    refetch: refetchItemsMock,
  },
}))

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => routeSearchState.current,
  }),
  useNavigate: () => navigateMock,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?:
        | string
        | {
            defaultValue?: string
            page?: number
            start?: number
            end?: number
            total?: number
          },
    ) => {
      if (key === 'common.retry') return 'Retry'
      if (key === 'accessibility.pagination.previous') return 'Previous page'
      if (key === 'accessibility.pagination.next') return 'Next page'
      if (
        key === 'accessibility.pagination.page' &&
        typeof options === 'object'
      ) {
        return `Page ${options.page}`
      }
      if (key === 'items.showing' && typeof options === 'object') {
        return `Showing ${options.start}-${options.end} of ${options.total}`
      }
      if (typeof options === 'object' && options.defaultValue)
        return options.defaultValue
      if (typeof options === 'string') return options
      return key
    },
  }),
}))

vi.mock('@/services/items/queries', () => ({
  useCollections: () => collectionsQueryState.current,
  useItems: (options: unknown) => {
    useItemsOptionsMock(options)
    return itemsQueryState.current
  },
}))

vi.mock('@/hooks/use-connection-init', () => ({
  usePluginMode: () => pluginModeState.current,
}))

vi.mock('@/hooks/use-vibrant-color', () => ({
  preloadVibrantColors: vi.fn(),
  useVibrantColor: () => null,
}))

vi.mock('@/components/filter/LibraryCard', () => ({
  LibraryCard: ({
    collection: library,
    onSelect,
  }: {
    collection: VirtualFolderInfo
    onSelect: (collectionId: string | null) => void
  }) => (
    <button type="button" onClick={() => onSelect(library.ItemId ?? null)}>
      Browse {library.Name} library
    </button>
  ),
}))

vi.mock('@/components/filter/MediaCard', () => ({
  MediaCard: ({
    item,
    'data-grid-index': gridIndex,
  }: {
    item: BaseItemDto
    'data-grid-index'?: number
  }) => (
    <button type="button" data-grid-index={gridIndex}>
      {item.Name}
    </button>
  ),
}))

function makeCollection(id: string, name: string): VirtualFolderInfo {
  return { ItemId: id, Name: name } as VirtualFolderInfo
}

function mediaItem(id: string, name: string): BaseItemDto {
  return {
    Id: id,
    Name: name,
    Type: BaseItemKind.Movie,
    ProductionYear: 2024,
  }
}

describe('FilterView', () => {
  beforeEach(() => {
    routeSearchState.current = {}
    pluginModeState.current = {
      isPlugin: false,
      hasCredentials: true,
      isConnected: true,
    }
    collectionsQueryState.current = {
      data: [],
      isLoading: false,
      error: null,
      refetch: refetchCollectionsMock,
    }
    itemsQueryState.current = {
      data: undefined,
      isLoading: false,
      error: null,
      refetch: refetchItemsMock,
    }
    navigateMock.mockReset()
    refetchCollectionsMock.mockReset()
    refetchItemsMock.mockReset()
    useItemsOptionsMock.mockReset()
    useSessionStore.setState({
      settingsOpen: false,
      pageSize: 24,
      viewMode: 'card',
    })
    window.scrollTo = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the disconnected state and opens settings', () => {
    pluginModeState.current = {
      isPlugin: false,
      hasCredentials: false,
      isConnected: false,
    }

    render(<FilterView />)

    expect(screen.getByText('Not Connected')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))

    expect(useSessionStore.getState().settingsOpen).toBe(true)
  })

  it('renders the plugin connecting state', () => {
    pluginModeState.current = {
      isPlugin: true,
      hasCredentials: true,
      isConnected: false,
    }

    render(<FilterView />)

    expect(screen.getByText('Connecting…')).toBeTruthy()
    expect(
      screen.getByText('Establishing connection to Jellyfin server'),
    ).toBeTruthy()
  })

  it('renders libraries and resets filter search when selecting one', () => {
    collectionsQueryState.current = {
      data: [
        makeCollection('movies', 'Movies'),
        makeCollection('series', 'Series'),
      ],
      isLoading: false,
      error: null,
      refetch: refetchCollectionsMock,
    }

    render(<FilterView />)

    expect(
      screen.getByRole('heading', { name: 'Select a Library' }),
    ).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Browse Movies library' }),
    )

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/',
      search: {
        collection: 'movies',
        page: undefined,
        search: undefined,
      },
      replace: true,
    })
  })

  it('renders loading and collection errors with retry', () => {
    collectionsQueryState.current = {
      data: undefined,
      isLoading: true,
      error: null,
      refetch: refetchCollectionsMock,
    }

    const { rerender } = render(<FilterView />)

    expect(screen.getByText('Loading media items')).toBeTruthy()

    collectionsQueryState.current = {
      data: undefined,
      isLoading: false,
      error: new Error('Collections failed'),
      refetch: refetchCollectionsMock,
    }
    rerender(<FilterView />)

    expect(screen.getByRole('alert').textContent).toContain(
      'Collections failed',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(refetchCollectionsMock).toHaveBeenCalledTimes(1)
  })

  it('renders the empty selected-library state', () => {
    routeSearchState.current = { collection: 'movies' }
    itemsQueryState.current = {
      data: { items: [], totalCount: 0 },
      isLoading: false,
      error: null,
      refetch: refetchItemsMock,
    }

    render(<FilterView />)

    expect(screen.getByText('No items found')).toBeTruthy()
    expect(useItemsOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'movies',
        limit: 24,
        startIndex: 0,
        enabled: true,
      }),
    )
  })

  it('renders results with paging controls and navigates pages', () => {
    routeSearchState.current = {
      collection: 'movies',
      page: 1,
      search: 'alien',
    }
    itemsQueryState.current = {
      data: {
        items: [mediaItem('movie-1', 'Alien'), mediaItem('movie-2', 'Aliens')],
        totalCount: 48,
      },
      isLoading: false,
      error: null,
      refetch: refetchItemsMock,
    }

    render(<FilterView />)

    expect(screen.getByRole('status').textContent).toBe('Showing 1-24 of 48')
    expect(screen.getByRole('grid', { name: 'Media items' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Alien' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aliens' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/',
      search: expect.any(Function),
      replace: true,
    })

    const navigation = navigateMock.mock.calls[0]?.[0]
    expect(
      navigation.search({ collection: 'movies', search: 'alien' }),
    ).toEqual({
      collection: 'movies',
      search: 'alien',
      page: 2,
    })
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('renders list-mode rows and navigates on activation', () => {
    useSessionStore.setState({ viewMode: 'list' })
    routeSearchState.current = { collection: 'movies' }
    itemsQueryState.current = {
      data: {
        items: [mediaItem('movie-1', 'Blade Runner')],
        totalCount: 1,
      },
      isLoading: false,
      error: null,
      refetch: refetchItemsMock,
    }

    render(<FilterView />)

    expect(screen.getByRole('grid', { name: 'Media items' })).toBeTruthy()
    expect(screen.getAllByText('Blade Runner').length).toBeGreaterThan(0)

    fireEvent.click(
      screen.getByRole('gridcell', {
        name: 'accessibility.mediaCard.playMovie',
      }),
    )

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/player/$itemId',
      params: { itemId: 'movie-1' },
      search: { fetchSegments: 'true' },
    })
  })

  it('retries item errors through the items query', () => {
    routeSearchState.current = { collection: 'movies' }
    itemsQueryState.current = {
      data: undefined,
      isLoading: false,
      error: new Error('Items failed'),
      refetch: refetchItemsMock,
    }

    render(<FilterView />)

    expect(screen.getByRole('alert').textContent).toContain('Items failed')

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(refetchItemsMock).toHaveBeenCalledTimes(1)
    expect(refetchCollectionsMock).not.toHaveBeenCalled()
  })

  it('renders pagination ellipses and disables boundary controls', () => {
    routeSearchState.current = { collection: 'movies', page: 5 }
    itemsQueryState.current = {
      data: {
        items: [mediaItem('movie-5', 'Middle Page')],
        totalCount: 240,
      },
      isLoading: false,
      error: null,
      refetch: refetchItemsMock,
    }

    const { rerender } = render(<FilterView />)

    expect(screen.getByRole('button', { name: 'Page 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Page 4' })).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Page 5' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getByRole('button', { name: 'Page 6' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Page 10' })).toBeTruthy()
    expect(screen.getAllByText('More pages')).toHaveLength(2)

    routeSearchState.current = { collection: 'movies', page: 1 }
    itemsQueryState.current = {
      data: {
        items: [mediaItem('movie-1', 'First Page')],
        totalCount: 48,
      },
      isLoading: false,
      error: null,
      refetch: refetchItemsMock,
    }
    rerender(<FilterView />)

    expect(
      screen
        .getByRole('button', { name: 'Previous page' })
        .getAttribute('aria-disabled'),
    ).toBe('true')

    routeSearchState.current = { collection: 'movies', page: 2 }
    itemsQueryState.current = {
      data: {
        items: [mediaItem('movie-2', 'Last Page')],
        totalCount: 48,
      },
      isLoading: false,
      error: null,
      refetch: refetchItemsMock,
    }
    rerender(<FilterView />)

    expect(
      screen
        .getByRole('button', { name: 'Next page' })
        .getAttribute('aria-disabled'),
    ).toBe('true')
  })
})
