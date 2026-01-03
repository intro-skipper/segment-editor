import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { sanitizeSearchInput } from './schemas'

import type { ClassValue } from 'clsx'

export function cn(...inputs: Array<ClassValue>): string {
  return twMerge(clsx(inputs))
}

/** Filters items by name with case-insensitive matching. */
export function filterItemsByName<T extends { Name?: string | null }>(
  items: Array<T>,
  filter: string | null | undefined,
): Array<T> {
  const sanitized = sanitizeSearchInput(filter)
  if (!sanitized) return items
  const normalized = sanitized.toLowerCase()
  return items.filter(
    (item) =>
      typeof item.Name === 'string' &&
      item.Name.toLowerCase().includes(normalized),
  )
}
