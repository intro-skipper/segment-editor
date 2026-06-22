import { createQueryKey } from '@/hooks/queries/query-error-handling'

/**
 * Type-safe query key factory for segments.
 */
export const segmentsKeys = {
  list: (itemId: string) => createQueryKey('segments', 'list', itemId),
} as const
