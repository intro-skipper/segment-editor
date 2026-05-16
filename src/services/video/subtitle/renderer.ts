/**
 * JASSUB ASS/SSA Subtitle Renderer.
 *
 * @module services/video/subtitle/renderer
 */

import type JASSUB from 'jassub'
import type { SubtitleTrackInfo } from '../tracks'
import type { BaseItemDto } from '@/types/jellyfin'
import { buildApiUrl, getCredentials } from '@/services/jellyfin'
import { JELLYFIN_CONFIG, SUBTITLE_CONFIG } from '@/lib/constants'

const { TICKS_PER_SECOND } = JELLYFIN_CONFIG
const { SUPPORTED_FONT_TYPES, JASSUB_READY_TIMEOUT_MS } = SUBTITLE_CONFIG

// ============================================================================
// Types
// ============================================================================

let jassubImportPromise: Promise<typeof JASSUB> | null = null

async function loadJassubRenderer(): Promise<typeof JASSUB> {
  jassubImportPromise ??= import('jassub')
    .then((module) => module.default)
    .catch((err: unknown) => {
      jassubImportPromise = null
      throw err
    })

  return jassubImportPromise
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

export async function preloadJassubRenderer(): Promise<void> {
  await loadJassubRenderer()
}

export interface JassubRendererResult {
  instance: JASSUB
  destroy: () => void
  setTimeOffset: (transcodingTicks: number, userOffset: number) => void
  setTrack: (url: string) => Promise<void>
}

interface CreateRendererOptions {
  video: HTMLVideoElement
  track: SubtitleTrackInfo
  item: BaseItemDto
  transcodingOffsetTicks?: number
  userOffset?: number
  signal?: AbortSignal
}

// ============================================================================
// Helpers
// ============================================================================

/** Builds subtitle URL for a track. */
function getSubtitleUrl(track: SubtitleTrackInfo, itemId: string): string {
  const { serverAddress, accessToken } = getCredentials()

  if (track.deliveryUrl) {
    const endpoint = track.deliveryUrl.startsWith('/')
      ? track.deliveryUrl.slice(1)
      : track.deliveryUrl
    return buildApiUrl({ serverAddress, accessToken, endpoint })
  }

  const mediaSourceId = itemId.replace(/-/g, '')
  const ext = track.format.toLowerCase() === 'ssa' ? 'ssa' : 'ass'

  return buildApiUrl({
    serverAddress,
    accessToken,
    endpoint: `Videos/${itemId}/${mediaSourceId}/Subtitles/${track.index}/Stream.${ext}`,
  })
}

/** Extracts embedded font URLs from media source. */
function getEmbeddedFonts(item: BaseItemDto): Array<string> {
  const { serverAddress } = getCredentials()
  const mediaSource = item.MediaSources?.[0]
  if (!mediaSource?.MediaAttachments?.length) return []

  const itemId = item.Id ?? ''
  const mediaSourceId = mediaSource.Id ?? itemId.replace(/-/g, '')
  const cleanServer = serverAddress.replace(/\/+$/, '')

  return mediaSource.MediaAttachments.reduce<Array<string>>((urls, att) => {
    const mime = att.MimeType?.toLowerCase()
    if (!mime || !SUPPORTED_FONT_TYPES.some((t) => t.toLowerCase() === mime)) {
      return urls
    }
    if (att.DeliveryUrl) {
      urls.push(`${cleanServer}${att.DeliveryUrl}`)
    } else if (att.Index != null) {
      urls.push(
        `${cleanServer}/Videos/${itemId}/${mediaSourceId}/Attachments/${att.Index}`,
      )
    }
    return urls
  }, [])
}

/** Calculates time offset combining transcoding and user offset. */
function calcTimeOffset(transcodingTicks: number, userOffset: number): number {
  return transcodingTicks / TICKS_PER_SECOND + userOffset
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Creates a JASSUB renderer for ASS/SSA subtitles.
 */
export async function createJassubRenderer(
  options: CreateRendererOptions,
): Promise<JassubRendererResult> {
  const {
    video,
    track,
    item,
    transcodingOffsetTicks = 0,
    userOffset = 0,
    signal,
  } = options

  const itemId = item.Id ?? ''
  const subUrl = getSubtitleUrl(track, itemId)
  const fonts = getEmbeddedFonts(item)
  const timeOffset = calcTimeOffset(transcodingOffsetTicks, userOffset)

  // Reuse the preloaded dynamic import when available. First ASS subtitle
  // loads often spend time fetching/evaluating the JASSUB chunk before the
  // worker/WASM is ready; starting this earlier keeps that cost out of the
  // renderer critical path.
  throwIfAborted(signal)
  const JASSUB = await loadJassubRenderer()
  throwIfAborted(signal)

  // JASSUB assets are served from node_modules via Vite's dev server
  // In dev: /node_modules/.vite/deps/... or direct node_modules path
  // The library handles this internally when no URLs are provided
  const instance = new JASSUB({
    video,
    subUrl,
    fonts,
    timeOffset,
    queryFonts: 'localandremote',
    debug: import.meta.env.DEV,
  })

  // Wait for ready with timeout. If the selected track/item/video changes
  // during first-load worker/WASM/font setup, abort promptly instead of
  // leaving an obsolete renderer attached until ready or timeout.
  let readyTimeout: ReturnType<typeof setTimeout> | null = null
  let abortCleanup: (() => void) | null = null

  await Promise.race([
    instance.ready,
    new Promise<never>((_, reject) => {
      readyTimeout = setTimeout(
        () => reject(new Error('JASSUB ready timeout')),
        JASSUB_READY_TIMEOUT_MS,
      )
    }),
    new Promise<never>((_, reject) => {
      if (!signal) return
      const abort = () => reject(new DOMException('Aborted', 'AbortError'))
      if (signal.aborted) {
        abort()
        return
      }
      signal.addEventListener('abort', abort, { once: true })
      abortCleanup = () => signal.removeEventListener('abort', abort)
    }),
  ])
    .catch((err) => {
      void instance.destroy()
      throw err
    })
    .finally(() => {
      if (readyTimeout) clearTimeout(readyTimeout)
      abortCleanup?.()
    })

  let destroyed = false

  return {
    instance,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      try {
        void instance.destroy()
      } catch {
        // Ignore
      }
    },
    setTimeOffset: (ticks, offset) => {
      if (destroyed) return
      try {
        instance.timeOffset = calcTimeOffset(ticks, offset)
      } catch {
        // Ignore
      }
    },
    setTrack: async (url) => {
      if (destroyed) return
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch subtitle: ${res.status}`)
      const content = await res.text()
      await instance.renderer.setTrack(content)
    },
  }
}
