/**
 * LRU (Least Recently Used) Cache Manager.
 * Provides generic caching with automatic eviction of least recently used entries.
 *
 * @module cache-manager
 */

import { CACHE_CONFIG } from './constants'

/**
 * Options for LRU cache configuration.
 */
interface LRUCacheOptions<TKey, TValue> {
  /** Callback invoked when an entry is evicted from the cache */
  onEvict?: (value: TValue) => void
  /** Callback invoked after cache contents change */
  onChange?: (key: TKey) => void
}

/**
 * Generic LRU cache implementation using Map's insertion order.
 * When capacity is reached, the least recently accessed entry is evicted.
 *
 * @template TKey - Key type
 * @template TValue - Value type
 */
export class LRUCache<TKey, TValue> {
  private cache = new Map<TKey, TValue>()
  private readonly maxSize: number
  private readonly onEvict?: (value: TValue) => void
  private readonly onChange?: (key: TKey) => void
  /**
   * Creates a new LRU cache with the specified maximum size.
   *
   * @param maxSize - Maximum number of entries before eviction occurs
   * @param options - Optional configuration including eviction callback
   */
  constructor(maxSize: number, options?: LRUCacheOptions<TKey, TValue>) {
    this.maxSize = Math.max(1, maxSize)
    this.onEvict = options?.onEvict
    this.onChange = options?.onChange
  }

  /**
   * Retrieves a value from the cache.
   * Accessing an entry moves it to the most recently used position.
   *
   * @param key - The key to look up
   * @returns The cached value or undefined if not found
   */
  get(key: TKey): TValue | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used) by re-inserting
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  /**
   * Reads a cached value without updating its recency.
   * Use this from render paths where cache reads must stay pure.
   *
   * @param key - The key to look up
   * @returns The cached value or undefined if not found
   */
  peek(key: TKey): TValue | undefined {
    return this.cache.get(key)
  }

  /**
   * Stores a value in the cache.
   * If the cache is at capacity, the least recently used entry is evicted.
   *
   * @param key - The key to store
   * @param value - The value to cache
   */
  set(key: TKey, value: TValue): void {
    // If key exists, delete it first to update its position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Evict the oldest (first) entry
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        const evictedValue = this.cache.get(firstKey)
        this.cache.delete(firstKey)
        if (evictedValue !== undefined) {
          this.invokeEvict(evictedValue)
          this.invokeChange(firstKey)
        }
      }
    }
    this.cache.set(key, value)
    this.invokeChange(key)
  }

  /**
   * Checks if a key exists in the cache.
   * Note: This does NOT update the entry's position.
   *
   * @param key - The key to check
   * @returns True if the key exists in the cache
   */
  has(key: TKey): boolean {
    return this.cache.has(key)
  }

  /**
   * Removes an entry from the cache.
   *
   * @param key - The key to remove
   * @returns True if the entry was removed, false if it didn't exist
   */
  delete(key: TKey): boolean {
    const value = this.cache.get(key)
    const deleted = this.cache.delete(key)
    if (deleted) {
      if (value !== undefined) {
        this.invokeEvict(value)
      }
      this.invokeChange(key)
    }
    return deleted
  }

  /**
   * Clears all entries from the cache.
   * Invokes onEvict callback for each entry if configured.
   */
  clear(): void {
    const entries = Array.from(this.cache.entries())
    if (this.onEvict) {
      for (const [, value] of entries) {
        this.invokeEvict(value)
      }
    }
    this.cache.clear()
    for (const [key] of entries) {
      this.invokeChange(key)
    }
  }

  /**
   * Returns all keys in the cache, from oldest to newest.
   */
  keys(): IterableIterator<TKey> {
    return this.cache.keys()
  }

  /**
   * Safely invokes the eviction callback, catching any errors.
   */
  private invokeEvict(value: TValue): void {
    try {
      this.onEvict?.(value)
    } catch {
      // Ignore eviction callback errors (e.g., URL.revokeObjectURL on invalid URL)
    }
  }

  /**
   * Safely invokes the change callback, catching any errors.
   */
  private invokeChange(key: TKey): void {
    try {
      this.onChange?.(key)
    } catch {
      // Ignore subscriber errors so cache mutation cannot fail.
    }
  }
}

