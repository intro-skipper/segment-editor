import { getRouteApi } from '@tanstack/react-router'

const rootRouteApi = getRouteApi('__root__')

/**
 * Reads the optional collection search param from the root route.
 * This keeps global callers (e.g. Header, CommandPalette) safe on detail pages.
 */
export function useSelectedCollectionSearch(): string | undefined {
  return rootRouteApi.useSearch({ select: (search) => search.collection })
}
