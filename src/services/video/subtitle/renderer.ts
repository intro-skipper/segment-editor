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

export type JassubInstance = JASSUB

export interface JassubRendererResult {
  instance: JassubInstance
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

  return mediaSource.MediaAttachments.filter((att) => {
    const mime = att.MimeType?.toLowerCase()
    return mime && SUPPORTED_FONT_TYPES.some((t) => t.toLowerCase() === mime)
  }).flatMap((att) => {
    if (att.DeliveryUrl) return [`${cleanServer}${att.DeliveryUrl}`]
    if (att.Index != null) {
      return [
        `${cleanServer}/Videos/${itemId}/${mediaSourceId}/Attachments/${att.Index}`,
      ]
    }
    return []
  })
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
  } = options

  const itemId = item.Id ?? ''
  const subUrl = getSubtitleUrl(track, itemId)
  const fonts = getEmbeddedFonts(item)
  const timeOffset = calcTimeOffset(transcodingOffsetTicks, userOffset)

  // Dynamic import JASSUB
  const JASSUB = (await import('jassub')).default

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
    instance.destroy()
    throw err
  })

  let destroyed = false

  return {
    instance,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      try {
        instance.destroy()
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
