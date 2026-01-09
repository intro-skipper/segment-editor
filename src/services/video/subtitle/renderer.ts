/**
 * JASSUB ASS/SSA Subtitle Renderer.
 * Composes focused modules for a clean, maintainable implementation.
 *
 * @module services/video/subtitle/renderer
 */

import { JASSUB_READY_TIMEOUT_MS } from './constants'
import {
  buildAvailableFonts,
  extractEmbeddedFontUrls,
  fetchFallbackFontUrls,
} from './font-loader'
import {
  applyJassubOverlayStyles,
  calculateTimeOffset,
  fetchSubtitleContent,
  getSubtitleUrl,
  isWebGPUAvailable,
} from './utils'
import type {
  CreateJassubOptions,
  JassubInstance,
  JassubRendererResult,
  SetTrackOptions,
} from './types'
import { getCredentials } from '@/services/jellyfin'

/** Empty ASS track used to clear subtitles while keeping renderer alive */
const EMPTY_ASS_TRACK = `[Script Info]
Title: Empty
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
`

/**
 * Creates a JASSUB renderer for ASS/SSA subtitles.
 *
 * @param options - Renderer creation options
 * @returns Promise resolving to renderer result with control methods
 * @throws Error if WebGPU unavailable or initialization fails
 */
export async function createJassubRenderer(
  options: CreateJassubOptions,
): Promise<JassubRendererResult> {
  const { videoElement, track, item, transcodingOffsetTicks, userOffset } =
    options

  // Validate WebGPU support
  if (!(await isWebGPUAvailable())) {
    throw new Error(
      'WebGPU is not available. ASS/SSA subtitles require WebGPU support. ' +
        'Please use a browser with WebGPU enabled (Chrome 113+, Edge 113+, or Firefox with flags).',
    )
  }

  const { serverAddress, accessToken } = getCredentials()
  const itemId = item.Id ?? ''
  const mediaSource = item.MediaSources?.[0]

  // Load subtitle content and fallback fonts in parallel
  const [subContent, fallbackFontUrls] = await Promise.all([
    fetchSubtitleContent(
      getSubtitleUrl(track, itemId, serverAddress, accessToken),
    ),
    fetchFallbackFontUrls(serverAddress, accessToken).catch(() => []),
  ])

  // Extract fonts from already-loaded MediaSource (no API call needed)
  const embeddedFonts = extractEmbeddedFontUrls(
    mediaSource,
    itemId,
    serverAddress,
  )
  const availableFonts = buildAvailableFonts(fallbackFontUrls)
  const timeOffset = calculateTimeOffset(transcodingOffsetTicks, userOffset)

  // Dynamic import JASSUB
  const JASSUB = (await import('jassub')).default

  const instance = new JASSUB({
    video: videoElement,
    subContent,
    fonts: embeddedFonts,
    availableFonts,
    timeOffset,
    useLocalFonts: true,
    debug: import.meta.env.DEV,
  }) as unknown as JassubInstance

  // Wait for ready with timeout
  await Promise.race([
    instance.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('JASSUB ready timeout')),
        JASSUB_READY_TIMEOUT_MS,
      ),
    ),
  ]).catch((err) => {
    safeDestroy(instance)
    throw err
  })

  applyJassubOverlayStyles(videoElement)

  // Track disposal state to prevent operations on destroyed instance
  let isDisposed = false

  return {
    instance,
    dispose: () => {
      if (isDisposed) return
      isDisposed = true
      safeDestroy(instance)
    },
    setTimeOffset: (ticks: number, offset: number) => {
      if (isDisposed) return
      try {
        instance.renderer.timeOffset = calculateTimeOffset(ticks, offset)
      } catch {
        // Ignore if renderer proxy is released
      }
    },
    resize: () => {
      if (isDisposed) return
      try {
        instance.resize()
        instance.resetRenderAheadCache()
      } catch {
        // Ignore resize errors
      }
    },
    setTrack: async (opts: SetTrackOptions) => {
      if (isDisposed) return
      const newItemId = opts.item.Id ?? ''
      const content = await fetchSubtitleContent(
        getSubtitleUrl(opts.track, newItemId, serverAddress, accessToken),
      )
      if (isDisposed) return
      await instance.renderer.setTrack(content)
    },
    clearTrack: async () => {
      if (isDisposed) return
      try {
        await instance.renderer.setTrack(EMPTY_ASS_TRACK)
      } catch {
        // Ignore errors if renderer is already disposed
      }
    },
  }
}

/** Safely destroys a JASSUB instance. */
export function safeDestroy(instance: JassubInstance): void {
  try {
    instance.destroy()
  } catch {
    // Ignore destruction errors
  }
}
