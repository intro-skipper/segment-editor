/**
 * TanStack Query mutation hooks for segment CRUD operations.
 * Provides optimistic updates, rollback verification, and cache invalidation.
 */

import { useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { batchSaveSegments, deleteSegment } from '@/services/segments/api'
import { segmentsKeys } from '@/hooks/queries/use-segments'
import {
  QueryError,
  handleQueryError,
} from '@/hooks/queries/query-error-handling'
import { showError, showSuccess } from '@/lib/notifications'
import { isAbortError } from '@/lib/unified-error'

interface BatchSaveInput {
  itemId: string
  existingSegments: Array<MediaSegmentDto>
  newSegments: Array<MediaSegmentDto>
}

interface OptimisticContext {
  previousSegments?: Array<MediaSegmentDto>
  rolledBack?: boolean
}

// Shared utilities
const handleMutationError = (operation: string) => (error: unknown) => {
  if (isAbortError(error)) return
  const e = QueryError.from(error)
  handleQueryError(e, { operation })
  showError(
    `${operation} failed`,
    e.recoverable ? 'Please try again' : e.message,
  )
}

const useAbortController = () => {
  const ref = useRef<AbortController | null>(null)
  return useCallback(() => {
    ref.current?.abort()
    ref.current = new AbortController()
    return ref.current
  }, [])
}

/** Wraps async fn with QueryError conversion */
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

/** Rollback helper for optimistic updates */
const rollbackSegments = (
  qc: QueryClient,
  itemId: string,
  previous: Array<MediaSegmentDto> | undefined,
  ctx: OptimisticContext,
) => {
  if (!previous) return
  qc.setQueryData(segmentsKeys.list(itemId), previous)
  const current = qc.getQueryData<Array<MediaSegmentDto>>(
    segmentsKeys.list(itemId),
  )
  if (
    !current ||
    current.length !== previous.length ||
    !previous.every((s) => current.some((c) => c.Id === s.Id))
  ) {
    qc.invalidateQueries({ queryKey: segmentsKeys.list(itemId) })
  }
  ctx.rolledBack = true
}

export const useDeleteSegment = () => {
  const qc = useQueryClient()
  const getController = useAbortController()

  return useMutation<boolean, QueryError, MediaSegmentDto, OptimisticContext>({
    mutationFn: wrapMutationFn(
      (segment, signal) => deleteSegment(segment, { signal }),
      getController,
    ),
    onMutate: async (segment) => {
      if (!segment.ItemId) return { rolledBack: false }
      await qc.cancelQueries({ queryKey: segmentsKeys.list(segment.ItemId) })
      const previousSegments = qc.getQueryData<Array<MediaSegmentDto>>(
        segmentsKeys.list(segment.ItemId),
      )
      if (previousSegments) {
        qc.setQueryData<Array<MediaSegmentDto>>(
          segmentsKeys.list(segment.ItemId),
          previousSegments.filter((s) => s.Id !== segment.Id),
        )
      }
      return { previousSegments, rolledBack: false }
    },
    onError: (error, segment, ctx) => {
      if (segment.ItemId && ctx?.previousSegments)
        rollbackSegments(qc, segment.ItemId, ctx.previousSegments, ctx)
      handleMutationError('Delete segment')(error)
    },
    onSuccess: (_data, segment) => {
      if (segment.ItemId) showSuccess('Segment deleted')
    },
    onSettled: () => {
      // Keep optimistic cache result to avoid redundant refetch.
      // Rollback path already restores previous data when needed.
    },
  })
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
