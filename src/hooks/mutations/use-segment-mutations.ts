/**
 * TanStack Query mutation hooks for segment CRUD operations.
 * Provides optimistic updates and cache invalidation for segments.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MediaSegmentDto } from '@/types/jellyfin'
import type { CreateSegmentInput } from '@/services/segments/api'
import {
  batchSaveSegments,
  createSegment,
  createSegmentFromInput,
  deleteSegment,
} from '@/services/segments/api'
import { segmentsKeys } from '@/hooks/queries/use-segments'

/**
 * Input for batch saving segments.
 */
export interface BatchSaveInput {
  /** Item ID for the segments */
  itemId: string
  /** Existing segments to delete */
  existingSegments: Array<MediaSegmentDto>
  /** New segments to create */
  newSegments: Array<MediaSegmentDto>
  /** Optional provider ID override */
  providerId?: string
}

/**
 * Hook for creating a new segment.
 * Provides optimistic updates and automatic cache invalidation.
 *
 * @returns Mutation result with create function
 *
 * @example
 * ```tsx
 * const createMutation = useCreateSegment()
 *
 * const handleCreate = () => {
 *   createMutation.mutate({
 *     itemId: 'abc123',
 *     type: MediaSegmentType.Intro,
 *     startSeconds: 0,
 *     endSeconds: 90,
 *   })
 * }
 * ```
 */
export function useCreateSegment() {
  const queryClient = useQueryClient()

  return useMutation<MediaSegmentDto | false, Error, CreateSegmentInput>({
    mutationFn: (input) => createSegmentFromInput(input),
    onSuccess: (data, variables) => {
      if (data !== false) {
        // Invalidate segments cache for this item
        queryClient.invalidateQueries({
          queryKey: segmentsKeys.list(variables.itemId),
        })
      }
    },
  })
}

/**
 * Hook for creating a segment from a full MediaSegmentDto.
 * Useful when you have a complete segment object to create.
 *
 * @returns Mutation result with create function
 */
export function useCreateSegmentFromDto() {
  const queryClient = useQueryClient()

  return useMutation<
    MediaSegmentDto | false,
    Error,
    { segment: MediaSegmentDto; providerId?: string }
  >({
    mutationFn: ({ segment, providerId }) => createSegment(segment, providerId),
    onSuccess: (data, variables) => {
      if (data !== false && variables.segment.ItemId) {
        queryClient.invalidateQueries({
          queryKey: segmentsKeys.list(variables.segment.ItemId),
        })
      }
    },
  })
}

/**
 * Hook for deleting a segment.
 * Provides optimistic updates for immediate UI feedback.
 *
 * @returns Mutation result with delete function
 *
 * @example
 * ```tsx
 * const deleteMutation = useDeleteSegment()
 *
 * const handleDelete = (segment: MediaSegmentDto) => {
 *   deleteMutation.mutate(segment)
 * }
 * ```
 */
export function useDeleteSegment() {
  const queryClient = useQueryClient()

  return useMutation<
    boolean,
    Error,
    MediaSegmentDto,
    { previousSegments?: Array<MediaSegmentDto> }
  >({
    mutationFn: deleteSegment,
    onMutate: async (segment) => {
      // Cancel any outgoing refetches
      if (segment.ItemId) {
        await queryClient.cancelQueries({
          queryKey: segmentsKeys.list(segment.ItemId),
        })
      }

      // Snapshot the previous value
      const previousSegments = segment.ItemId
        ? queryClient.getQueryData<Array<MediaSegmentDto>>(
            segmentsKeys.list(segment.ItemId),
          )
        : undefined

      // Optimistically remove the segment
      if (segment.ItemId && previousSegments) {
        queryClient.setQueryData<Array<MediaSegmentDto>>(
          segmentsKeys.list(segment.ItemId),
          previousSegments.filter((s) => s.Id !== segment.Id),
        )
      }

      return { previousSegments }
    },
    onError: (_error, segment, context) => {
      // Rollback on error
      if (segment.ItemId && context?.previousSegments) {
        queryClient.setQueryData(
          segmentsKeys.list(segment.ItemId),
          context.previousSegments,
        )
      }
    },
    onSettled: (_data, _error, segment) => {
      // Always refetch after error or success
      if (segment.ItemId) {
        queryClient.invalidateQueries({
          queryKey: segmentsKeys.list(segment.ItemId),
        })
      }
    },
  })
}

/**
 * Hook for batch saving segments.
 * Deletes existing segments and creates new ones in a single operation.
 * Provides optimistic updates for immediate UI feedback.
 *
 * @returns Mutation result with batch save function
 *
 * @example
 * ```tsx
 * const batchSaveMutation = useBatchSaveSegments()
 *
 * const handleSaveAll = () => {
 *   batchSaveMutation.mutate({
 *     itemId: 'abc123',
 *     existingSegments: serverSegments,
 *     newSegments: editedSegments,
 *   })
 * }
 * ```
 */
export function useBatchSaveSegments() {
  const queryClient = useQueryClient()

  return useMutation<
    Array<MediaSegmentDto>,
    Error,
    BatchSaveInput,
    { previousSegments?: Array<MediaSegmentDto> }
  >({
    mutationFn: ({ itemId, existingSegments, newSegments, providerId }) =>
      batchSaveSegments(itemId, existingSegments, newSegments, providerId),
    onMutate: async ({ itemId, newSegments }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: segmentsKeys.list(itemId),
      })

      // Snapshot the previous value
      const previousSegments = queryClient.getQueryData<Array<MediaSegmentDto>>(
        segmentsKeys.list(itemId),
      )

      // Optimistically update to the new segments
      queryClient.setQueryData<Array<MediaSegmentDto>>(
        segmentsKeys.list(itemId),
        newSegments,
      )

      return { previousSegments }
    },
    onError: (_error, { itemId }, context) => {
      // Rollback on error
      if (context?.previousSegments) {
        queryClient.setQueryData(
          segmentsKeys.list(itemId),
          context.previousSegments,
        )
      }
    },
    onSettled: (_data, _error, { itemId }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({
        queryKey: segmentsKeys.list(itemId),
      })
    },
  })
}
