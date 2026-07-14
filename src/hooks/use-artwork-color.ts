/**
 * Artwork seed color extraction.
 * Downscales item artwork and quantizes it with material-color-utilities
 * (QuantizerCelebi + Score — the Material You source-color pipeline) to a
 * single seed color. The seed feeds the M3 dynamic scheme in
 * DynamicThemeScope; all role colors derive from it there.
 */

import { useSyncExternalStore } from 'react'
import {
  QuantizerCelebi,
  Score,
  hexFromArgb,
} from '@material/material-color-utilities'

import type { Theme } from '@/stores/app-store'
import { LRUCache, blobCache, fetchBlobUrl } from '@/lib/cache-manager'
import { CACHE_CONFIG } from '@/lib/constants'
import { selectMonochrome, selectTheme, useAppStore } from '@/stores/app-store'

type ResolvedTheme = 'light' | 'dark'

// Cache the MediaQueryList and its result at module level so resolveTheme
// never calls window.matchMedia() on every invocation.
const darkModeQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

let prefersDark = darkModeQuery?.matches ?? false

darkModeQuery?.addEventListener('change', (e) => {
  prefersDark = e.matches
})

const resolveTheme = (theme: Theme): ResolvedTheme =>
  theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme

const seedListeners = new Map<string, Set<() => void>>()

function notifySeedChange(url: string): void {
  const listeners = seedListeners.get(url)
  if (!listeners) return
  for (const listener of listeners) listener()
}

const seedCache = new LRUCache<string, string>(
  CACHE_CONFIG.MAX_COLOR_CACHE_SIZE,
  { onChange: (url) => notifySeedChange(url) },
)

const pendingSeeds = new Map<string, Promise<string | null>>()

function subscribeSeedUrl(
  url: string | null,
  listener: () => void,
): () => void {
  if (!url) return () => {}

  let listeners = seedListeners.get(url)
  if (!listeners) {
    listeners = new Set()
    seedListeners.set(url, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      seedListeners.delete(url)
    }
  }
}

function getSeedSnapshot(url: string | null, enabled: boolean): string | null {
  return url && enabled ? (seedCache.peek(url) ?? null) : null
}

function subscribeSeedExtraction(
  url: string | null,
  enabled: boolean,
  listener: () => void,
): () => void {
  const unsubscribe = subscribeSeedUrl(url, () => {
    listener()
    if (url && enabled && !getSeedSnapshot(url, enabled)) {
      void getSeedColor(url)
    }
  })

  if (url && enabled && !getSeedSnapshot(url, enabled)) {
    void getSeedColor(url)
  }

  return unsubscribe
}

let sharedCanvas: {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} | null = null

const getCanvas = () => {
  if (!sharedCanvas) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) sharedCanvas = { canvas, ctx }
  }
  return sharedCanvas
}

const EXTRACTION_TIMEOUT_MS = 5000
const MAX_SAMPLE_DIMENSION = 50
const MAX_QUANTIZE_COLORS = 128

function quantizeSeed(imageData: ImageData): string | null {
  const { data } = imageData
  const pixels: Array<number> = []
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    if (alpha < 255) continue
    pixels.push(
      ((alpha << 24) | (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) >>>
        0,
    )
  }
  if (pixels.length === 0) return null

  const ranked = Score.score(
    QuantizerCelebi.quantize(pixels, MAX_QUANTIZE_COLORS),
  )
  return hexFromArgb(ranked[0])
}

async function extractSeed(blobUrl: string): Promise<string | null> {
  const shared = getCanvas()
  if (!shared) return null

  return new Promise((resolve) => {
    const img = new Image()
    let resolved = false
    let imageLoaded = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const resolveOnce = (seed: string | null) => {
      if (resolved) return
      resolved = true
      if (timeoutId !== null) clearTimeout(timeoutId)
      img.onload = null
      img.onerror = null
      resolve(seed)
    }

    timeoutId = setTimeout(() => {
      if (!imageLoaded) {
        img.src = ''
      }
      resolveOnce(null)
    }, EXTRACTION_TIMEOUT_MS)

    img.onload = () => {
      imageLoaded = true
      const { canvas, ctx } = shared
      const scale = Math.min(
        MAX_SAMPLE_DIMENSION / img.width,
        MAX_SAMPLE_DIMENSION / img.height,
        1,
      )
      canvas.width = Math.max(1, Math.floor(img.width * scale))
      canvas.height = Math.max(1, Math.floor(img.height * scale))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        resolveOnce(quantizeSeed(imageData))
      } catch {
        resolveOnce(null)
      }
    }
    img.onerror = () => resolveOnce(null)
    img.decoding = 'async'
    img.crossOrigin = 'anonymous'
    img.src = blobUrl
  })
}

async function getSeedColor(url: string): Promise<string | null> {
  const cached = seedCache.get(url)
  if (cached) return cached

  let promise = pendingSeeds.get(url)
  if (!promise) {
    promise = (async () => {
      const cachedSeed = seedCache.get(url)
      if (cachedSeed) return cachedSeed

      const blobUrl = blobCache.peek(url) ?? (await fetchBlobUrl(url))
      if (!blobUrl) return null

      const seed = await extractSeed(blobUrl)
      if (seed) seedCache.set(url, seed)
      return seed
    })()
    pendingSeeds.set(url, promise)
    void promise.finally(() => pendingSeeds.delete(url))
  }
  return promise
}

interface UseArtworkColorOptions {
  enabled?: boolean
}

/**
 * Returns the Material You seed color extracted from the given artwork URL,
 * or null while unavailable (loading, failed, disabled, or monochrome mode).
 */
export function useArtworkColor(
  imageUrl: string | null,
  options?: UseArtworkColorOptions,
): string | null {
  const monochrome = useAppStore(selectMonochrome)
  const enabled = (options?.enabled ?? true) && !monochrome
  const cachedSeed = useSyncExternalStore(
    (onStoreChange) =>
      subscribeSeedExtraction(imageUrl, enabled, onStoreChange),
    () => getSeedSnapshot(imageUrl, enabled),
    () => null,
  )

  return cachedSeed
}

/** Kept for callers that need the resolved light/dark theme reactively. */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useAppStore(selectTheme)
  return resolveTheme(theme)
}
