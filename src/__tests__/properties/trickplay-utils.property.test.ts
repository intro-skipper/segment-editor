/**
 * Property-based tests for trickplay utilities.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import type { TrickplayInfoDto } from '@/types/jellyfin'
import type { TrickplayData } from '@/lib/trickplay-utils'
import {
  buildTrickplayTileUrl,
  getBestTrickplayInfo,
  getTrickplayPosition,
} from '@/lib/trickplay-utils'

/** Arbitrary for valid trickplay info */
const trickplayInfoArb = fc.record({
  Width: fc.integer({ min: 100, max: 640 }),
  Height: fc.integer({ min: 56, max: 360 }),
  TileWidth: fc.integer({ min: 1, max: 10 }),
  TileHeight: fc.integer({ min: 1, max: 10 }),
  ThumbnailCount: fc.integer({ min: 1, max: 1000 }),
  Interval: fc.integer({ min: 1000, max: 30000 }),
  Bandwidth: fc.integer({ min: 1000, max: 10000000 }),
})

/** Arbitrary for trickplay data structure */
const trickplayDataArb = fc
  .record({
    mediaSourceId: fc.uuid(),
    width: fc.integer({ min: 100, max: 640 }),
    info: trickplayInfoArb,
  })
  .map(({ mediaSourceId, width, info }) => ({
    [mediaSourceId]: {
      [String(width)]: info,
    },
  }))

