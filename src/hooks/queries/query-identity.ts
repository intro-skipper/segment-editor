/**
 * Scopes every server-backed query to the connection identity it was read
 * under, so one server's or user's data is never served to another.
 */

import { partialMatchKey, useQuery } from '@tanstack/react-query'
import type {
  QueryClient,
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { useApiStore } from '@/stores/api-store'
import type { QueryError } from './query-error-handling'

/** The server and user a cached query belongs to. It never holds the api key or token. */
export interface QueryIdentity {
  readonly serverAddress: string
  readonly userId: string | null
}

const selectIdentity = ({
  serverAddress,
  userId,
}: {
  serverAddress: string
  userId: string | undefined
}): QueryIdentity => ({ serverAddress, userId: userId ?? null })

const belongsTo = (key: QueryKey, identity: QueryIdentity): boolean =>
  partialMatchKey(key, [identity])

/** The query key `parts` under `identity`; every server-backed key is built here. */
export const scopedKey = (
  identity: QueryIdentity,
  ...parts: ReadonlyArray<unknown>
): QueryKey => [identity, ...parts]

/** The current identity, for route loaders and other callers outside React. */
export const currentQueryIdentity = (): QueryIdentity =>
  selectIdentity(useApiStore.getState())

/** The current identity; the caller re-renders when the server or user changes. */
export const useQueryIdentity = (): QueryIdentity =>
  useApiStore(useShallow(selectIdentity))

/**
 * useQuery for server-backed options built for the current identity. The query
 * stays idle without valid auth or while `enabled` is false.
 */
export function useServerQuery<TQueryFnData, TData = TQueryFnData>(
  options: (
    identity: QueryIdentity,
  ) => UseQueryOptions<TQueryFnData, QueryError, TData>,
  enabled = true,
): UseQueryResult<TData, QueryError> {
  const identity = useQueryIdentity()
  const validAuth = useApiStore((s) => s.validAuth)

  return useQuery({ ...options(identity), enabled: validAuth && enabled })
}

/**
 * placeholderData that keeps the previous key's data while the next loads,
 * unless that data was read under another identity.
 */
export const keepPreviousDataOf =
  (identity: QueryIdentity) =>
  <T>(
    previous: T | undefined,
    previousQuery: { queryKey: QueryKey } | undefined,
  ): T | undefined =>
    previousQuery && belongsTo(previousQuery.queryKey, identity)
      ? previous
      : undefined

/**
 * Drops every cached query of another identity once the server or user
 * changes. Call once with the app's QueryClient; returns the unsubscribe.
 */
export function dropPreviousIdentities(queryClient: QueryClient): () => void {
  return useApiStore.subscribe((state) => {
    const identity = selectIdentity(state)
    queryClient.removeQueries({
      predicate: (query) => !belongsTo(query.queryKey, identity),
    })
  })
}
