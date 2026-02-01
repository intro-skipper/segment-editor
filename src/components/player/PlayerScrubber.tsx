/**
 * PlayerScrubber component.
 * Timeline scrubber for video playback with seek functionality.
 * Supports mouse, touch, and keyboard interactions.
 * Includes trickplay preview thumbnails on hover.
 */

import * as React from 'react'

import type { ChapterInfo } from '@jellyfin/sdk/lib/generated-client/models'

import type { MediaSegmentDto } from '@/types/jellyfin'
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import type { SessionStore } from '@/stores/session-store'
import type { TrickplayData, TrickplayPosition } from '@/lib/trickplay-utils'
import { cn } from '@/lib/utils'
import { formatTime, ticksToSeconds } from '@/lib/time-utils'
import { useSessionStore } from '@/stores/session-store'
import { handleRangeKeyboard } from '@/lib/keyboard-utils'
import { DEFAULT_SEGMENT_COLOR, SEGMENT_COLORS } from '@/lib/constants'
import {
  getBestTrickplayInfo,
  getTrickplayPosition,
} from '@/lib/trickplay-utils'
import { useApiStore } from '@/stores/api-store'

/** Step sizes for scrubber keyboard navigation */
const SCRUBBER_STEP_FINE = 5
const SCRUBBER_STEP_COARSE = 10

/** Trickplay thumbnail preview component */
function TrickplayPreview({ position }: { position: TrickplayPosition }) {
  return (
    <div
      className="rounded overflow-hidden shadow-lg mb-1 bg-black"
      style={{
        width: position.thumbnailWidth,
        height: position.thumbnailHeight,
      }}
    >
      <div
        style={{
          width: position.thumbnailWidth,
          height: position.thumbnailHeight,
          backgroundImage: `url(${position.tileUrl})`,
          backgroundPosition: `-${position.offsetX}px -${position.offsetY}px`,
          backgroundRepeat: 'no-repeat',
        }}
      />
    </div>
  )
}

export interface PlayerScrubberProps {
  currentTime: number
  duration: number
  buffered?: number
  chapters?: Array<ChapterInfo> | null
  segments?: Array<MediaSegmentDto>
  onSeek: (time: number) => void
  className?: string
  /** Item ID for trickplay URL construction */
  itemId?: string
  /** Trickplay data from BaseItemDto.Trickplay */
  trickplay?: TrickplayData | null
}

// Stable selector to prevent re-renders - returns primitive reference
const selectVibrantColors = (s: SessionStore): VibrantColors | null =>
  s.vibrantColors

// Stable selectors for API store
const selectServerAddress = (s: { serverAddress: string }) => s.serverAddress
const selectApiKey = (s: { apiKey: string | undefined }) => s.apiKey

