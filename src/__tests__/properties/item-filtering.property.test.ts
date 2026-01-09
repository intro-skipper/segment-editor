/**
 * Feature: Item Filtering by Name
 * For any list of media items and any filter string, the filtered results SHALL
 * only contain items whose names include the filter string (case-insensitive),
 * and the original list SHALL remain unmodified.
 */

import { describe, it } from 'vitest'
import * as fc from 'fast-check'
import { filterItemsByName } from '@/lib/utils'

/**
 * Arbitrary generator for BaseItemDto with a Name property.
 */
const baseItemDtoArb = fc.record({
  Id: fc.uuid(),
  Name: fc.oneof(fc.string(), fc.constant(undefined)),
  Type: fc.constant('Movie' as const),
})

describe('Item Filtering by Name', () => {
  /**
   * Property: Filtered results only contain matching items
   * For any list of items and any filter string, all items in the filtered
   * result must have names that include the filter string (case-insensitive).
   */
  it('filtered results only contain items with matching names', () => {
    fc.assert(
      fc.property(
        fc.array(baseItemDtoArb, { minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (items, filter) => {
          const filtered = filterItemsByName(items, filter)
          const normalizedFilter = filter.trim().toLowerCase()

          // Whitespace-only filters are treated as "no filter"
          if (!normalizedFilter) {
            return filtered.length === items.length
          }

          // All filtered items must have names containing the filter
          return filtered.every(
            (item) =>
              item.Name != null &&
              item.Name.toLowerCase().includes(normalizedFilter),
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Original list remains unmodified
   * Filtering should not mutate the original array.
   */
  it('original list remains unmodified after filtering', () => {
    fc.assert(
      fc.property(
        fc.array(baseItemDtoArb, { minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (items, filter) => {
          // Deep copy the original items for comparison
          const originalItems = JSON.parse(JSON.stringify(items))
          const originalLength = items.length

          // Perform filtering
          filterItemsByName(items, filter)

          // Original array should be unchanged
          return (
            items.length === originalLength &&
            JSON.stringify(items) === JSON.stringify(originalItems)
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Empty or whitespace filter returns all items
   * When filter is empty, undefined, or whitespace-only, all items should be returned.
   */
  it('empty or whitespace filter returns all items', () => {
    fc.assert(
      fc.property(
        fc.array(baseItemDtoArb, { minLength: 0, maxLength: 50 }),
        fc.oneof(
          fc.constant(undefined),
          fc.constant(''),
          fc.constant('   '),
          fc.constant('  '),
          fc.constant(' '),
          fc.constant('\t'),
          fc.constant('\n'),
        ),
        (items, filter) => {
          const filtered = filterItemsByName(items, filter)
          return filtered.length === items.length
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Filtering is case-insensitive
   * The same filter in different cases should produce the same results.
   */
  it('filtering is case-insensitive', () => {
    fc.assert(
      fc.property(
        fc.array(baseItemDtoArb, { minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (items, filter) => {
          const lowerFiltered = filterItemsByName(items, filter.toLowerCase())
          const upperFiltered = filterItemsByName(items, filter.toUpperCase())
          const mixedFiltered = filterItemsByName(items, filter)

          // All case variations should produce the same number of results
          return (
            lowerFiltered.length === upperFiltered.length &&
            upperFiltered.length === mixedFiltered.length
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Filtered result is a subset of original
   * The filtered array length should be less than or equal to the original.
   */
  it('filtered result length is less than or equal to original', () => {
    fc.assert(
      fc.property(
        fc.array(baseItemDtoArb, { minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 0, maxLength: 20 }),
        (items, filter) => {
          const filtered = filterItemsByName(items, filter)
          return filtered.length <= items.length
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Items with undefined names are excluded when filtering
   * Items without a Name property should not appear in filtered results
   * when a non-empty filter is applied.
   */
  it('items with undefined names are excluded when filtering', () => {
    fc.assert(
      fc.property(
        fc.array(baseItemDtoArb, { minLength: 0, maxLength: 50 }),
        // Use a filter that is not empty or whitespace-only
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s.trim() !== ''),
        (items, filter) => {
          const filtered = filterItemsByName(items, filter)

          // No filtered item should have an undefined name
          return filtered.every((item) => item.Name !== undefined)
        },
      ),
      { numRuns: 100 },
    )
  })
})
