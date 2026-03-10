import { z } from 'zod'

import type { AuthMethod } from '@/stores/api-store'
import type { AuthCredentials } from '@/services/jellyfin'

export interface ConnectionWizardFormValues {
  address: string
  selectedServerAddress: string
  authMethod: AuthMethod
  apiKey: string
  username: string
  password: string
}

export const CONNECTION_WIZARD_DEFAULT_VALUES: ConnectionWizardFormValues = {
  address: '',
  selectedServerAddress: '',
  authMethod: 'apiKey',
  apiKey: '',
  username: '',
  password: '',
}

const ConnectionAddressFieldSchema = z
  .string()
  .trim()
  .min(1, 'Please enter a server address')

const ConnectionSelectedServerFieldSchema = z
  .string()
  .trim()
  .min(1, 'Please select a server')

const ConnectionApiKeyFieldSchema = z
  .string()
  .trim()
  .min(1, 'API key is required')

const ConnectionUsernameFieldSchema = z
  .string()
  .trim()
  .min(1, 'Username is required')

const ConnectionPasswordFieldSchema = z
  .string()
  .refine(
    (value) => value === '' || value.trim().length > 0,
    'Password cannot be only whitespace',
  )

const ConnectionWizardSchema = z.object({
  address: z.string(),
  selectedServerAddress: z.string(),
  authMethod: z.enum(['apiKey', 'userPass']),
  apiKey: z.string(),
  username: z.string(),
  password: z.string(),
})

function appendFieldIssues(
  ctx: z.RefinementCtx,
  field: keyof ConnectionWizardFormValues,
  issues: Array<{ message: string }>,
) {
  for (const issue of issues) {
    ctx.addIssue({
      code: 'custom',
      path: [field],
      message: issue.message,
    })
  }
}

export const ConnectionDiscoverSchema = ConnectionWizardSchema.superRefine(
  (value, ctx) => {
    const result = ConnectionAddressFieldSchema.safeParse(value.address)
    if (result.success) return

    appendFieldIssues(ctx, 'address', result.error.issues)
  },
)

export const ConnectionAuthSchema = ConnectionWizardSchema.superRefine(
  (value, ctx) => {
    const selectedServerResult = ConnectionSelectedServerFieldSchema.safeParse(
      value.selectedServerAddress,
    )
    if (!selectedServerResult.success) {
      appendFieldIssues(
        ctx,
        'selectedServerAddress',
        selectedServerResult.error.issues,
      )
    }

    if (value.authMethod === 'apiKey') {
      const result = ConnectionApiKeyFieldSchema.safeParse(value.apiKey)
      if (!result.success) {
        appendFieldIssues(ctx, 'apiKey', result.error.issues)
      }
      return
    }

    const usernameResult = ConnectionUsernameFieldSchema.safeParse(
      value.username,
    )
    if (!usernameResult.success) {
      appendFieldIssues(ctx, 'username', usernameResult.error.issues)
    }

    const passwordResult = ConnectionPasswordFieldSchema.safeParse(
      value.password,
    )
    if (!passwordResult.success) {
      appendFieldIssues(ctx, 'password', passwordResult.error.issues)
    }
  },
)

export function buildCredentialsFromForm(
  values: ConnectionWizardFormValues,
): AuthCredentials {
  return values.authMethod === 'apiKey'
    ? {
        method: 'apiKey',
        apiKey: values.apiKey,
      }
    : {
        method: 'userPass',
        username: values.username,
        password: values.password,
      }
}
