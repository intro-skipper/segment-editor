/**
 * Hook to extract dominant colors from images using node-vibrant.
 * Uses Web Worker for off-main-thread processing with LRU cache.
 * Dark mode uses Muted swatches, light mode uses Vibrant swatches.
 */

import { useEffect, useMemo, useState } from 'react'
import { formatHex, oklch, parse } from 'culori'
import type * as VibrantWorkerRuntime from 'node-vibrant/worker'

import type { Theme } from '@/stores/app-store'
import type { VibrantColors } from '@/lib/cache-manager'
import { LRUCache, fetchBlobUrl } from '@/lib/cache-manager'
import { CACHE_CONFIG } from '@/lib/constants'
import { selectTheme, useAppStore } from '@/stores/app-store'

export type { VibrantColors } from '@/lib/cache-manager'

interface PaletteSwatch {
  hex: string
}

interface Palette {
  Vibrant?: PaletteSwatch | null
  DarkVibrant?: PaletteSwatch | null
  LightVibrant?: PaletteSwatch | null
  Muted?: PaletteSwatch | null
  DarkMuted?: PaletteSwatch | null
  LightMuted?: PaletteSwatch | null
}

type ResolvedTheme = 'light' | 'dark'

// Lazy worker initialization
type VibrantWorkerModule = typeof VibrantWorkerRuntime

let workerInitialized = false
let vibrantWorkerModulePromise: Promise<VibrantWorkerModule> | null = null
let workerInitPromise: Promise<void> | null = null

const loadVibrantWorkerModule = async (): Promise<VibrantWorkerModule> => {
  if (!vibrantWorkerModulePromise) {
    vibrantWorkerModulePromise = import('node-vibrant/worker')
  }
  return vibrantWorkerModulePromise
}

const initWorker = async () => {
  if (workerInitialized) {
    return
  }

  if (!workerInitPromise) {
    workerInitPromise = Promise.all([
      loadVibrantWorkerModule(),
      import('node-vibrant/worker.worker?worker'),
    ]).then(([{ Vibrant, WorkerPipeline }, workerModule]) => {
      Vibrant.use(new WorkerPipeline(workerModule.default as never))
      workerInitialized = true
    })
  }

  await workerInitPromise
}

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

// Caches
const colorCacheLight = new LRUCache<string, VibrantColors>(
  CACHE_CONFIG.MAX_COLOR_CACHE_SIZE,
)
const colorCacheDark = new LRUCache<string, VibrantColors>(
  CACHE_CONFIG.MAX_COLOR_CACHE_SIZE,
)
const paletteCache = new LRUCache<string, Palette>(
  CACHE_CONFIG.MAX_COLOR_CACHE_SIZE,
)
const pending = new Map<string, Promise<Palette | null>>()

const getCache = (theme: ResolvedTheme) =>
  theme === 'dark' ? colorCacheDark : colorCacheLight

// Shared canvas for image processing
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

// Color utilities
const adjustLightness = (hex: string, adjust: number): string => {
  const color = parse(hex)
  if (!color) return hex
  const lch = oklch(color)
  lch.l = Math.max(0, Math.min(1, lch.l + adjust))
  return formatHex(lch)
}

const getLightness = (hex: string): number => {
  const color = parse(hex)
  if (!color) return 0.5
  return oklch(color).l
}

const getContrastText = (hex: string, threshold = 0.5): string =>
  getLightness(hex) < threshold ? '#f5f5f5' : '#1a1a1a'

/** Builds VibrantColors from palette based on theme */
const buildColors = (
  palette: Palette,
  theme: ResolvedTheme,
): VibrantColors | null => {
  const isDark = theme === 'dark'

  // Dark: Muted swatches, Light: Vibrant swatches
  const base = isDark
    ? (palette.DarkMuted?.hex ?? palette.Muted?.hex)
    : (palette.LightVibrant?.hex ?? palette.Vibrant?.hex)

  if (!base) return null

  const background = adjustLightness(base, isDark ? -0.12 : 0.08)
  const text = getContrastText(background, isDark ? 0.5 : 0.5)

  // Primary/accent fallback chains
  const primary = isDark
    ? (palette.Muted?.hex ?? palette.DarkMuted?.hex ?? base)
    : (palette.Vibrant?.hex ?? palette.DarkVibrant?.hex ?? base)

  const accent = isDark
    ? (palette.LightMuted?.hex ?? palette.Muted?.hex ?? base)
    : (palette.DarkVibrant?.hex ?? palette.Vibrant?.hex ?? base)

  return {
    background,
    primary,
    accent,
    text,
    accentText: getContrastText(accent),
  }
}

