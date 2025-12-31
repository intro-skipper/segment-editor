/**
 * Re-export Jellyfin SDK types for use throughout the application.
 * This provides a single import point for all Jellyfin-related types.
 */
export type {
  BaseItemDto,
  MediaSegmentDto,
  VirtualFolderInfo,
  MediaSegmentsApiGetItemSegmentsRequest,
} from '@jellyfin/sdk/lib/generated-client'

export {
  BaseItemKind,
  ImageType,
  MediaSegmentType,
} from '@jellyfin/sdk/lib/generated-client'
