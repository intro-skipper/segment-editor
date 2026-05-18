/**
 * Feature: Segment Save Reload
 * After a successful batch save, the segments query SHALL be invalidated
 * so that fresh data is reloaded from the server.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { useBatchSaveSegments } from '@/hooks/mutations/use-segment-mutations'
import { segmentsKeys } from '@/hooks/queries/use-segments'

const jellyfinFetchEmptyMock = vi.hoisted(() => vi.fn())
const jellyfinFetchJsonMock = vi.hoisted(() => vi.fn())

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
  jellyfinFetchJson: jellyfinFetchJsonMock,
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
    StartTicks: fc.integer({ min: 0, max: 36000 }),
    EndTicks: fc.integer({ min: 1, max: 36001 }),
  })
  .filter((s) => s.StartTicks < s.EndTicks) as fc.Arbitrary<MediaSegmentDto>

// Create a wrapper with QueryClient for testing hooks
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
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

function setupMockFetchForSave(savedSegments: Array<MediaSegmentDto>): void {
  let callIndex = 0
  jellyfinFetchJsonMock.mockImplementation(() => {
    const segment = savedSegments[callIndex % savedSegments.length]
    callIndex++
    return Promise.resolve(segment)
  })
  jellyfinFetchEmptyMock.mockResolvedValue(undefined)
}

describe('Segment Save Reload', () => {
  beforeEach(() => {
    jellyfinFetchEmptyMock.mockClear()
    jellyfinFetchJsonMock.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property: After a successful batch save, the segments query is invalidated.
   * For any item with segments, after saving, the query for that item's segments
   * SHALL be marked as stale (invalidated) so a reload from server is triggered.
   */
  it('invalidates segments query after successful batch save', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .array(segmentArb, { minLength: 1, maxLength: 3 })
          .chain((segments) => {
            const itemId = segments[0].ItemId!
            const withSameItemId = segments.map((s) => ({
              ...s,
              ItemId: itemId,
            }))
            return fc.constant(withSameItemId)
          }),
        async (segments) => {
          jellyfinFetchJsonMock.mockClear()
          jellyfinFetchEmptyMock.mockClear()

          const itemId = segments[0].ItemId
          setupMockFetchForSave(segments)

          const { queryClient, wrapper } = createWrapper()

          // Pre-populate cache with existing segments
          queryClient.setQueryData<Array<MediaSegmentDto>>(
            segmentsKeys.list(itemId),
            segments,
          )

          // Verify cache is fresh (not stale) before save
          const queryState = queryClient.getQueryState(
            segmentsKeys.list(itemId),
          )
          expect(queryState).toBeDefined()

          // Render the hook
          const { result } = renderHook(() => useBatchSaveSegments(), {
            wrapper,
          })

          // Execute batch save
          result.current.mutate({
            itemId,
            existingSegments: [],
            newSegments: segments,
          })

          // Wait for mutation to complete
          await waitFor(() => {
            return result.current.isSuccess || result.current.isError
          })

          expect(result.current.isSuccess).toBe(true)

          // After a successful save, the query SHALL be invalidated (marked stale)
          const stateAfterSave = queryClient.getQueryState(
            segmentsKeys.list(itemId),
          )
          expect(stateAfterSave?.isInvalidated).toBe(true)

          return true
        },
      ),
      { numRuns: 50 },
    )
  })
})
