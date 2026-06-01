import { useEffect, useState } from 'react'
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

type VibrantWorkerModule = typeof VibrantWorkerRuntime
type VibrantWorkerClass = new () => Worker & { id: number; idle: boolean }

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
      const installPipeline = Vibrant.use.bind(Vibrant)
      installPipeline(
        new WorkerPipeline(
          workerModule.default as unknown as VibrantWorkerClass,
        ),
      )
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

const colorCacheLight = new LRUCache<string, VibrantColors>(
  CACHE_CONFIG.MAX_COLOR_CACHE_SIZE,
)
const colorCacheDark = new LRUCache<string, VibrantColors>(
  CACHE_CONFIG.MAX_COLOR_CACHE_SIZE,
)
const paletteCache = new LRUCache<string, Palette>(
  CACHE_CONFIG.MAX_COLOR_CACHE_SIZE,
)
const pendingPalettes = new Map<string, Promise<Palette | null>>()
const MAX_PALETTE_EXTRACTION_CONCURRENCY = 1
const paletteTaskQueue: Array<() => void> = []
let activePaletteTaskCount = 0

function queuePaletteTask(
  task: () => Promise<Palette | null>,
): Promise<Palette | null> {
  return new Promise((resolve) => {
    const run = () => {
      activePaletteTaskCount++
      void task()
        .then(resolve, () => resolve(null))
        .finally(() => {
          activePaletteTaskCount--
          paletteTaskQueue.shift()?.()
        })
    }

    if (activePaletteTaskCount < MAX_PALETTE_EXTRACTION_CONCURRENCY) {
      run()
    } else {
      paletteTaskQueue.push(run)
    }
  })
}

const getCache = (theme: ResolvedTheme) =>
  theme === 'dark' ? colorCacheDark : colorCacheLight

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

const buildColors = (
  palette: Palette,
  theme: ResolvedTheme,
): VibrantColors | null => {
  const isDark = theme === 'dark'

  const base = isDark
    ? (palette.DarkMuted?.hex ?? palette.Muted?.hex)
    : (palette.LightVibrant?.hex ?? palette.Vibrant?.hex)

  if (!base) return null

  const background = adjustLightness(base, isDark ? -0.12 : 0.08)
  const text = getContrastText(background)

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
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const clearTimeoutIfNeeded = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const detachImageHandlers = () => {
      img.onload = null
      img.onerror = null
    }

    const hasSettled = () => settled

    const resolveOnce = (palette: Palette | null) => {
      if (settled) return
      settled = true
      clearTimeoutIfNeeded()
      detachImageHandlers()
      resolve(palette)
    }

    timeoutId = setTimeout(() => {
      img.src = ''
      resolveOnce(null)
    }, EXTRACTION_TIMEOUT_MS)

    img.onload = async () => {
      detachImageHandlers()
      const { canvas, ctx } = shared
      const scale = Math.min(50 / img.width, 50 / img.height, 1)
      canvas.width = Math.floor(img.width * scale)
      canvas.height = Math.floor(img.height * scale)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      try {
        if (hasSettled()) return
        const compressedBlob = await new Promise<Blob | null>((onBlob) => {
          canvas.toBlob(onBlob, 'image/jpeg', 0.6)
        })
        if (!compressedBlob || hasSettled()) {
          if (!compressedBlob) resolveOnce(null)
          return
        }

        const compressedUrl = URL.createObjectURL(compressedBlob)
        let palette: Palette
        try {
          palette = await vibrantWorkerModule.Vibrant.from(compressedUrl)
            .quality(1)
            .getPalette()
          if (hasSettled()) return
        } finally {
          URL.revokeObjectURL(compressedUrl)
        }

        paletteCache.set(url, palette)
        resolveOnce(palette)
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

async function getPalette(url: string): Promise<Palette | null> {
  const cached = paletteCache.get(url)
  if (cached) return cached

  let promise = pendingPalettes.get(url)
  if (!promise) {
    promise = queuePaletteTask(async () => {
      const cachedPalette = paletteCache.get(url)
      if (cachedPalette) return cachedPalette

      const blob = await fetchBlobUrl(url)
      if (!blob) return null

      await initWorker()
      const vibrantWorkerModule = await loadVibrantWorkerModule()
      return extractPalette(url, blob, vibrantWorkerModule)
    })
    pendingPalettes.set(url, promise)
    void promise.finally(() => pendingPalettes.delete(url))
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

interface UseVibrantColorOptions {
  enabled?: boolean
}

export function useVibrantColor(
  imageUrl: string | null,
  options?: UseVibrantColorOptions,
): VibrantColors | null {
  const enabled = options?.enabled ?? true
  const theme = useAppStore(selectTheme)
  const resolvedTheme = resolveTheme(theme)
  const cache = getCache(resolvedTheme)

  const [cachedColors, setCachedColors] = useState<{
    for: string
    theme: ResolvedTheme
    colors: VibrantColors
  } | null>(null)

  useEffect(() => {
    if (!imageUrl || !enabled) return

    let cancelled = false
    void getColors(imageUrl, resolvedTheme).then((result) => {
      if (!cancelled && result) {
        setCachedColors({ for: imageUrl, theme: resolvedTheme, colors: result })
      }
    })

    return () => {
      cancelled = true
    }
  }, [imageUrl, resolvedTheme, cache, enabled])

  if (!imageUrl || !enabled) return null
  if (cachedColors?.for === imageUrl && cachedColors.theme === resolvedTheme) {
    return cachedColors.colors
  }

  // Pure render-time fallback for already-populated caches. Cached hits are
  // promoted in the effect above without scheduling an extra state update.
  return cache.peek(imageUrl) ?? null
}
