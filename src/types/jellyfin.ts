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
