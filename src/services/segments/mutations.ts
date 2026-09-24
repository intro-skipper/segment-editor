/**
 * TanStack Query mutation hooks for segment CRUD operations.
 * Provides optimistic updates, rollback verification, and cache invalidation.
 */

import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { batchSaveSegments } from '@/services/segments/api'
import { segmentsKeys } from './query-keys'
import {
  QueryError,
  handleQueryError,
} from '@/hooks/queries/query-error-handling'
import { showError, showSuccess } from '@/lib/notifications'
import { ErrorCodes } from '@/lib/unified-error'

interface BatchSaveInput {
  itemId: string
  existingSegments: Array<MediaSegmentDto>
  newSegments: Array<MediaSegmentDto>
}

interface OptimisticContext {
  previousSegments?: Array<MediaSegmentDto>
  rolledBack?: boolean
}

const handleMutationError = (operation: string) => (cause: unknown) => {
  const e = QueryError.from(cause)
  if (e.code === ErrorCodes.CANCELLED) return
  handleQueryError(e, { operation })
  showError(
    `${operation} failed`,
    e.recoverable ? 'Please try again' : e.message,
  )
}

const useAbortController = () => {
  const ref = useRef<AbortController | null>(null)
  return () => {
    ref.current?.abort()
    ref.current = new AbortController()
    return ref.current
  }
}

const wrapMutationFn =
  <TInput, TResult>(
    fn: (input: TInput, signal: AbortSignal) => Promise<TResult>,
    getController: () => AbortController,
  ) =>
  async (input: TInput): Promise<TResult> => {
    try {
      return await fn(input, getController().signal)
    } catch (e) {
      throw QueryError.from(e)
    }
  }

const rollbackSegments = (
  qc: QueryClient,
  itemId: string,
  previous: Array<MediaSegmentDto> | undefined,
  ctx: OptimisticContext,
) => {
  if (!previous) return
  const current = qc.getQueryData<Array<MediaSegmentDto>>(
    segmentsKeys.list(itemId),
  )
  qc.setQueryData(segmentsKeys.list(itemId), previous)
  if (!current || current.length !== previous.length) {
    void qc.invalidateQueries({ queryKey: segmentsKeys.list(itemId) })
  } else {
    const currentIds = new Set(current.map((segment) => segment.Id))
    if (!previous.every((segment) => currentIds.has(segment.Id))) {
      void qc.invalidateQueries({ queryKey: segmentsKeys.list(itemId) })
    }
  }
  ctx.rolledBack = true
}

export const useBatchSaveSegments = () => {
  const qc = useQueryClient()
  const getController = useAbortController()

  return useMutation<
    Array<MediaSegmentDto>,
    QueryError,
    BatchSaveInput,
    OptimisticContext
  >({
    mutationFn: wrapMutationFn(
      ({ itemId, existingSegments, newSegments }, signal) =>
        batchSaveSegments(itemId, existingSegments, newSegments, {
          signal,
        }),
      getController,
    ),
    onMutate: async ({ itemId, newSegments }) => {
      await qc.cancelQueries({ queryKey: segmentsKeys.list(itemId) })
      const previousSegments = qc.getQueryData<Array<MediaSegmentDto>>(
        segmentsKeys.list(itemId),
      )
      qc.setQueryData<Array<MediaSegmentDto>>(
        segmentsKeys.list(itemId),
        newSegments,
      )
      return { previousSegments, rolledBack: false }
    },
    onError: (error, { itemId }, ctx) => {
      if (ctx?.previousSegments)
        rollbackSegments(qc, itemId, ctx.previousSegments, ctx)
      handleMutationError('Save segments')(error)
    },
    onSuccess: (data, { itemId, newSegments }) => {
      qc.setQueryData<Array<MediaSegmentDto>>(segmentsKeys.list(itemId), data)

      const saved = data.length
      const expected = newSegments.length
      if (saved === expected) showSuccess('All segments saved')
      else if (saved > 0)
        showError('Partial save', `${saved} of ${expected} segments saved`)
    },
    onSettled: (_data, _error, { itemId }, ctx) => {
      if (!ctx?.rolledBack) {
        void qc.invalidateQueries({ queryKey: segmentsKeys.list(itemId) })
      }
    },
  })
}
