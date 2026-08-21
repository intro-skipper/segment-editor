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
    (item) => item.Name?.toLowerCase().includes(normalized) ?? false,
  )
}

/**
 * Reads an array element by index, returning undefined for any index outside
 * the array, including negatives, which `Array.prototype.at` would wrap to
 * an element from the end.
 */
export function elementAt<T>(
  items: ReadonlyArray<T>,
  index: number,
): T | undefined {
  return index >= 0 && index < items.length ? items[index] : undefined
}

/**
 * Reads an entry from a closed lookup table using a runtime key whose
 * membership is not known statically. Returns undefined on a miss so callers
 * handle it explicitly, instead of a widened index signature promising a value
 * for every possible key.
 */
export function lookup<T extends object>(
  table: T,
  key: PropertyKey,
): T[keyof T] | undefined {
  // SAFETY: Object.hasOwn has proven `key` names an own property of `table`,
  // so the indexed read yields one of the table's declared value types.
  return Object.hasOwn(table, key) ? table[key as keyof T] : undefined
}
