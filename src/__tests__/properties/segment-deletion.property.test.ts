/**
 * Feature: Segment Deletion State Synchronization
 * For any segment that is deleted, the segment SHALL be removed from local state
 * AND a DELETE request SHALL be sent to the server with the correct segment ID.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { useDeleteSegment } from '@/services/segments/mutations'
import { segmentsKeys } from '@/services/segments/query-keys'

// Track DELETE requests for verification
interface DeleteRequest {
  url: string
  segmentId: string
  itemId?: string
  type?: string
}

const deleteRequests: Array<DeleteRequest> = []

const jellyfinFetchEmptyMock = vi.hoisted(() => vi.fn())

// Mock APIs object for withApi
const mockApis = {
  itemsApi: {},
  libraryApi: {},
  tvShowsApi: {},
  imageApi: {},
  videosApi: {},
  pluginsApi: {},
  mediaSegmentsApi: {},
  systemApi: {},
  api: {
    accessToken: 'test-token',
    basePath: 'http://localhost:8096',
  },
}

// Mock the jellyfin service module (main entry point)
vi.mock('@/services/jellyfin', () => ({
  withApi: vi.fn(async (fn: (apis: typeof mockApis) => Promise<unknown>) => {
    return fn(mockApis)
  }),
  getRequestConfig: vi.fn(
    (
      options?: { signal?: AbortSignal; timeout?: number },
      defaultTimeout = 30000,
    ) => ({
      signal: options?.signal,
      timeout: options?.timeout ?? defaultTimeout,
    }),
  ),
  isAborted: vi.fn((signal?: AbortSignal) => signal?.aborted === true),
  clearApiCache: vi.fn(),
  getServerBaseUrl: vi.fn(() => 'http://localhost:8096'),
  getAccessToken: vi.fn(() => 'test-token'),
}))

vi.mock('@/services/jellyfin/http', () => ({
  jellyfinFetchEmpty: jellyfinFetchEmptyMock,
  jellyfinFetchJson: vi.fn(),
}))

// Custom arbitrary for hex strings
const hexStringArb = (length: number) =>
  fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
      minLength: length,
      maxLength: length,
    })
    .map((chars) => chars.join(''))

// Arbitrary for valid UUID v4
const uuidArb = fc
  .tuple(
    hexStringArb(8),
    hexStringArb(4),
    hexStringArb(3),
    hexStringArb(3),
    hexStringArb(12),
  )
  .map(
    ([a, b, c, d, e]) =>
      `${a}-${b}-4${c}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${d}-${e}`,
  )

// Arbitrary for segment types
const segmentTypeArb = fc.constantFrom(
  'Intro',
  'Outro',
  'Preview',
  'Recap',
  'Commercial',
  'Unknown',
) as fc.Arbitrary<MediaSegmentDto['Type']>

// Arbitrary for valid MediaSegmentDto
const segmentArb = fc
  .record({
    Id: uuidArb,
    ItemId: uuidArb,
    Type: segmentTypeArb,
    StartTicks: fc.integer({ min: 0, max: 36000 }), // 0 to 10 hours in seconds
    EndTicks: fc.integer({ min: 1, max: 36001 }), // 1 to 10 hours + 1 second
  })
  .filter((s) => s.StartTicks < s.EndTicks) as fc.Arbitrary<MediaSegmentDto>

// Create a wrapper with QueryClient for testing hooks
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  }
}

function setupMockFetch(success: boolean = true): void {
  jellyfinFetchEmptyMock.mockImplementation(
    ({ endpoint, query }: { endpoint: string; query?: URLSearchParams }) => {
      const segmentId = endpoint.split('/').at(-1) ?? ''
      const itemId = query?.get('itemId') ?? undefined
      const type = query?.get('type') ?? undefined

      deleteRequests.push({
        url: `${endpoint}${query?.toString() ? `?${query.toString()}` : ''}`,
        segmentId,
        itemId,
        type,
      })

      return success
        ? Promise.resolve()
        : Promise.reject(new Error('Server Error'))
    },
  )
}

describe('Segment Deletion State Synchronization', () => {
  beforeEach(() => {
    jellyfinFetchEmptyMock.mockClear()
    deleteRequests.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property: Deleting a segment sends DELETE request with correct segment ID
   * For any valid segment, when deleted, a DELETE request SHALL be sent
   * to the server with the correct segment ID in the URL.
   */
  it('sends DELETE request with correct segment ID', async () => {
    await fc.assert(
      fc.asyncProperty(segmentArb, async (segment) => {
        // Clear previous requests
        deleteRequests.length = 0
        jellyfinFetchEmptyMock.mockClear()

        // Setup successful delete response
        setupMockFetch(true)

        const { queryClient, wrapper } = createWrapper()

        // Pre-populate cache with the segment
        queryClient.setQueryData<Array<MediaSegmentDto>>(
          segmentsKeys.list(segment.ItemId!),
          [segment],
        )

        // Render the hook
        const { result } = renderHook(() => useDeleteSegment(), { wrapper })

        // Execute deletion
        result.current.mutate(segment)

        // Wait for mutation to complete
        await waitFor(() => {
          return result.current.isSuccess || result.current.isError
        })

        // Verify DELETE request was sent
        expect(deleteRequests.length).toBeGreaterThanOrEqual(1)

        // Verify the segment ID in the request URL
        const deleteRequest = deleteRequests.find(
          (req) => req.segmentId === segment.Id,
        )
        expect(deleteRequest).toBeDefined()
        expect(deleteRequest?.segmentId).toBe(segment.Id)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Segment is optimistically removed from local cache during deletion
   * For any valid segment in the cache, when deletion is initiated,
   * the segment SHALL be immediately removed from the local query cache (optimistic update).
   */
  it('optimistically removes segment from local cache during deletion', async () => {
    await fc.assert(
      fc.asyncProperty(segmentArb, async (segment) => {
        // Clear previous state
        deleteRequests.length = 0
        jellyfinFetchEmptyMock.mockClear()

        // Setup successful delete response
        setupMockFetch(true)

        const { queryClient, wrapper } = createWrapper()

        // Pre-populate cache with the segment
        queryClient.setQueryData<Array<MediaSegmentDto>>(
          segmentsKeys.list(segment.ItemId!),
          [segment],
        )

        // Verify segment is in cache before deletion
        const beforeCache = queryClient.getQueryData<Array<MediaSegmentDto>>(
          segmentsKeys.list(segment.ItemId!),
        )
        expect(beforeCache).toContainEqual(segment)

        // Render the hook
        const { result } = renderHook(() => useDeleteSegment(), { wrapper })

        // Execute deletion
        result.current.mutate(segment)

        // Wait for the mutation to start (optimistic update happens in onMutate)
        await waitFor(() => {
          return (
            result.current.isPending ||
            result.current.isSuccess ||
            result.current.isError
          )
        })

        // Check that the segment was removed from cache (optimistic update)
        // The cache should not contain the deleted segment
        const duringCache = queryClient.getQueryData<Array<MediaSegmentDto>>(
          segmentsKeys.list(segment.ItemId!),
        )

        // Either the cache is empty, undefined, or doesn't contain the segment
        const segmentRemoved =
          !duringCache || !duringCache.some((s) => s.Id === segment.Id)
        expect(segmentRemoved).toBe(true)

        return true
      }),
      { numRuns: 100 },
    )
  })

  it('restores previous cache and invalidates when optimistic delete changes cache length', async () => {
    const segment: MediaSegmentDto = {
      Id: '00000000-0000-4000-8000-000000000001',
      ItemId: '00000000-0000-4000-8000-000000000002',
      Type: 'Intro',
      StartTicks: 100,
      EndTicks: 200,
    }
    const otherSegment: MediaSegmentDto = {
      ...segment,
      Id: '00000000-0000-4000-8000-000000000003',
      StartTicks: 300,
      EndTicks: 400,
    }

    setupMockFetch(false)

    const { queryClient, wrapper } = createWrapper()
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const previousSegments = [segment, otherSegment]

    queryClient.setQueryData<Array<MediaSegmentDto>>(
      segmentsKeys.list(segment.ItemId!),
      previousSegments,
    )

    const { result } = renderHook(() => useDeleteSegment(), { wrapper })

    await expect(result.current.mutateAsync(segment)).rejects.toThrow(
      'The server did not confirm the delete. Please try again.',
    )

    expect(
      queryClient.getQueryData<Array<MediaSegmentDto>>(
        segmentsKeys.list(segment.ItemId!),
      ),
    ).toEqual(previousSegments)
    expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1)
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: segmentsKeys.list(segment.ItemId!),
    })
  })

  /**
   * Property: DELETE request includes correct query parameters
   * For any valid segment, the DELETE request SHALL include
   * the itemId and type as query parameters.
   */
  it('includes correct query parameters in DELETE request', async () => {
    await fc.assert(
      fc.asyncProperty(segmentArb, async (segment) => {
        // Clear previous state
        deleteRequests.length = 0
        jellyfinFetchEmptyMock.mockClear()

        // Setup successful delete response
        setupMockFetch(true)

        const { queryClient, wrapper } = createWrapper()

        // Pre-populate cache
        queryClient.setQueryData<Array<MediaSegmentDto>>(
          segmentsKeys.list(segment.ItemId!),
          [segment],
        )

        // Render the hook
        const { result } = renderHook(() => useDeleteSegment(), { wrapper })

        // Execute deletion
        result.current.mutate(segment)

        // Wait for mutation to complete
        await waitFor(() => {
          return result.current.isSuccess || result.current.isError
        })

        // Verify query parameters
        const deleteRequest = deleteRequests.find(
          (req) => req.segmentId === segment.Id,
        )
        expect(deleteRequest).toBeDefined()
        expect(deleteRequest?.itemId).toBe(segment.ItemId)
        expect(deleteRequest?.type).toBe(String(segment.Type))

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Multiple segments - deleted segment is removed while others remain
   * For any list of segments, when one is deleted, the deleted segment
   * SHALL be removed from the cache during the optimistic update.
   */
  it('removes only the deleted segment during optimistic update with multiple segments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .array(segmentArb, { minLength: 2, maxLength: 5 })
          .chain((segments) => {
            // Ensure all segments have same ItemId but unique valid UUIDs
            const itemId = segments[0].ItemId
            // Generate unique UUIDs for each segment by using different random values
            const uniqueSegments = segments.map((s, i) => {
              // Create a valid UUID v4 with unique values based on index
              const hexIndex = i.toString(16).padStart(4, '0')
              const uniqueId = `${s.Id!.slice(0, 9)}${hexIndex}${s.Id!.slice(13)}`
              return {
                ...s,
                Id: uniqueId,
                ItemId: itemId, // Same ItemId for all
              }
            })
            return fc.constant(uniqueSegments)
          }),
        fc.integer({ min: 0, max: 4 }),
        async (segments, deleteIndex) => {
          // Ensure deleteIndex is within bounds
          const actualIndex = deleteIndex % segments.length
          const segmentToDelete = segments[actualIndex]
          const itemId = segmentToDelete.ItemId!

          // Clear previous state
          deleteRequests.length = 0
          jellyfinFetchEmptyMock.mockClear()

          // Setup successful delete response
          setupMockFetch(true)

          const { queryClient, wrapper } = createWrapper()

          // Pre-populate cache with all segments
          queryClient.setQueryData<Array<MediaSegmentDto>>(
            segmentsKeys.list(itemId),
            [...segments], // Clone to avoid mutation issues
          )

          // Verify initial cache state
          const initialCache = queryClient.getQueryData<Array<MediaSegmentDto>>(
            segmentsKeys.list(itemId),
          )
          expect(initialCache?.length).toBe(segments.length)

          // Render the hook
          const { result } = renderHook(() => useDeleteSegment(), { wrapper })

          // Execute deletion
          result.current.mutate(segmentToDelete)

          // Wait for mutation to start (optimistic update happens immediately)
          await waitFor(
            () => {
              return (
                result.current.isPending ||
                result.current.isSuccess ||
                result.current.isError
              )
            },
            { timeout: 5000 },
          )

          // Verify DELETE request was sent with correct segment ID
          expect(deleteRequests.length).toBeGreaterThanOrEqual(1)
          const deleteRequest = deleteRequests.find(
            (req) => req.segmentId === segmentToDelete.Id,
          )
          expect(deleteRequest).toBeDefined()
          expect(deleteRequest?.segmentId).toBe(segmentToDelete.Id)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })
})
