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
export interface LRUCacheOptions<TValue> {
  /** Callback invoked when an entry is evicted from the cache */
  onEvict?: (value: TValue) => void
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

  /**
   * Creates a new LRU cache with the specified maximum size.
   *
   * @param maxSize - Maximum number of entries before eviction occurs
   * @param options - Optional configuration including eviction callback
   */
  constructor(maxSize: number, options?: LRUCacheOptions<TValue>) {
    this.maxSize = Math.max(1, maxSize)
    this.onEvict = options?.onEvict
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
        }
      }
    }
    this.cache.set(key, value)
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
    if (deleted && value !== undefined) {
      this.invokeEvict(value)
    }
    return deleted
  }

  /**
   * Clears all entries from the cache.
   * Invokes onEvict callback for each entry if configured.
   */
  clear(): void {
    if (this.onEvict) {
      this.cache.forEach((value) => this.invokeEvict(value))
    }
    this.cache.clear()
  }

  /**
   * Returns the current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Returns the maximum capacity of the cache.
   */
  get capacity(): number {
    return this.maxSize
  }

  /**
   * Returns all keys in the cache, from oldest to newest.
   */
  keys(): IterableIterator<TKey> {
    return this.cache.keys()
  }

  /**
   * Returns all values in the cache, from oldest to newest.
   */
  values(): IterableIterator<TValue> {
    return this.cache.values()
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
}

/**
 * VibrantColors type for color extraction results.
 */
export interface VibrantColors {
  background: string
  primary: string
  accent: string
  text: string
  accentText: string
}

/**
 * Pre-configured blob URL cache for media thumbnails.
 * Uses the MAX_BLOB_CACHE_SIZE from CACHE_CONFIG.
 * Automatically revokes blob URLs when entries are evicted.
 */
export const blobCache = new LRUCache<string, string>(
  CACHE_CONFIG.MAX_BLOB_CACHE_SIZE,
  {
    onEvict: (url) => {
      // Validate URL before revoking to prevent errors
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    },
  },
)
