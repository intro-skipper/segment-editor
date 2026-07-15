/**
 * SegmentTimeline component.
 * Read-only miniature timeline showing which segments exist across an
 * item's runtime, mirroring the segment colors used by the player scrubber
 * and editor. Designed for list views (e.g. episode lists) so segment
 * coverage is visible at a glance without opening the editor.
 */

import { useTranslation } from 'react-i18next'

import type { MediaSegmentDto } from '@/types/jellyfin'
import type { SegmentRegion } from '@/lib/segment-utils'
import { getSegmentRegions } from '@/lib/segment-utils'
import { formatCompactTime } from '@/lib/time-utils'
import { cn } from '@/lib/utils'

/**
 * Minimum rendered region width in percent. Keeps short segments (e.g. a
 * few seconds of preview) visible on narrow tracks instead of dropping them.
 */
const MIN_VISIBLE_WIDTH_PERCENT = 0.8

interface SegmentTimelineProps {
  /** Segments with StartTicks/EndTicks in seconds (as returned by useSegments) */
  segments: Array<MediaSegmentDto>
  /** Total runtime of the item in seconds */
  runtimeSeconds: number
  /** Renders a pulsing placeholder track while segment data loads */
  isLoading?: boolean
  className?: string
}

export function SegmentTimeline({
  segments,
  runtimeSeconds,
  isLoading = false,
  className,
}: SegmentTimelineProps) {
  const { t } = useTranslation()

  // Localized like SegmentSlider/SegmentTypeMenu; unknown server enum
  // values fall back to the raw type string.
  const regionLabel = (region: SegmentRegion): string => {
    const type = region.type ?? 'Unknown'
    return `${t(`segmentType.${type}`, type)} ${formatCompactTime(region.startSeconds)} – ${formatCompactTime(region.endSeconds)}`
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          'h-1.5 rounded-full bg-muted/70 animate-pulse',
          className,
        )}
        aria-hidden="true"
      />
    )
  }

  // Fall back to the furthest segment end so existing segments still render
  // (with correct relative placement) when the item has no known runtime.
  const maxSegmentEnd = segments.reduce(
    (max, segment) => Math.max(max, segment.EndTicks ?? 0),
    0,
  )
  const duration = runtimeSeconds > 0 ? runtimeSeconds : maxSegmentEnd
  const regions = getSegmentRegions(segments, duration, {
    minVisibleWidthPercent: MIN_VISIBLE_WIDTH_PERCENT,
  })

  const label =
    regions.length === 0
      ? t('segment.timeline.empty', 'No segments')
      : t('segment.timeline.label', {
          defaultValue: 'Segments: {{list}}',
          list: regions.map(regionLabel).join(', '),
        })

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'relative h-1.5 rounded-full overflow-hidden bg-primary/15',
        className,
      )}
    >
      {regions.map((region) => (
        <div
          key={region.id}
          className="absolute inset-y-0 opacity-90"
          style={{
            left: `${region.start}%`,
            width: `${region.width}%`,
            backgroundColor: region.color,
          }}
          title={regionLabel(region)}
        />
      ))}
    </div>
  )
}
