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
 * Safely extracts ProviderIds from a BaseItemDto.
 *
 * The Jellyfin SDK types `ProviderIds` as `{ [key: string]: string | null } | null | undefined`
 * which requires a cast for convenient `?.Tmdb` style access. This helper centralises that
 * cast so consumers don't repeat it.
 */
export function getProviderIds(
  item:
    | { ProviderIds?: Record<string, string | null> | null }
    | null
    | undefined,
): Record<string, string> | undefined {
  return (
    (item as { ProviderIds?: Record<string, string> } | undefined)
      ?.ProviderIds ?? undefined
  )
}
