/**
 * Property: Input Validation Rejection
 *
 * For any authentication attempt with invalid active credentials, the schema
 * wrappers SHALL reject the submission before any API call is attempted.
 */

import { describe, expect, it } from 'vite-plus/test'
import * as fc from 'fast-check'

import { ConnectionAuthSchema } from '@/lib/forms/connection-form'

const whitespaceOnlyArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '  ', '\t\t'), {
    maxLength: 20,
    minLength: 1,
  })
  .map((chars) => chars.join(''))

const validUsernameArb = fc
  .string({ maxLength: 50, minLength: 1 })
  .filter((value) => value.trim().length > 0)

const validPasswordArb = fc.oneof(
  fc.constant(''),
  fc
    .string({ maxLength: 50, minLength: 1 })
    .filter((value) => value.trim().length > 0),
)

const validApiKeyArb = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
    maxLength: 64,
    minLength: 32,
  })
  .map((chars) => chars.join(''))

const invalidApiKeyArb = fc.oneof(fc.constant(''), whitespaceOnlyArb)
const invalidUsernameArb = fc.oneof(fc.constant(''), whitespaceOnlyArb)
const validSelectedServerAddressArb = fc.webUrl()

describe('Property: Input Validation Rejection', () => {
  describe('ConnectionAuthSchema', () => {
    it('rejects whitespace-only passwords', () => {
      fc.assert(
        fc.property(whitespaceOnlyArb, (password) => {
          const result = ConnectionAuthSchema.safeParse({
            address: 'demo.local',
            apiKey: 'unused-api-key',
            authMethod: 'userPass' as const,
            password,
            selectedServerAddress: 'https://demo.local',
            username: 'demo-user',
          })

          expect(result.success).toBe(false)
          expect(
            result.error?.issues.some((issue) => issue.path[0] === 'password'),
          ).toBe(true)
          return true
        }),
        { numRuns: 100 },
      )
    })

    it('accepts empty passwords', () => {
      expect(
        ConnectionAuthSchema.safeParse({
          address: 'demo.local',
          apiKey: 'unused-api-key',
          authMethod: 'userPass' as const,
          password: '',
          selectedServerAddress: 'https://demo.local',
          username: 'demo-user',
        }).success,
      ).toBe(true)
    })

    it('rejects empty or whitespace-only usernames', () => {
      fc.assert(
        fc.property(invalidUsernameArb, (username) => {
          const result = ConnectionAuthSchema.safeParse({
            address: 'demo.local',
            apiKey: 'unused-api-key',
            authMethod: 'userPass' as const,
            password: 'valid-password',
            selectedServerAddress: 'https://demo.local',
            username,
          })

          expect(result.success).toBe(false)
          expect(
            result.error?.issues.some((issue) => issue.path[0] === 'username'),
          ).toBe(true)
          return true
        }),
        { numRuns: 100 },
      )
    })

    it('rejects empty or whitespace-only API keys', () => {
      fc.assert(
        fc.property(invalidApiKeyArb, (apiKey) => {
          const result = ConnectionAuthSchema.safeParse({
            address: 'demo.local',
            apiKey,
            authMethod: 'apiKey' as const,
            password: '',
            selectedServerAddress: 'https://demo.local',
            username: 'ignored-user',
          })

          expect(result.success).toBe(false)
          expect(
            result.error?.issues.some((issue) => issue.path[0] === 'apiKey'),
          ).toBe(true)
          return true
        }),
        { numRuns: 100 },
      )
    })

    it('validates only the active apiKey credentials', () => {
      fc.assert(
        fc.property(
          validApiKeyArb,
          validSelectedServerAddressArb,
          invalidUsernameArb,
          whitespaceOnlyArb,
          (apiKey, selectedServerAddress, username, password) => {
            const result = ConnectionAuthSchema.safeParse({
              address: 'demo.local',
              apiKey,
              authMethod: 'apiKey' as const,
              password,
              selectedServerAddress,
              username,
            })

            expect(result.success).toBe(true)
            return true
          },
        ),
        { numRuns: 100 },
      )
    })

    it('validates only the active userPass credentials', () => {
      fc.assert(
        fc.property(
          validUsernameArb,
          validPasswordArb,
          validSelectedServerAddressArb,
          invalidApiKeyArb,
          (username, password, selectedServerAddress, apiKey) => {
            const result = ConnectionAuthSchema.safeParse({
              address: 'demo.local',
              apiKey,
              authMethod: 'userPass' as const,
              password,
              selectedServerAddress,
              username,
            })

            expect(result.success).toBe(true)
            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
