/**
 * Font loading utilities for JASSUB subtitle rendering.
 * @module services/video/subtitle/font-loader
 */

import { SUPPORTED_FONT_TYPES } from './constants'
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client'

import { buildApiUrl } from '@/services/jellyfin'

/**
 * Extracts embedded font URLs from media source attachments.
 * Uses MediaSourceInfo already available from the item - no additional API call needed.
 */
export function extractEmbeddedFontUrls(
  mediaSource: MediaSourceInfo | null | undefined,
  itemId: string,
  serverAddress: string,
): Array<string> {
  if (!mediaSource?.MediaAttachments?.length) return []

  const cleanServer = serverAddress.replace(/\/+$/, '')
  const mediaSourceId = mediaSource.Id ?? itemId.replace(/-/g, '')

  return mediaSource.MediaAttachments.filter((attachment) => {
    if (!attachment.MimeType) return false
    const mimeType = attachment.MimeType.toLowerCase()
    return SUPPORTED_FONT_TYPES.some((t) => t.toLowerCase() === mimeType)
  }).flatMap((attachment) => {
    // Prefer DeliveryUrl if available
    if (attachment.DeliveryUrl) {
      return [`${cleanServer}${attachment.DeliveryUrl}`]
    }
    // Fallback: construct URL from attachment index
    if (attachment.Index != null) {
      return [
        `${cleanServer}/Videos/${itemId}/${mediaSourceId}/Attachments/${attachment.Index}`,
      ]
    }
    return []
  })
}

/**
 * Font file interface from Jellyfin API.
 */
interface FontFile {
  Name?: string | null
}

/**
 * Fetches fallback font URLs from server configuration.
 */
export async function fetchFallbackFontUrls(
  serverAddress: string,
  accessToken: string,
): Promise<Array<string>> {
  try {
    const listUrl = buildApiUrl({
      serverAddress,
      accessToken,
      endpoint: 'FallbackFont/Fonts',
    })

    const response = await fetch(listUrl)
    if (!response.ok) return []

    const fontFiles: Array<FontFile> = await response.json()
    if (!Array.isArray(fontFiles)) return []

    return fontFiles
      .filter((font): font is FontFile & { Name: string } => !!font.Name)
      .map((font) =>
        buildApiUrl({
          serverAddress,
          accessToken,
          endpoint: `FallbackFont/Fonts/${encodeURIComponent(font.Name)}`,
        }),
      )
  } catch {
    return []
  }
}

/**
 * Builds availableFonts object from fallback font URLs.
 */
export function buildAvailableFonts(
  fallbackFontUrls: Array<string>,
): Record<string, string> {
  const availableFonts: Record<string, string> = {}

  for (const fontUrl of fallbackFontUrls) {
    try {
      const url = new URL(fontUrl)
      const pathParts = url.pathname.split('/')
      const fontFileName = pathParts[pathParts.length - 1]
      const fontName = fontFileName.replace(/\.[^.]+$/, '').toLowerCase()
      if (fontName) availableFonts[fontName] = fontUrl
    } catch {
      // Skip invalid URLs
    }
  }

  return availableFonts
}
