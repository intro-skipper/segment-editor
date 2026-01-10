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
  calculateTimeOffset,
  fetchSubtitleContent,
  getSubtitleUrl,
} from './utils'
import type {
  CreateJassubOptions,
  JassubInstance,
  JassubRendererResult,
  SetTrackOptions,
} from './types'
import { getCredentials } from '@/services/jellyfin'

/** Empty ASS track used to initialize renderer and clear subtitles */
const EMPTY_ASS_HEADER = `[Script Info]
Title: Empty
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

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
 * @throws Error if initialization fails
 */
export async function createJassubRenderer(
  options: CreateJassubOptions,
): Promise<JassubRendererResult> {
  const { videoElement, track, item, transcodingOffsetTicks, userOffset } =
    options

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

  // Initialize with empty header first (JASSUB 2.2.0 pattern)
  // This ensures WebGL context is properly set up before loading real content
  const instance = new JASSUB({
    video: videoElement,
    subContent: EMPTY_ASS_HEADER,
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

  // Now set the actual subtitle track and resize
  await instance.renderer.setTrack(subContent)
  instance.resize()

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
      instance.resize()
    },
    clearTrack: async () => {
      if (isDisposed) return
      try {
        await instance.renderer.setTrack(EMPTY_ASS_HEADER)
        instance.resize()
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
