/**
 * Narrow Jellyfin SDK type/value facade for application imports.
 *
 * This contains SDK import paths for boundary hygiene only; it does not
 * guarantee bundle-size reduction. Keep exports named and minimal.
 */
// Discovery
export type { RecommendedServerInfo } from '@jellyfin/sdk/lib/models/recommended-server-info'
export { RecommendedServerInfoScore } from '@jellyfin/sdk/lib/models/recommended-server-info'

// Images
export { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type'

// Items and media
export type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto'
export type { ChapterInfo } from '@jellyfin/sdk/lib/generated-client/models/chapter-info'
export type { MediaSegmentDto } from '@jellyfin/sdk/lib/generated-client/models/media-segment-dto'
export type { TrickplayInfoDto } from '@jellyfin/sdk/lib/generated-client/models/trickplay-info-dto'
export type { VirtualFolderInfo } from '@jellyfin/sdk/lib/generated-client/models/virtual-folder-info'
export { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind'
export { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields'
export { MediaSegmentType } from '@jellyfin/sdk/lib/generated-client/models/media-segment-type'
export { SortOrder } from '@jellyfin/sdk/lib/generated-client/models/sort-order'