// Extraction pipeline
const EXTRACTION_TIMEOUT_MS = 5000

async function extractPalette(
  url: string,
  blobUrl: string,
  vibrantWorkerModule: VibrantWorkerModule,
): Promise<Palette | null> {
  const shared = getCanvas()
  if (!shared) return null

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = async () => {
      const { canvas, ctx } = shared
      const scale = Math.min(50 / img.width, 50 / img.height, 1)
      canvas.width = Math.floor(img.width * scale)
      canvas.height = Math.floor(img.height * scale)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      try {
        const compressedBlob = await new Promise<Blob | null>((onBlob) => {
          canvas.toBlob(onBlob, 'image/jpeg', 0.6)
        })
        if (!compressedBlob) {
          resolve(null)
          return
        }

        const compressedUrl = URL.createObjectURL(compressedBlob)
        let palette: Palette
        try {
          palette = await vibrantWorkerModule.Vibrant.from(compressedUrl)
            .quality(1)
            .getPalette()
        } finally {
          URL.revokeObjectURL(compressedUrl)
        }

        paletteCache.set(url, palette)
        resolve(palette)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.decoding = 'async'
    img.crossOrigin = 'anonymous'
    img.src = blobUrl
  })
}

async function extractPaletteWithTimeout(
  url: string,
  blobUrl: string,
  vibrantWorkerModule: VibrantWorkerModule,
): Promise<Palette | null> {
  return Promise.race([
    extractPalette(url, blobUrl, vibrantWorkerModule),
    new Promise<null>((r) => setTimeout(() => r(null), EXTRACTION_TIMEOUT_MS)),
  ])
}

async function getPalette(url: string): Promise<Palette | null> {
  await initWorker()
  const vibrantWorkerModule = await loadVibrantWorkerModule()

  const cached = paletteCache.get(url)
  if (cached) return Promise.resolve(cached)

  let promise = pending.get(url)
  if (!promise) {
    promise = fetchBlobUrl(url).then((blob) =>
      blob ? extractPaletteWithTimeout(url, blob, vibrantWorkerModule) : null,
    )
    pending.set(url, promise)
    void promise.finally(() => pending.delete(url))
  }
  return promise
}

async function getColors(
  url: string,
  theme: ResolvedTheme,
): Promise<VibrantColors | null> {
  const cache = getCache(theme)
  const cached = cache.get(url)
  if (cached) return cached

  const palette = await getPalette(url)
  if (!palette) return null

  const colors = buildColors(palette, theme)
  if (colors) cache.set(url, colors)
  return colors
}

/** Eagerly preloads vibrant colors for a list of image URLs into the cache. */
export const preloadVibrantColors = (
  urls: ReadonlyArray<string>,
  theme: Theme = 'auto',
): void => {
  const resolved = resolveTheme(theme)
  const cache = getCache(resolved)
  for (const url of urls) {
    if (url && !cache.has(url)) void getColors(url, resolved)
  }
}

// Main hook
interface UseVibrantColorOptions {
  enabled?: boolean
}

export function useVibrantColor(
  imageUrl: string | null,
  options?: UseVibrantColorOptions,
): VibrantColors | null {
  const enabled = options?.enabled ?? true
  const theme = useAppStore(selectTheme)
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme])
  const cache = useMemo(() => getCache(resolvedTheme), [resolvedTheme])

  const [colors, setColors] = useState<VibrantColors | null>(() =>
    imageUrl && enabled ? (cache.get(imageUrl) ?? null) : null,
  )

  useEffect(() => {
    if (!imageUrl || !enabled) {
      setColors(null)
      return
    }

    const cached = cache.get(imageUrl)
    if (cached) {
      setColors(cached)
      return
    }

    let cancelled = false
    getColors(imageUrl, resolvedTheme).then((result) => {
      if (!cancelled && result) setColors(result)
    })

    return () => {
      cancelled = true
    }
  }, [imageUrl, resolvedTheme, cache, enabled])

  return colors
}