export function PlayerScrubber({
  currentTime,
  duration,
  buffered = 0,
  chapters,
  segments,
  onSeek,
  className,
  itemId,
  trickplay,
}: PlayerScrubberProps) {
  const vibrantColors = useSessionStore(selectVibrantColors)
  const serverAddress = useApiStore(selectServerAddress)
  const apiKey = useApiStore(selectApiKey)
  const scrubberRef = React.useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [hoverTime, setHoverTime] = React.useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = React.useState(0)
  const [hoveredChapter, setHoveredChapter] = React.useState<{
    name: string
    position: number
  } | null>(null)

  // Get best trickplay info
  const trickplayInfo = React.useMemo(
    () => getBestTrickplayInfo(trickplay),
    [trickplay],
  )

  // Calculate trickplay position for hover time
  const trickplayPosition = React.useMemo(() => {
    if (!trickplayInfo || !itemId || hoverTime === null) return null
    return getTrickplayPosition(
      hoverTime,
      trickplayInfo.info,
      itemId,
      trickplayInfo.mediaSourceId,
      serverAddress,
      apiKey,
    )
  }, [trickplayInfo, itemId, hoverTime, serverAddress, apiKey])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0

  const getTimeFromPosition = React.useCallback(
    (clientX: number): number => {
      const scrubber = scrubberRef.current
      if (!scrubber || duration <= 0) return 0
      const rect = scrubber.getBoundingClientRect()
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
      return (x / rect.width) * duration
    },
    [duration],
  )

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      setIsDragging(true)
      onSeek(getTimeFromPosition(e.clientX))
    },
    [getTimeFromPosition, onSeek],
  )

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const scrubber = scrubberRef.current
      if (!scrubber) return

      const rect = scrubber.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      setHoverTime(getTimeFromPosition(e.clientX))
      setHoverPosition(x)

      if (isDragging) onSeek(getTimeFromPosition(e.clientX))
    },
    [getTimeFromPosition, isDragging, onSeek],
  )

  const handlePointerUp = React.useCallback((e: React.PointerEvent) => {
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    setIsDragging(false)
  }, [])

  const handlePointerLeave = React.useCallback(() => {
    setHoverTime(null)
  }, [])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (duration <= 0) return

      const result = handleRangeKeyboard(e.key, e.shiftKey, {
        min: 0,
        max: duration,
        value: currentTime,
        stepFine: SCRUBBER_STEP_FINE,
        stepCoarse: SCRUBBER_STEP_COARSE,
      })

      if (result.handled) {
        e.preventDefault()
        onSeek(result.newValue)
      }
    },
    [currentTime, duration, onSeek],
  )

  // Memoize dynamic styles to prevent object recreation
  const trackStyle = React.useMemo(
    () =>
      vibrantColors
        ? { backgroundColor: vibrantColors.primary + '30' }
        : undefined,
    [vibrantColors],
  )

  const progressStyle = React.useMemo(
    () => ({
      width: `${progress}%`,
      backgroundColor: vibrantColors?.accent,
    }),
    [progress, vibrantColors?.accent],
  )

  const thumbStyle = React.useMemo(
    () => ({
      left: `${progress}%`,
      backgroundColor: vibrantColors?.accent,
      boxShadow: vibrantColors
        ? `0 0 0 2px ${vibrantColors.primary}40, 0 4px 6px -1px rgba(0, 0, 0, 0.1)`
        : undefined,
      transform: 'translate(-50%, -50%)',
    }),
    [progress, vibrantColors],
  )

  // Memoize buffered progress style
  const bufferedStyle = React.useMemo(
    () => ({ width: `${bufferedProgress}%` }),
    [bufferedProgress],
  )

  // Memoize hover indicator style
  const hoverIndicatorStyle = React.useMemo(
    () => ({ left: hoverPosition, transform: 'translateX(-50%)' }),
    [hoverPosition],
  )

  // Memoize chapter markers with position percentages
  const chapterMarkers = React.useMemo(() => {
    if (!chapters || chapters.length === 0 || duration <= 0) return []

    return chapters
      .map((chapter) => {
        const positionSeconds = ticksToSeconds(chapter.StartPositionTicks)
        const percentage = (positionSeconds / duration) * 100
        return {
          name: chapter.Name || '',
          position: percentage,
          time: positionSeconds,
        }
      })
      .filter((marker) => marker.position >= 0 && marker.position <= 100)
  }, [chapters, duration])

  // Memoize segment regions with position and width percentages
  // Note: editingSegments store StartTicks/EndTicks in SECONDS (not Jellyfin ticks)
  // because the SegmentSlider works with seconds for the UI
  const segmentRegions = React.useMemo(() => {
    if (!segments || segments.length === 0 || duration <= 0) return []

    return segments
      .map((segment) => {
        // StartTicks/EndTicks are already in seconds for editing segments
        const startSeconds = segment.StartTicks ?? 0
        const endSeconds = segment.EndTicks ?? 0
        const startPercent = (startSeconds / duration) * 100
        const endPercent = (endSeconds / duration) * 100
        const colorConfig = segment.Type
          ? SEGMENT_COLORS[segment.Type]
          : DEFAULT_SEGMENT_COLOR
        return {
          id: segment.Id,
          type: segment.Type,
          start: Math.max(0, startPercent),
          width: Math.min(100 - startPercent, endPercent - startPercent),
          color: colorConfig.css,
          startPercent,
        }
      })
      .filter(
        (region) =>
          region.width > 0.1 && // Only show segments wider than 0.1%
          region.startPercent < 100 && // Filter out segments starting beyond 100%
          region.start < 100, // Filter out segments entirely outside valid range
      )
  }, [segments, duration])

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="text-xs text-muted-foreground font-mono min-w-[var(--spacing-time-display)]">
        {formatTime(currentTime)}
      </span>

      <div
        ref={scrubberRef}
        className="relative flex-1 h-2 cursor-pointer group touch-none"
        style={{ contain: 'layout style' }}
        role="slider"
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        aria-orientation="horizontal"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
      >
        <div
          className={cn(
            'absolute inset-0 rounded-full overflow-hidden',
            !vibrantColors && 'bg-muted',
          )}
          style={trackStyle}
        >
          <div
            className="absolute inset-y-0 left-0 bg-muted-foreground/30 rounded-full"
            style={bufferedStyle}
          />

          {/* Segment regions */}
          {segmentRegions.map((region) => (
            <div
              key={region.id}
              className="absolute inset-y-0 opacity-70"
              style={{
                left: `${region.start}%`,
                width: `${region.width}%`,
                backgroundColor: region.color,
              }}
              title={region.type}
            />
          ))}

          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              !vibrantColors && 'bg-primary',
            )}
            style={progressStyle}
          />
        </div>

        {/* Chapter markers */}
        {chapterMarkers.map((marker, index) => (
          <div
            key={`chapter-${index}-${marker.position}`}
            className="absolute top-1/2 w-1 h-3 rounded-sm bg-white/80 shadow-sm pointer-events-auto cursor-pointer transition-all hover:h-4 hover:bg-white z-10"
            style={{
              left: `${marker.position}%`,
              transform: 'translate(-50%, -50%)',
            }}
            role="button"
            tabIndex={0}
            aria-label={marker.name || `Chapter ${index + 1}`}
            onPointerEnter={() => {
              setHoveredChapter({
                name: marker.name,
                position: marker.position,
              })
              setHoverTime(null)
            }}
            onPointerLeave={() => setHoveredChapter(null)}
            onClick={(e) => {
              e.stopPropagation()
              onSeek(marker.time)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onSeek(marker.time)
              }
            }}
            title={marker.name || `Chapter ${index + 1}`}
          />
        ))}

        {/* Chapter tooltip */}
        {hoveredChapter && (
          <div
            className="absolute -top-8 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap z-20"
            style={{
              left: `${hoveredChapter.position}%`,
              transform: 'translateX(-50%)',
            }}
          >
            {hoveredChapter.name}
          </div>
        )}

        <div
          className={cn(
            'absolute top-0 w-0.5 h-full bg-white/50 pointer-events-none transition-opacity',
            hoverTime !== null ? 'opacity-100' : 'opacity-0',
          )}
          style={hoverIndicatorStyle}
        />

        <div
          className={cn(
            'absolute top-1/2 w-4 h-4 rounded-full shadow-md transition-transform group-hover:scale-110',
            !vibrantColors && 'bg-primary',
          )}
          style={thumbStyle}
        />

        {hoverTime !== null && (
          <div
            className="absolute bottom-full mb-2 flex flex-col items-center pointer-events-none z-30"
            style={hoverIndicatorStyle}
          >
            {/* Trickplay thumbnail preview */}
            {trickplayPosition && (
              <TrickplayPreview position={trickplayPosition} />
            )}
            {/* Time label */}
            <div className="bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
              {formatTime(hoverTime)}
            </div>
          </div>
        )}
      </div>

      <span className="text-xs text-muted-foreground font-mono min-w-[var(--spacing-time-display)] text-right">
        {formatTime(duration)}
      </span>
    </div>
  )
}
