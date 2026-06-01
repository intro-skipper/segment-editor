import { useSyncExternalStore } from 'react'
import { formatHex, oklch, parse } from 'culori'
import type * as VibrantWorkerRuntime from 'node-vibrant/worker'

import type { Theme } from '@/stores/app-store'
import type { VibrantColors } from '@/lib/cache-manager'
import { LRUCache, blobCache, fetchBlobUrl } from '@/lib/cache-manager'
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

const colorCacheListeners: Record<
  ResolvedTheme,
  Map<string, Set<() => void>>
> = {
  light: new Map(),
  dark: new Map(),
}

function notifyColorCacheChange(theme: ResolvedTheme, url: string): void {
  const listeners = colorCacheListeners[theme].get(url)
  if (!listeners) return

  listeners.forEach((listener) => listener())
}

const colorCacheLight = new LRUCache<string, VibrantColors>(
  CACHE_CONFIG.MAX_COLOR_CACHE_SIZE,
  { onChange: (url) => notifyColorCacheChange('light', url) },
)
const colorCacheDark = new LRUCache<string, VibrantColors>(
  CACHE_CONFIG.MAX_COLOR_CACHE_SIZE,
  { onChange: (url) => notifyColorCacheChange('dark', url) },
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

function subscribeColorCacheUrl(
  theme: ResolvedTheme,
  url: string | null,
  listener: () => void,
): () => void {
  if (!url) return () => {}

  const listenersByUrl = colorCacheListeners[theme]
  let listeners = listenersByUrl.get(url)
  if (!listeners) {
    listeners = new Set()
    listenersByUrl.set(url, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      listenersByUrl.delete(url)
    }
  }
}

function getColorCacheSnapshot(
  theme: ResolvedTheme,
  url: string | null,
  enabled: boolean,
): VibrantColors | null {
  return url && enabled ? (getCache(theme).peek(url) ?? null) : null
}

function subscribeColorExtraction(
  theme: ResolvedTheme,
  url: string | null,
  enabled: boolean,
  listener: () => void,
): () => void {
  const unsubscribe = subscribeColorCacheUrl(theme, url, listener)

  if (url && enabled && !getColorCacheSnapshot(theme, url, enabled)) {
    void getColors(url, theme)
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
    let resolved = false
    let imageLoaded = false
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

    const resolveOnce = (palette: Palette | null) => {
      if (resolved) return
      resolved = true
      clearTimeoutIfNeeded()
      detachImageHandlers()
      resolve(palette)
    }

    const hasResolved = () => resolved

    timeoutId = setTimeout(() => {
      if (!imageLoaded) {
        img.src = ''
      }
      resolveOnce(null)
    }, EXTRACTION_TIMEOUT_MS)

    img.onload = async () => {
      imageLoaded = true
      detachImageHandlers()
      const { canvas, ctx } = shared
      const scale = Math.min(50 / img.width, 50 / img.height, 1)
      canvas.width = Math.floor(img.width * scale)
      canvas.height = Math.floor(img.height * scale)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      try {
        if (hasResolved()) return
        const compressedBlob = await new Promise<Blob | null>((onBlob) => {
          canvas.toBlob(onBlob, 'image/jpeg', 0.6)
        })
        if (!compressedBlob) {
          resolveOnce(null)
          return
        }
        if (hasResolved()) return

        const compressedUrl = URL.createObjectURL(compressedBlob)
        try {
          if (hasResolved()) return
          const palette = await vibrantWorkerModule.Vibrant.from(compressedUrl)
            .quality(1)
            .getPalette()
          if (!hasResolved()) {
            paletteCache.set(url, palette)
            resolveOnce(palette)
          }
        } finally {
          URL.revokeObjectURL(compressedUrl)
        }
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
    promise = (async () => {
      const cachedPalette = paletteCache.get(url)
      if (cachedPalette) return cachedPalette

      const blob = await fetchBlobUrl(url)
      if (!blob) return null

      await initWorker()
      const vibrantWorkerModule = await loadVibrantWorkerModule()

      return queuePaletteTask(async () => {
        const queuedCachedPalette = paletteCache.get(url)
        if (queuedCachedPalette) return queuedCachedPalette

        const queuedBlob =
          blobCache.peek(url) === blob ? blob : await fetchBlobUrl(url)
        if (!queuedBlob) return null

        return extractPalette(url, queuedBlob, vibrantWorkerModule)
      })
    })()
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
  const cachedColors = useSyncExternalStore(
    (onStoreChange) =>
      subscribeColorExtraction(resolvedTheme, imageUrl, enabled, onStoreChange),
    () => getColorCacheSnapshot(resolvedTheme, imageUrl, enabled),
    () => null,
  )

  return cachedColors
}