const blobCacheListeners = new Map<string, Set<() => void>>()

function notifyBlobCacheChange(url: string): void {
  const listeners = blobCacheListeners.get(url)
  if (!listeners) return

  listeners.forEach((listener) => listener())
}

export function subscribeBlobCacheUrl(
  url: string | null | undefined,
  listener: () => void,
): () => void {
  if (!url) return () => {}

  let listeners = blobCacheListeners.get(url)
  if (!listeners) {
    listeners = new Set()
    blobCacheListeners.set(url, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      blobCacheListeners.delete(url)
    }
  }
}

export function getBlobCacheUrlSnapshot(
  url: string | null | undefined,
): string {
  return url ? (blobCache.get(url) ?? '') : ''
}

/**
 * Blob URL cache for media thumbnails, keyed by source URL.
 * Every stored value is an object URL owned by this module: it is revoked
 * when its entry is overwritten, evicted at capacity, removed, or cleared.
 * Reads are pure; recency lives in blobUrlRecency so snapshots stay
 * render-safe.
 */
export const blobCache = new Map<string, string>()

/** Source URLs ordered least- to most-recently used; drives eviction. */
export const blobUrlRecency = new Set<string>()

/** Marks a cached URL as most recently used so eviction skips it longest. */
export function touchBlobUrl(url: string): void {
  if (!blobCache.has(url)) return
  blobUrlRecency.delete(url)
  blobUrlRecency.add(url)
}

/** Removes one entry, revoking its object URL and notifying subscribers. */
export function removeBlobUrl(url: string): void {
  const staleBlobUrl = blobCache.get(url)
  if (staleBlobUrl) {
    URL.revokeObjectURL(staleBlobUrl)
  }
  blobCache.delete(url)
  blobUrlRecency.delete(url)
  notifyBlobCacheChange(url)
}

interface FetchBlobUrlOptions {
  signal?: AbortSignal
}

// Track pending fetches to deduplicate concurrent requests
const pendingBlobFetches = new Map<string, Promise<string | null>>()

async function requestBlobUrl(
  url: string,
  options?: FetchBlobUrlOptions,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: options?.signal })
    if (!res.ok) return null

    const blob = await res.blob()
    if (options?.signal?.aborted) return null

    const previousBlobUrl = blobCache.get(url)
    if (previousBlobUrl) {
      URL.revokeObjectURL(previousBlobUrl)
    }
    while (blobCache.size >= CACHE_CONFIG.MAX_BLOB_CACHE_SIZE) {
      const oldestUrl =
        blobUrlRecency.keys().next().value ?? blobCache.keys().next().value
      if (oldestUrl === undefined) break
      removeBlobUrl(oldestUrl)
    }

    blobCache.set(url, URL.createObjectURL(blob))
    touchBlobUrl(url)
    notifyBlobCacheChange(url)
    return blobCache.get(url) ?? null
  } catch {
    return null
  }
}

/**
 * Fetches a URL and returns a blob URL, with caching and request deduplication.
 * Used by both useBlobUrl hook and useArtworkColor to share blob URLs.
 *
 * @param url - The URL to fetch
 * @returns Promise resolving to blob URL or null on failure
 */
export function fetchBlobUrl(
  url: string,
  options?: FetchBlobUrlOptions,
): Promise<string | null> {
  // Return cached immediately
  const cached = blobCache.get(url)
  if (cached) {
    touchBlobUrl(url)
    return Promise.resolve(cached)
  }

  // Abortable calls skip dedupe so each caller can cancel independently.
  if (options?.signal) {
    return requestBlobUrl(url, options)
  }

  // Return pending request if one exists
  let promise = pendingBlobFetches.get(url)
  if (promise) return promise

  // Start new fetch
  promise = requestBlobUrl(url)

  pendingBlobFetches.set(url, promise)
  void promise.finally(() => pendingBlobFetches.delete(url))

  return promise
}

/** Revokes every cached object URL, empties the cache, and notifies. */
export function clearBlobCache(): void {
  blobCache.forEach((cachedBlobUrl) => URL.revokeObjectURL(cachedBlobUrl))
  const urls = Array.from(blobCache.keys())
  blobCache.clear()
  blobUrlRecency.clear()
  for (const url of urls) {
    notifyBlobCacheChange(url)
  }
}