describe('trickplay-utils', () => {
  describe('getBestTrickplayInfo', () => {
    it('returns null for undefined or null input', () => {
      expect(getBestTrickplayInfo(undefined)).toBeNull()
      expect(getBestTrickplayInfo(null)).toBeNull()
    })

    it('returns null for empty trickplay data', () => {
      expect(getBestTrickplayInfo({})).toBeNull()
    })

    it('returns trickplay info for valid data', () => {
      fc.assert(
        fc.property(trickplayDataArb, (trickplay) => {
          const result = getBestTrickplayInfo(trickplay)
          expect(result).not.toBeNull()
          expect(result?.mediaSourceId).toBeDefined()
          expect(result?.info).toBeDefined()
        }),
      )
    })

    it('prefers width >= 320 when available', () => {
      const trickplay: TrickplayData = {
        'source-1': {
          '160': { Width: 160, ThumbnailCount: 100, Interval: 10000 },
          '320': { Width: 320, ThumbnailCount: 100, Interval: 10000 },
          '640': { Width: 640, ThumbnailCount: 100, Interval: 10000 },
        },
      }
      const result = getBestTrickplayInfo(trickplay)
      expect(result?.info.Width).toBe(320)
    })

    it('uses largest available width if none >= 320', () => {
      const trickplay: TrickplayData = {
        'source-1': {
          '160': { Width: 160, ThumbnailCount: 100, Interval: 10000 },
          '240': { Width: 240, ThumbnailCount: 100, Interval: 10000 },
        },
      }
      const result = getBestTrickplayInfo(trickplay)
      expect(result?.info.Width).toBe(240)
    })
  })

  describe('getTrickplayPosition', () => {
    const baseInfo: TrickplayInfoDto = {
      Width: 320,
      Height: 180,
      TileWidth: 5,
      TileHeight: 5,
      ThumbnailCount: 100,
      Interval: 10000, // 10 seconds per thumbnail
    }

    it('returns null when required properties are missing', () => {
      const incompleteInfo = { Width: 320 }
      const result = getTrickplayPosition(
        0,
        incompleteInfo,
        'item-1',
        'source-1',
        'http://localhost:8096',
      )
      expect(result).toBeNull()
    })

    it('calculates correct tile index for first thumbnail', () => {
      const result = getTrickplayPosition(
        0,
        baseInfo,
        'item-1',
        'source-1',
        'http://localhost:8096',
      )
      expect(result).not.toBeNull()
      expect(result?.offsetX).toBe(0)
      expect(result?.offsetY).toBe(0)
      expect(result?.tileUrl).toContain('/0.jpg')
    })

    it('calculates correct position within first tile', () => {
      // 15 seconds = thumbnail index 1 (10-20 seconds range)
      // Position in tile: row 0, column 1
      const result = getTrickplayPosition(
        15,
        baseInfo,
        'item-1',
        'source-1',
        'http://localhost:8096',
      )
      expect(result).not.toBeNull()
      expect(result?.offsetX).toBe(320) // 1 * 320
      expect(result?.offsetY).toBe(0)
    })

    it('calculates correct row position', () => {
      // 55 seconds = thumbnail index 5 (50-60 seconds range)
      // 5 tiles per row, so index 5 is row 1, column 0
      const result = getTrickplayPosition(
        55,
        baseInfo,
        'item-1',
        'source-1',
        'http://localhost:8096',
      )
      expect(result).not.toBeNull()
      expect(result?.offsetX).toBe(0)
      expect(result?.offsetY).toBe(180) // 1 * 180
    })

    it('calculates correct tile image for later thumbnails', () => {
      // 260 seconds = thumbnail index 26
      // 25 thumbnails per tile (5x5), so index 26 is tile 1, position 1
      const result = getTrickplayPosition(
        260,
        baseInfo,
        'item-1',
        'source-1',
        'http://localhost:8096',
      )
      expect(result).not.toBeNull()
      expect(result?.tileUrl).toContain('/1.jpg')
      expect(result?.offsetX).toBe(320) // column 1
      expect(result?.offsetY).toBe(0) // row 0
    })

    it('clamps to last thumbnail when time exceeds duration', () => {
      // 2000 seconds with only 100 thumbnails, should clamp to index 99
      const result = getTrickplayPosition(
        2000,
        baseInfo,
        'item-1',
        'source-1',
        'http://localhost:8096',
      )
      expect(result).not.toBeNull()
      // Index 99: tile 3 (99 / 25 = 3), position 24 in tile (99 % 25 = 24)
      // Position 24: row 4, column 4 (24 / 5 = 4, 24 % 5 = 4)
      expect(result?.tileUrl).toContain('/3.jpg')
      expect(result?.offsetX).toBe(4 * 320)
      expect(result?.offsetY).toBe(4 * 180)
    })

    it('property: thumbnail index increases monotonically with time', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000, noNaN: true }),
          fc.float({ min: 0, max: 1000, noNaN: true }),
          (time1, time2) => {
            if (time1 >= time2) return true // Skip when not increasing

            const result1 = getTrickplayPosition(
              time1,
              baseInfo,
              'item-1',
              'source-1',
              'http://localhost:8096',
            )
            const result2 = getTrickplayPosition(
              time2,
              baseInfo,
              'item-1',
              'source-1',
              'http://localhost:8096',
            )

            if (!result1 || !result2) return true

            // Extract tile index from URL
            const getTileIndex = (url: string) => {
              const match = url.match(/\/(\d+)\.jpg/)
              return match ? parseInt(match[1], 10) : 0
            }

            const tile1 = getTileIndex(result1.tileUrl)
            const tile2 = getTileIndex(result2.tileUrl)

            // Tile index should be >= (can be same tile)
            return tile2 >= tile1
          },
        ),
      )
    })

    it('property: offset is always within tile bounds', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 5000, noNaN: true }),
          trickplayInfoArb,
          (timeSeconds, info) => {
            const result = getTrickplayPosition(
              timeSeconds,
              info,
              'item-1',
              'source-1',
              'http://localhost:8096',
            )

            if (!result) return true // Skip invalid configs

            const maxOffsetX = (info.TileWidth - 1) * info.Width
            const maxOffsetY = (info.TileHeight - 1) * info.Height

            return (
              result.offsetX >= 0 &&
              result.offsetX <= maxOffsetX &&
              result.offsetY >= 0 &&
              result.offsetY <= maxOffsetY
            )
          },
        ),
      )
    })
  })

  describe('buildTrickplayTileUrl', () => {
    it('builds correct URL without API key', () => {
      const url = buildTrickplayTileUrl(
        'http://localhost:8096',
        'item-123',
        320,
        0,
        'source-456',
      )
      expect(url).toBe(
        'http://localhost:8096/Videos/item-123/Trickplay/320/0.jpg?mediaSourceId=source-456',
      )
    })

    it('builds correct URL with API key', () => {
      const url = buildTrickplayTileUrl(
        'http://localhost:8096',
        'item-123',
        320,
        5,
        'source-456',
        'my-api-key',
      )
      expect(url).toContain('api_key=my-api-key')
      expect(url).toContain('mediaSourceId=source-456')
      expect(url).toContain('/Trickplay/320/5.jpg')
    })

    it('handles trailing slash in server address', () => {
      const url = buildTrickplayTileUrl(
        'http://localhost:8096/',
        'item-123',
        320,
        0,
        'source-456',
      )
      // Should not have double slash
      expect(url).not.toContain('8096//Videos')
      expect(url).toBe(
        'http://localhost:8096/Videos/item-123/Trickplay/320/0.jpg?mediaSourceId=source-456',
      )
    })

    it('handles multiple trailing slashes', () => {
      const url = buildTrickplayTileUrl(
        'http://localhost:8096///',
        'item-123',
        320,
        0,
        'source-456',
      )
      // Should not have double slash
      expect(url).not.toContain('//Videos')
      expect(url).toContain('/Videos/')
    })

    it('property: URL always contains required path segments', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.uuid(),
          fc.integer({ min: 100, max: 640 }),
          fc.nat(100),
          fc.uuid(),
          fc.option(fc.string({ minLength: 1, maxLength: 64 })),
          (server, itemId, width, tileIndex, mediaSourceId, apiKey) => {
            const url = buildTrickplayTileUrl(
              server,
              itemId,
              width,
              tileIndex,
              mediaSourceId,
              apiKey ?? undefined,
            )

            return (
              url.includes(
                `/Videos/${itemId}/Trickplay/${width}/${tileIndex}.jpg`,
              ) &&
              url.includes(`mediaSourceId=${encodeURIComponent(mediaSourceId)}`)
            )
          },
        ),
      )
    })

    it('property: URL never has double slashes at server/path boundary', () => {
      fc.assert(
        fc.property(
          // Generate server addresses with optional trailing slashes
          fc
            .tuple(
              fc.constantFrom(
                'http://localhost:8096',
                'https://jellyfin.example.com',
                'http://192.168.1.100:8096',
              ),
              fc.nat(5),
            )
            .map(([url, slashCount]) => url + '/'.repeat(slashCount)),
          fc.uuid(),
          fc.integer({ min: 100, max: 640 }),
          fc.nat(100),
          fc.uuid(),
          (server, itemId, width, tileIndex, mediaSourceId) => {
            const url = buildTrickplayTileUrl(
              server,
              itemId,
              width,
              tileIndex,
              mediaSourceId,
            )

            // Check that there's no double slash between server address and /Videos
            return !url.includes('//Videos')
          },
        ),
      )
    })
  })
})
