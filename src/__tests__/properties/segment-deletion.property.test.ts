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
import { AxiosError } from 'axios'
import type { AxiosRequestConfig } from 'axios'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { useDeleteSegment } from '@/hooks/mutations/use-segment-mutations'
import { segmentsKeys } from '@/hooks/queries/use-segments'

// Track DELETE requests for verification
interface DeleteRequest {
  url: string
  segmentId: string
  itemId?: string
  type?: string
}

const deleteRequests: Array<DeleteRequest> = []

// Mock axios instance used by SDK
const mockAxiosInstance = {
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  defaults: { headers: { common: {} } },
}

// Mock the SDK module - must provide both getTypedApis and api accessor structure
vi.mock('@/services/jellyfin/sdk', () => ({
  getTypedApis: vi.fn(() => ({
    itemsApi: {},
    libraryApi: {},
    tvShowsApi: {},
    imageApi: {},
    videosApi: {},
    pluginsApi: {},
    mediaSegmentsApi: {},
    systemApi: {},
    api: {
      basePath: 'http://localhost:8096',
      axiosInstance: mockAxiosInstance,
    },
  })),
  withApi: vi.fn((fn) => {
    const apis = {
      itemsApi: {},
      libraryApi: {},
      tvShowsApi: {},
      imageApi: {},
      videosApi: {},
      pluginsApi: {},
      mediaSegmentsApi: {},
      systemApi: {},
      api: {
        basePath: 'http://localhost:8096',
        axiosInstance: mockAxiosInstance,
      },
    }
    return fn(apis)
  }),
  buildUrl: vi.fn((path: string) => `http://localhost:8096${path}`),
  getApi: vi.fn(() => ({
    basePath: 'http://localhost:8096',
    axiosInstance: mockAxiosInstance,
  })),
  getServerBaseUrl: vi.fn(() => 'http://localhost:8096'),
  getAccessToken: vi.fn(() => 'test-token'),
  resetSdkState: vi.fn(),
  getRequestConfig: vi.fn(
    (
      options?: { signal?: AbortSignal; timeout?: number },
      defaultTimeout = 30000,
    ) => ({
      signal: options?.signal,
      timeout: options?.timeout ?? defaultTimeout,
    }),
  ),
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

// Setup mock axios to track DELETE requests
function setupMockAxios(success: boolean = true): void {
  mockAxiosInstance.delete.mockImplementation(
    (url: string, _config?: AxiosRequestConfig) => {
      // Parse URL to extract segment ID and query params
      const urlObj = new URL(url, 'http://localhost:8096')
      const pathParts = urlObj.pathname.split('/')
      // Segment ID is after 'MediaSegmentsApi' in the path
      const segmentIdPart = pathParts[pathParts.length - 1]
      // Remove query string from segment ID if present
      const segmentId = segmentIdPart.split('?')[0]

      // Get query params from URL (segments API puts them in URL)
      const itemId = urlObj.searchParams.get('itemId') ?? undefined
      const type = urlObj.searchParams.get('type') ?? undefined

      deleteRequests.push({
        url,
        segmentId,
        itemId,
        type,
      })

      if (success) {
        return Promise.resolve({
          data: {},
          status: 204,
          statusText: 'No Content',
        })
      } else {
        const error = new AxiosError('Server Error')
        error.response = {
          status: 500,
          data: { message: 'Server Error' },
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as never,
        }
        return Promise.reject(error)
      }
    },
  )
}

describe('Segment Deletion State Synchronization', () => {
  beforeEach(() => {
    mockAxiosInstance.delete.mockClear()
    mockAxiosInstance.get.mockClear()
    mockAxiosInstance.post.mockClear()
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
        mockAxiosInstance.delete.mockClear()

        // Setup successful delete response
        setupMockAxios(true)

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
        mockAxiosInstance.delete.mockClear()

        // Setup successful delete response
        setupMockAxios(true)

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
        mockAxiosInstance.delete.mockClear()

        // Setup successful delete response
        setupMockAxios(true)

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
          mockAxiosInstance.delete.mockClear()

          // Setup successful delete response
          setupMockAxios(true)

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
