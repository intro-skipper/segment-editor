/**
 * Hook to extract dominant colors from images using node-vibrant.
 * Uses Web Worker for off-main-thread processing with LRU cache.
 * Dark mode uses Muted swatches, light mode uses Vibrant swatches.
 */

import { useEffect, useMemo, useState } from 'react'
import { Vibrant, WorkerPipeline } from 'node-vibrant/worker'
import PipelineWorker from 'node-vibrant/worker.worker?worker'
import { formatHex, oklch, parse } from 'culori'

import type { Theme } from '@/stores/app-store'
import type { VibrantColors } from '@/lib/cache-manager'
import { LRUCache, blobCache } from '@/lib/cache-manager'
import { selectTheme, useAppStore } from '@/stores/app-store'

export type { VibrantColors } from '@/lib/cache-manager'

type Palette = Awaited<ReturnType<Vibrant['getPalette']>>
type ResolvedTheme = 'light' | 'dark'

// Lazy worker initialization
let workerInitialized = false
const initWorker = () => {
  if (!workerInitialized) {
    Vibrant.use(new WorkerPipeline(PipelineWorker as never))
    workerInitialized = true
  }
}

const resolveTheme = (theme: Theme): ResolvedTheme =>
  theme === 'auto'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : theme

// Caches
const colorCacheLight = new LRUCache<string, VibrantColors>(100)
const colorCacheDark = new LRUCache<string, VibrantColors>(100)
const paletteCache = new LRUCache<string, Palette>(100)
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

async function fetchBlob(url: string): Promise<string | null> {
  const cached = blobCache.get(url)
  if (cached) return cached
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blobUrl = URL.createObjectURL(await res.blob())
    blobCache.set(url, blobUrl)
    return blobUrl
  } catch {
    return null
  }
}

async function extractPalette(
  url: string,
  blobUrl: string,
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
        const palette = await Vibrant.from(canvas.toDataURL('image/jpeg', 0.6))
          .quality(1)
          .getPalette()
        paletteCache.set(url, palette)
        resolve(palette)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.crossOrigin = 'anonymous'
    img.src = blobUrl
  })
}

async function extractPaletteWithTimeout(
  url: string,
  blobUrl: string,
): Promise<Palette | null> {
  return Promise.race([
    extractPalette(url, blobUrl),
    new Promise<null>((r) => setTimeout(() => r(null), EXTRACTION_TIMEOUT_MS)),
  ])
}

function getPalette(url: string): Promise<Palette | null> {
  initWorker()

  const cached = paletteCache.get(url)
  if (cached) return Promise.resolve(cached)

  let promise = pending.get(url)
  if (!promise) {
    promise = fetchBlob(url).then((blob) =>
      blob ? extractPaletteWithTimeout(url, blob) : null,
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

// Main hook
export function useVibrantColor(imageUrl: string | null): VibrantColors | null {
  const theme = useAppStore(selectTheme)
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme])
  const cache = useMemo(() => getCache(resolvedTheme), [resolvedTheme])

  const [colors, setColors] = useState<VibrantColors | null>(() =>
    imageUrl ? (cache.get(imageUrl) ?? null) : null,
  )

  useEffect(() => {
    if (!imageUrl) {
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
  }, [imageUrl, resolvedTheme, cache])

  return colors
}

export const getCachedVibrantColor = (
  url: string,
  theme: Theme = 'auto',
): VibrantColors | null => getCache(resolveTheme(theme)).get(url) ?? null

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

export const clearVibrantCaches = (): void => {
  colorCacheLight.clear()
  colorCacheDark.clear()
  paletteCache.clear()
  blobCache.clear()
}
