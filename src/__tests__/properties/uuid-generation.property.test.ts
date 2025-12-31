/**
 * Feature: UUID Generation Uniqueness
 * For any number of generated UUIDs, all generated values SHALL be unique
 * and conform to UUID v4 format.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { generateUUID, isValidUUID } from '@/lib/segment-utils'

describe('UUID Generation Uniqueness', () => {
  /**
   * Property: All generated UUIDs conform to UUID v4 format
   * For any generated UUID, it must match the UUID v4 pattern.
   */
  it('generates valid UUID v4 format', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const uuid = generateUUID()
        return isValidUUID(uuid)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Generated UUIDs are unique
   * For any batch of generated UUIDs, all values must be distinct.
   */
  it('generates unique UUIDs in batch', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 100 }), (count) => {
        const uuids = Array.from({ length: count }, () => generateUUID())
        const uniqueUuids = new Set(uuids)
        return uniqueUuids.size === count
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: UUID structure is correct
   * Generated UUIDs must have the correct length and hyphen positions.
   */
  it('generates UUIDs with correct structure', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const uuid = generateUUID()
        // UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (36 chars)
        if (uuid.length !== 36) return false
        // Check hyphen positions
        if (
          uuid[8] !== '-' ||
          uuid[13] !== '-' ||
          uuid[18] !== '-' ||
          uuid[23] !== '-'
        )
          return false
        // Check version digit (position 14 should be '4')
        if (uuid[14] !== '4') return false
        // Check variant digit (position 19 should be 8, 9, a, or b)
        const variantChar = uuid[19].toLowerCase()
        if (!['8', '9', 'a', 'b'].includes(variantChar)) return false
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Large batch uniqueness
   * Even with a larger batch, all UUIDs remain unique.
   */
  it('maintains uniqueness across large batches', () => {
    const batchSize = 1000
    const uuids = Array.from({ length: batchSize }, () => generateUUID())
    const uniqueUuids = new Set(uuids)
    expect(uniqueUuids.size).toBe(batchSize)
  })
})
