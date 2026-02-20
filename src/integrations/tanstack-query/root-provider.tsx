import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  QUERY_GC_TIMES,
  QUERY_STALE_TIMES,
} from '@/hooks/queries/query-constants'
import {
  getRetryDelay,
  shouldRetryQuery,
} from '@/hooks/queries/query-error-handling'

/**
 * Creates a QueryClient with optimized defaults for the Segment Editor.
 * Includes retry logic, stale times, and cache size limits.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: getRetryDelay,
        staleTime: QUERY_STALE_TIMES.MEDIUM,
        gcTime: QUERY_GC_TIMES.MEDIUM,
        refetchOnWindowFocus: false,
        // Avoid burst refetches while still refreshing stale queries
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 1,
        retryDelay: getRetryDelay,
      },
    },
  })
}

// Singleton query client for consistent cache across the app
let queryClientInstance: QueryClient | null = null

export function getContext(): { queryClient: QueryClient } {
  if (!queryClientInstance) {
    queryClientInstance = createQueryClient()
  }
  return {
    queryClient: queryClientInstance,
  }
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
}): React.ReactNode {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
