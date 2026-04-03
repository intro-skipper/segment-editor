/**
 * Re-export Jellyfin SDK types for use throughout the application.
 * This provides a single import point for all Jellyfin-related types.
 */
export type {
  BaseItemDto,
  MediaSegmentDto,
  TrickplayInfoDto,
  VirtualFolderInfo,
} from '@jellyfin/sdk/lib/generated-client'
export {
  BaseItemKind,
  ImageType,
  MediaSegmentType,
} from '@jellyfin/sdk/lib/generated-client'

/**
 * Safely extracts ProviderIds from a BaseItemDto, filtering out null values.
 *
 * The Jellyfin SDK types `ProviderIds` as `{ [key: string]: string | null } | null | undefined`.
 * This helper filters out nullish values so callers can safely assume all values are strings.
 */
export function getProviderIds(
  item:
    | { ProviderIds?: Record<string, string | null> | null }
    | null
    | undefined,
): Record<string, string> | undefined {
  const raw = (
    item as { ProviderIds?: Record<string, string | null> } | undefined
  )?.ProviderIds
  if (!raw) return undefined

  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value != null) {
      result[key] = value
    }
  }
  return result
}
