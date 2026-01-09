/**
 * Video API service.
 * Handles video streaming URLs and image URLs for Jellyfin media.
 */

import type { BaseItemDto, ImageType } from '@/types/jellyfin'
import { generateUUID } from '@/lib/segment-utils'
import { buildUrl, getOrCreateDeviceId } from '@/services/jellyfin/sdk'

export interface VideoStreamOptions {
  itemId: string
  container?: string
  audioCodec?: string
  maxStreamingBitrate?: number
  startTimeTicks?: number
}

export interface ImageUrlOptions {
  itemId: string
  imageType?: ImageType
  maxWidth?: number
  maxHeight?: number
  quality?: number
  tag?: string
  fillWidth?: number
  fillHeight?: number
}

export function getVideoStreamUrl(options: VideoStreamOptions): string {
  const {
    itemId,
    container = 'mp4',
    audioCodec = 'aac',
    maxStreamingBitrate = 140000000,
    startTimeTicks = 0,
  } = options

  const query = new URLSearchParams({
    DeviceId: getOrCreateDeviceId(),
    MediaSourceId: itemId.replace(/-/g, ''),
    PlaySessionId: generateUUID(),
    VideoCodec: 'av1,hevc,h264,vp9',
    AudioCodec: audioCodec,
    VideoBitrate: String(maxStreamingBitrate),
    AudioBitrate: '384000',
    AudioSampleRate: '48000',
    MaxStreamingBitrate: String(maxStreamingBitrate),
    StartTimeTicks: String(startTimeTicks),
    TranscodingProtocol: 'hls',
    SegmentContainer: container,
    MinSegments: '1',
    BreakOnNonKeyFrames: 'True',
    RequireAvc: 'false',
    EnableAudioVbrEncoding: 'true',
    TranscodingMaxAudioChannels: '6',
    'h264-profile': 'high',
    'h264-level': '51',
    'hevc-profile': 'main,main10',
    'hevc-level': '186',
    'av1-profile': 'main',
  })

  return buildUrl(`Videos/${itemId}/master.m3u8`, query)
}

function getImageUrl(options: ImageUrlOptions): string {
  const {
    itemId,
    imageType = 'Primary',
    maxWidth,
    maxHeight,
    quality = 90,
    tag,
    fillWidth,
    fillHeight,
  } = options

  const query = new URLSearchParams({ quality: String(quality) })
  if (maxWidth != null) query.set('maxWidth', String(maxWidth))
  if (maxHeight != null) query.set('maxHeight', String(maxHeight))
  if (fillWidth != null) query.set('fillWidth', String(fillWidth))
  if (fillHeight != null) query.set('fillHeight', String(fillHeight))
  if (tag) query.set('tag', tag)

  return buildUrl(`Items/${itemId}/Images/${imageType}`, query)
}

type ImageCandidate = { itemId: string; imageType: ImageType; tag?: string }

export function getBestImageUrl(
  item: BaseItemDto,
  maxWidth?: number,
  maxHeight?: number,
): string | undefined {
  if (!item.Id) return undefined

  const candidates: Array<ImageCandidate | null> = [
    item.ImageTags?.Primary
      ? { itemId: item.Id, imageType: 'Primary', tag: item.ImageTags.Primary }
      : null,
    item.BackdropImageTags?.[0]
      ? {
          itemId: item.Id,
          imageType: 'Backdrop',
          tag: item.BackdropImageTags[0],
        }
      : null,
    item.ImageTags?.Thumb
      ? { itemId: item.Id, imageType: 'Thumb', tag: item.ImageTags.Thumb }
      : null,
    item.ParentThumbItemId
      ? { itemId: item.ParentThumbItemId, imageType: 'Thumb' }
      : null,
    item.SeriesId && item.SeriesPrimaryImageTag
      ? {
          itemId: item.SeriesId,
          imageType: 'Primary',
          tag: item.SeriesPrimaryImageTag,
        }
      : null,
  ]

  for (const c of candidates) {
    if (c) {
      const url = getImageUrl({
        itemId: c.itemId,
        imageType: c.imageType,
        maxWidth,
        maxHeight,
        tag: c.tag,
      })
      if (url) return url
    }
  }
  return undefined
}

export function getImageBlurhash(item: BaseItemDto): string | undefined {
  const hashes = item.ImageBlurHashes?.Primary
  return hashes ? Object.values(hashes)[0] : undefined
}
