/**
 * Feature: Clipboard State Management
 * For any segment saved to clipboard, retrieving from clipboard SHALL return
 * an equivalent segment. The clipboard state SHALL persist within the session.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { useSessionStore } from '@/stores/session-store'
import { MediaSegmentType } from '@/types/jellyfin'

// Arbitrary for generating valid MediaSegmentDto objects
const mediaSegmentTypeArb = fc.constantFrom(
  MediaSegmentType.Unknown,
  MediaSegmentType.Commercial,
  MediaSegmentType.Preview,
  MediaSegmentType.Recap,
  MediaSegmentType.Outro,
  MediaSegmentType.Intro,
)

const uuidArb = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
    minLength: 32,
    maxLength: 32,
  })
  .map((chars) => {
    const hex = chars.join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  })

const mediaSegmentArb: fc.Arbitrary<MediaSegmentDto> = fc.record({
  Id: uuidArb,
  ItemId: uuidArb,
  Type: mediaSegmentTypeArb,
  StartTicks: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  EndTicks: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
})

describe('Clipboard State Management', () => {
  // Reset store state before each test
  beforeEach(() => {
    useSessionStore.getState().clearClipboard()
  })

  afterEach(() => {
    useSessionStore.getState().clearClipboard()
  })

  /**
   * Property: Clipboard round-trip preserves segment data
   * For any valid MediaSegmentDto, saving to clipboard and retrieving
   * should return an equivalent segment.
   */
  it('round-trips segments through clipboard', () => {
    fc.assert(
      fc.property(mediaSegmentArb, (segment) => {
        const store = useSessionStore.getState()

        // Save segment to clipboard
        store.saveToClipboard(segment)

        // Retrieve from clipboard
        const retrieved = store.getFromClipboard()

        // Verify segment is retrieved
        expect(retrieved).not.toBeNull()

        // Verify all properties match exactly
        expect(retrieved!.Id).toBe(segment.Id)
        expect(retrieved!.ItemId).toBe(segment.ItemId)
        expect(retrieved!.Type).toBe(segment.Type)
        expect(retrieved!.StartTicks).toBe(segment.StartTicks)
        expect(retrieved!.EndTicks).toBe(segment.EndTicks)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Clipboard persists within session
   * For any segment saved to clipboard, multiple retrievals should
   * return the same segment without modification.
   */
  it('persists clipboard content across multiple retrievals', () => {
    fc.assert(
      fc.property(
        mediaSegmentArb,
        fc.integer({ min: 2, max: 10 }),
        (segment, retrievalCount) => {
          const store = useSessionStore.getState()

          // Save segment to clipboard
          store.saveToClipboard(segment)

          // Retrieve multiple times and verify consistency
          for (let i = 0; i < retrievalCount; i++) {
            const retrieved = store.getFromClipboard()
            expect(retrieved).not.toBeNull()
            expect(retrieved!.Id).toBe(segment.Id)
            expect(retrieved!.ItemId).toBe(segment.ItemId)
            expect(retrieved!.Type).toBe(segment.Type)
            expect(retrieved!.StartTicks).toBe(segment.StartTicks)
            expect(retrieved!.EndTicks).toBe(segment.EndTicks)
          }

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Saving new segment replaces previous clipboard content
   * For any two segments, saving the second should replace the first.
   */
  it('replaces clipboard content when saving new segment', () => {
    fc.assert(
      fc.property(mediaSegmentArb, mediaSegmentArb, (segment1, segment2) => {
        const store = useSessionStore.getState()

        // Save first segment
        store.saveToClipboard(segment1)
        expect(store.getFromClipboard()!.Id).toBe(segment1.Id)

        // Save second segment (should replace first)
        store.saveToClipboard(segment2)
        const retrieved = store.getFromClipboard()

        // Verify second segment is now in clipboard
        expect(retrieved).not.toBeNull()
        expect(retrieved!.Id).toBe(segment2.Id)
        expect(retrieved!.ItemId).toBe(segment2.ItemId)
        expect(retrieved!.Type).toBe(segment2.Type)
        expect(retrieved!.StartTicks).toBe(segment2.StartTicks)
        expect(retrieved!.EndTicks).toBe(segment2.EndTicks)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Clear clipboard removes content
   * For any segment saved to clipboard, clearing should result in null.
   */
  it('clears clipboard content', () => {
    fc.assert(
      fc.property(mediaSegmentArb, (segment) => {
        const store = useSessionStore.getState()

        // Save segment to clipboard
        store.saveToClipboard(segment)
        expect(store.getFromClipboard()).not.toBeNull()

        // Clear clipboard
        store.clearClipboard()

        // Verify clipboard is empty
        expect(store.getFromClipboard()).toBeNull()

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Empty clipboard returns null
   * When clipboard is empty, getFromClipboard should return null.
   */
  it('returns null for empty clipboard', () => {
    const store = useSessionStore.getState()
    store.clearClipboard()
    expect(store.getFromClipboard()).toBeNull()
  })
})
