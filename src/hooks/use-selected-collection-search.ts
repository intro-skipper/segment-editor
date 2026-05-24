import { useSearch } from '@tanstack/react-router'

/**
 * Reads the optional collection search param safely across any route.
 */
export function useSelectedCollectionSearch(): string | undefined {
  return useSearch({
    strict: false,
    shouldThrow: false,
    select: (search) => {
      const value = search.collection
      return typeof value === 'string' ? value : undefined
    },
  })
}
