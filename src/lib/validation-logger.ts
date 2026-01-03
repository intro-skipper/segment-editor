/**
 * Validation logging utilities.
 */

import type { ZodError } from 'zod'

/** Logs validation warnings for API responses with context. */
export function logValidationWarning(context: string, error: ZodError): void {
  console.warn(`[${context}] Validation warning:`, {
    issues: error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  })
}
