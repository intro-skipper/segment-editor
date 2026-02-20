import { useSearch } from '@tanstack/react-router'

interface SearchWithCollection {
  collection?: unknown
}

/**
 * Reads the optional collection search param safely across any route.
 */
export function useSelectedCollectionSearch(): string | undefined {
  return useSearch({
    strict: false,
    shouldThrow: false,
    select: (search) => {
      const value = (search as SearchWithCollection | undefined)?.collection
      return typeof value === 'string' ? value : undefined
    },
  })
}
