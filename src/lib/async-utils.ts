/**
 * Async Utilities
 *
 * Shared helpers for bounded-concurrency async operations.
 *
 * @module lib/async-utils
 */

/**
 * Run an array of async tasks with bounded concurrency.
 * Preserves input order in the returned results.
 *
 * @param items - Items to process
 * @param limit - Maximum number of tasks running at once
 * @param fn - Async function to apply to each item
 */
export async function mapWithLimit<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<R>> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}
