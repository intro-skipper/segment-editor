/**
 * Query cache time constants.
 * Centralized configuration for TanStack Query stale and garbage collection times.
 */

/** Time in milliseconds before data is considered stale */
export const QUERY_STALE_TIMES = {
  /** 30 seconds - for frequently changing data like segments */
  SHORT: 30 * 1000,
  /** 2 minutes - for moderately changing data like items list */
  MEDIUM: 2 * 60 * 1000,
  /** 5 minutes - for stable data like item details, seasons, tracks */
  LONG: 5 * 60 * 1000,
} as const

/** Time in milliseconds before unused data is garbage collected */
export const QUERY_GC_TIMES = {
  /** 5 minutes - for data that should be cleaned up quickly */
  SHORT: 5 * 60 * 1000,
  /** 10 minutes - for moderately important cached data */
  MEDIUM: 10 * 60 * 1000,
  /** 30 minutes - for data that should persist longer */
  LONG: 30 * 60 * 1000,
} as const
