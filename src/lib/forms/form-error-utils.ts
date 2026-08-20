import { z } from 'zod'

/**
 * A nested collection of error nodes. TanStack Form keys them by field name,
 * but Standard Schema issues arrive as a plain list, so both shapes decode
 * here and `Object.values` reads either one.
 */
const ErrorCollectionSchema = z
  .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
  .optional()
  .catch(undefined)

/**
 * One node of TanStack Form's error tree. Nested collections are decoded
 * lazily as the walk reaches them, so only the fields read here are described.
 */
const ValidationContainerSchema = z.object({
  fields: ErrorCollectionSchema,
  form: ErrorCollectionSchema,
  message: z.string().optional().catch(undefined),
})

/**
 * Extracts the first human-readable validation message from TanStack Form
 * error collections, regardless of whether they came from field validators,
 * form-level validators, or Standard Schema issues.
 */
export function getFirstValidationMessage(
  errors: ReadonlyArray<unknown> | null | undefined,
): string | null {
  if (!errors?.length) return null

  const queue: Array<unknown> = [...errors]

  while (queue.length > 0) {
    const current = queue.shift()

    if (typeof current === 'string') {
      if (current.trim()) return current
      continue
    }

    if (Array.isArray(current)) {
      queue.unshift(...current)
      continue
    }

    const container = ValidationContainerSchema.safeParse(current)
    if (!container.success) continue

    if (container.data.message?.trim()) {
      return container.data.message
    }

    if (container.data.fields) {
      queue.unshift(...Object.values(container.data.fields))
    }

    if (container.data.form) {
      queue.unshift(...Object.values(container.data.form))
    }
  }

  return null
}
