/**
 * Property: Wizard State Preservation
 *
 * The wizard now preserves values through TanStack Form state. These properties
 * target the new pure flow helpers and schema-backed auth value handling.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import type { ConnectionWizardFormValues } from '@/lib/forms/connection-form'
import type { WizardStep } from '@/components/connection/connection-wizard-flow'
import {
  ConnectionAuthSchema,
  buildCredentialsFromForm,
} from '@/lib/forms/connection-form'
import {
  canGoBack,
  getPreviousStep,
} from '@/components/connection/connection-wizard-flow'

const wizardStepArb = fc.constantFrom<WizardStep>(
  'entry',
  'select',
  'auth',
  'success',
)

const validApiKeyArb = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
    maxLength: 64,
    minLength: 32,
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

const validWizardValuesArb: fc.Arbitrary<ConnectionWizardFormValues> =
  fc.record({
    address: fc.string({ maxLength: 200, minLength: 1 }),
    apiKey: validApiKeyArb,
    authMethod: fc.constantFrom('apiKey', 'userPass'),
    password: validPasswordArb,
    selectedServerAddress: fc.webUrl(),
    username: validUsernameArb,
  })

describe('Property: Wizard State Preservation', () => {
  it('returns the expected previous step for each checkpoint', () => {
    fc.assert(
      fc.property(wizardStepArb, (step) => {
        expect(getPreviousStep(step)).toBe(
          {
            entry: null,
            select: 'entry',
            auth: 'select',
            success: 'auth',
          }[step],
        )
        return true
      }),
      { numRuns: 100 },
    )
  })

  it('canGoBack matches the intended wizard checkpoints', () => {
    expect(canGoBack('entry')).toBe(false)
    expect(canGoBack('select')).toBe(true)
    expect(canGoBack('auth')).toBe(true)
    expect(canGoBack('success')).toBe(false)
  })

  it('apiKey mode ignores hidden username and password drafts', () => {
    fc.assert(
      fc.property(validWizardValuesArb, (values) => {
        const candidate: ConnectionWizardFormValues = {
          ...values,
          authMethod: 'apiKey',
        }

        expect(ConnectionAuthSchema.safeParse(candidate).success).toBe(true)
        expect(buildCredentialsFromForm(candidate)).toEqual({
          apiKey: candidate.apiKey,
          method: 'apiKey',
        })
        return true
      }),
      { numRuns: 100 },
    )
  })

  it('userPass mode ignores hidden apiKey drafts', () => {
    fc.assert(
      fc.property(validWizardValuesArb, (values) => {
        const candidate: ConnectionWizardFormValues = {
          ...values,
          authMethod: 'userPass',
        }

        expect(ConnectionAuthSchema.safeParse(candidate).success).toBe(true)
        expect(buildCredentialsFromForm(candidate)).toEqual({
          method: 'userPass',
          password: candidate.password,
          username: candidate.username,
        })
        return true
      }),
      { numRuns: 100 },
    )
  })
})
