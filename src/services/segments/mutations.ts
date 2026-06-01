/**
 * TanStack Query mutation hooks for segment CRUD operations.
 * Provides optimistic updates, rollback verification, and cache invalidation.
 */

import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { batchSaveSegments, deleteSegment } from '@/services/segments/api'
import { segmentsKeys } from './query-keys'
import {
  QueryError,
  handleQueryError,
} from '@/hooks/queries/query-error-handling'
import { showError, showSuccess } from '@/lib/notifications'
import { ErrorCodes } from '@/lib/unified-error'
import { isValidItemId } from '@/lib/schemas'

interface BatchSaveInput {
  itemId: string
  existingSegments: Array<MediaSegmentDto>
  newSegments: Array<MediaSegmentDto>
}

interface OptimisticContext {
  previousSegments?: Array<MediaSegmentDto>
  rolledBack?: boolean
}

const DELETE_SEGMENT_NOT_CONFIRMED_MESSAGE =
  'The server did not confirm the delete. Please try again.'

const DELETE_SEGMENT_INVALID_MESSAGE = 'Invalid or missing segment ID'

const handleMutationError = (operation: string) => (error: unknown) => {
  const e = QueryError.from(error)
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

const validateDeleteInput = (segment: MediaSegmentDto) => {
  if (!isValidItemId(segment.Id)) {
    throw QueryError.validation(DELETE_SEGMENT_INVALID_MESSAGE)
  }
}

export const useDeleteSegment = () => {
  const qc = useQueryClient()
  const getController = useAbortController()

  return useMutation<boolean, QueryError, MediaSegmentDto, OptimisticContext>({
    mutationFn: wrapMutationFn(async (segment, signal) => {
      validateDeleteInput(segment)
      const deleted = await deleteSegment(segment, { signal })
      if (!deleted) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        throw new Error(DELETE_SEGMENT_NOT_CONFIRMED_MESSAGE)
      }
      return deleted
    }, getController),
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
    onSettled: () => {},
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
