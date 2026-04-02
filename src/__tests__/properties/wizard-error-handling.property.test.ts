/**
 * Feature: server-discovery
 *
 * Tests for network error handling, auth failure recovery, and schema-backed
 * wizard validation after the TanStack Form migration.
 */

import { describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'

import {
  ConnectionAuthSchema,
  ConnectionDiscoverSchema,
} from '@/lib/forms/connection-form'
import { authenticate, discoverServers } from '@/services/jellyfin'
import { getJellyfinClient } from '@/services/jellyfin/core'
import { AppError, ErrorCodes } from '@/lib/unified-error'

describe('Network Error Handling', () => {
  it('returns error indication for unreachable servers', async () => {
    const jellyfin = getJellyfinClient()
    const discoverySpy = vi
      .spyOn(jellyfin.discovery, 'getRecommendedServerCandidates')
      .mockRejectedValueOnce(new Error('Network connection failed'))

    try {
      const result = await discoverServers('invalid.nonexistent.local.test', {
        signal: AbortSignal.timeout(5000),
      })

      expect(result.servers).toHaveLength(0)
      expect(result.servers.length === 0 || result.error !== undefined).toBe(
        true,
      )
    } finally {
      discoverySpy.mockRestore()
    }
  })

  it('handles timeout during discovery gracefully', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await discoverServers('test.example.com', {
      signal: controller.signal,
    })

    expect(result.servers).toHaveLength(0)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('cancelled')
  })

  it('returns cancelled error for pre-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await discoverServers('any.server.com', {
      signal: controller.signal,
    })

    expect(result.error).toBe('Discovery cancelled')
    expect(result.servers).toHaveLength(0)
  })
})

describe('Authentication Failure Recovery', () => {
  it('provides user-friendly error messages for auth failures', async () => {
    const result = await authenticate(
      'https://invalid.test.local',
      { apiKey: 'invalid-key', method: 'apiKey' },
      { signal: AbortSignal.timeout(5000) },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).not.toContain('at ')
    expect(result.error).not.toContain('Error:')
  })

  it('returns cancelled error for pre-aborted auth signal', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await authenticate(
      'https://test.server.com',
      { apiKey: 'test-key', method: 'apiKey' },
      { signal: controller.signal },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Authentication cancelled')
  })

  it('rejects invalid credentials before making the API call', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('', '   ', '\t\n'),
        async (emptyValue) => {
          await expect(
            authenticate('https://demo.local', {
              apiKey: emptyValue,
              method: 'apiKey',
            }),
          ).resolves.toMatchObject({
            error: expect.stringContaining('required'),
            success: false,
          })

          await expect(
            authenticate('https://demo.local', {
              method: 'userPass',
              password: 'valid-password',
              username: emptyValue,
            }),
          ).resolves.toMatchObject({
            error: expect.stringContaining('required'),
            success: false,
          })

          return true
        },
      ),
      { numRuns: 10 },
    )
  })
})

describe('Wizard Schema Validation', () => {
  it('reports an address error for blank discovery submissions', () => {
    fc.assert(
      fc.property(fc.constantFrom('', ' ', '   ', '\t\n'), (address) => {
        const result = ConnectionDiscoverSchema.safeParse({
          address,
          apiKey: '',
          authMethod: 'apiKey' as const,
          password: '',
          selectedServerAddress: '',
          username: '',
        })

        expect(result.success).toBe(false)
        expect(result.error?.issues[0]?.message).toBe(
          'Please enter a server address',
        )
        return true
      }),
      { numRuns: 20 },
    )
  })

  it('reports the selected server requirement during auth submit', () => {
    fc.assert(
      fc.property(fc.webUrl(), (apiKey) => {
        const result = ConnectionAuthSchema.safeParse({
          address: 'demo.local',
          apiKey,
          authMethod: 'apiKey' as const,
          password: '',
          selectedServerAddress: '',
          username: '',
        })

        expect(result.success).toBe(false)
        expect(
          result.error?.issues.some(
            (issue) => issue.message === 'Please select a server',
          ),
        ).toBe(true)
        return true
      }),
      { numRuns: 20 },
    )
  })
})

describe('Error Code Mapping', () => {
  it('maps 401 status to UNAUTHORIZED code', () => {
    const error = AppError.fromStatus(401)
    expect(error.code).toBe(ErrorCodes.UNAUTHORIZED)
    expect(error.recoverable).toBe(true)
  })

  it('maps 403 status to FORBIDDEN code', () => {
    const error = AppError.fromStatus(403)
    expect(error.code).toBe(ErrorCodes.FORBIDDEN)
    expect(error.recoverable).toBe(false)
  })

  it('maps 404 status to NOT_FOUND code', () => {
    const error = AppError.fromStatus(404)
    expect(error.code).toBe(ErrorCodes.NOT_FOUND)
    expect(error.recoverable).toBe(false)
  })

  it('maps 5xx status to SERVER_ERROR code', () => {
    fc.assert(
      fc.property(fc.integer({ max: 599, min: 500 }), (status) => {
        const error = AppError.fromStatus(status)
        expect(error.code).toBe(ErrorCodes.SERVER_ERROR)
        expect(error.recoverable).toBe(true)
        return true
      }),
      { numRuns: 20 },
    )
  })

  it('maps 429 to recoverable error', () => {
    const error = AppError.fromStatus(429)
    expect(error.recoverable).toBe(true)
  })
})
