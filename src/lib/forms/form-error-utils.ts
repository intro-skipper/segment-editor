type ValidationContainer = {
  fields?: Record<string, unknown>
  form?: Record<string, unknown>
  message?: string
}

function isValidationContainer(value: unknown): value is ValidationContainer {
  return typeof value === 'object' && value !== null
}

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
    if (typeof current === 'string' && current.trim()) {
      return current
    }

    if (Array.isArray(current)) {
      queue.unshift(...current)
      continue
    }

    if (!isValidationContainer(current)) continue

    if (typeof current.message === 'string' && current.message.trim()) {
      return current.message
    }

    if (current.fields) {
      queue.unshift(...Object.values(current.fields))
    }

    if (current.form) {
      queue.unshift(...Object.values(current.form))
    }
  }

  return null
}
