import { scopedKey } from '@/hooks/queries/query-identity'
import type { QueryIdentity } from '@/hooks/queries/query-identity'

/**
 * Type-safe query key factory for segments.
 */
export const segmentsKeys = {
  list: (identity: QueryIdentity, itemId: string) =>
    scopedKey(identity, 'segments', 'list', itemId),
} as const
