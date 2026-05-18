import { createQueryKey } from '@/hooks/queries/query-error-handling'

/**
 * Type-safe query key factory for segments.
 */
export const segmentsKeys = {
  all: createQueryKey('segments'),
  lists: () => createQueryKey('segments', 'list'),
  list: (itemId: string) => createQueryKey('segments', 'list', itemId),
} as const
