/**
 * PlayerScrubber component.
 * Timeline scrubber for video playback with seek functionality.
 * Supports mouse, touch, and keyboard interactions.
 * Includes trickplay preview thumbnails on hover.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { ChapterInfo } from '@jellyfin/sdk/lib/generated-client/models'

import type { MediaSegmentDto } from '@/types/jellyfin'
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import type { TrickplayData, TrickplayPosition } from '@/lib/trickplay-utils'
import { cn } from '@/lib/utils'
import { formatTime, ticksToSeconds } from '@/lib/time-utils'
import { handleRangeKeyboard } from '@/lib/range-keyboard'
import { DEFAULT_SEGMENT_COLOR, SEGMENT_COLORS } from '@/lib/constants'
import {
  getBestTrickplayInfo,
  getTrickplayPosition,
} from '@/lib/trickplay-utils'
import { useApiStore } from '@/stores/api-store'

/** Step sizes for scrubber keyboard navigation */
const SCRUBBER_STEP_FINE = 5
const SCRUBBER_STEP_COARSE = 10
const HOVER_TIME_EPSILON_SECONDS = 0.05
const HOVER_POSITION_EPSILON_PX = 1

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

interface PlayerScrubberProps {
  currentTime: number
  duration: number
  buffered?: number
  chapters?: Array<ChapterInfo> | null
  segments?: Array<MediaSegmentDto>
  vibrantColors: VibrantColors | null
  onSeek: (time: number) => void
  className?: string
  /** Item ID for trickplay URL construction */
  itemId?: string
  /** Trickplay data from BaseItemDto.Trickplay */
  trickplay?: TrickplayData | null
}

// Stable selectors for API store
const selectServerAddress = (s: { serverAddress: string }) => s.serverAddress
const selectApiKey = (s: { apiKey: string | undefined }) => s.apiKey

export const PlayerScrubber = React.memo(function PlayerScrubberComponent({
  currentTime,
  duration,
  buffered = 0,
  chapters,
  segments,
  vibrantColors,
  onSeek,
  className,
  itemId,
  trickplay,
}: PlayerScrubberProps) {
  const { t } = useTranslation()
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
  const seekFrameRef = React.useRef<number | null>(null)
  const pendingSeekTimeRef = React.useRef<number | null>(null)
  const hoverFrameRef = React.useRef<number | null>(null)
  const scrubberRectRef = React.useRef<DOMRect | null>(null)
  const pendingHoverRef = React.useRef<{
    time: number
    position: number
  } | null>(null)
  const lastHoverTimeRef = React.useRef<number | null>(null)
  const lastHoverPositionRef = React.useRef<number | null>(null)

  // Get best trickplay info
  const trickplayInfo = React.useMemo(
    () => getBestTrickplayInfo(trickplay),
    [trickplay],
  )

  const previewTime = React.useMemo(
    () => (hoverTime === null ? null : Math.round(hoverTime * 4) / 4),
    [hoverTime],
  )

  // Calculate trickplay position for hover time
  const trickplayPosition = React.useMemo(() => {
    if (!trickplayInfo || !itemId || previewTime === null) return null
    return getTrickplayPosition(
      previewTime,
      trickplayInfo.info,
      itemId,
      trickplayInfo.mediaSourceId,
      serverAddress,
      apiKey,
    )
  }, [trickplayInfo, itemId, previewTime, serverAddress, apiKey])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0

  const refreshScrubberRect = React.useCallback(() => {
    const scrubber = scrubberRef.current
    if (!scrubber) {
      scrubberRectRef.current = null
      return null
    }

    const rect = scrubber.getBoundingClientRect()
    scrubberRectRef.current = rect
    return rect
  }, [])

  const invalidateScrubberRect = React.useCallback(() => {
    scrubberRectRef.current = null
  }, [])

  const getPositionFromClientX = React.useCallback(
    (clientX: number): { time: number; position: number } => {
      if (duration <= 0) {
        return { time: 0, position: 0 }
      }

      const rect = scrubberRectRef.current ?? refreshScrubberRect()
      if (!rect || rect.width <= 0) {
        return { time: 0, position: 0 }
      }

      const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
      const time = (x / rect.width) * duration
      return { time, position: x }
    },
    [duration, refreshScrubberRect],
  )

  const scheduleSeek = React.useCallback(
    (time: number) => {
      pendingSeekTimeRef.current = time
      if (seekFrameRef.current !== null) return

      seekFrameRef.current = requestAnimationFrame(() => {
        seekFrameRef.current = null
        const nextTime = pendingSeekTimeRef.current
        if (nextTime !== null) {
          onSeek(nextTime)
          pendingSeekTimeRef.current = null
        }
      })
    },
    [onSeek],
  )

  const scheduleHoverUpdate = React.useCallback(
    (time: number, position: number) => {
      pendingHoverRef.current = { time, position }
      if (hoverFrameRef.current !== null) return

      hoverFrameRef.current = requestAnimationFrame(() => {
        hoverFrameRef.current = null
        const next = pendingHoverRef.current
        if (!next) return

        const shouldUpdateTime =
          lastHoverTimeRef.current === null ||
          Math.abs(next.time - lastHoverTimeRef.current) >=
            HOVER_TIME_EPSILON_SECONDS
        const shouldUpdatePosition =
          lastHoverPositionRef.current === null ||
          Math.abs(next.position - lastHoverPositionRef.current) >=
            HOVER_POSITION_EPSILON_PX

        if (shouldUpdateTime) {
          lastHoverTimeRef.current = next.time
          setHoverTime(next.time)
        }

        if (shouldUpdatePosition) {
          lastHoverPositionRef.current = next.position
          setHoverPosition(next.position)
        }
      })
    },
    [],
  )

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      refreshScrubberRect()
      setIsDragging(true)
      const { time } = getPositionFromClientX(e.clientX)
      scheduleSeek(time)
    },
    [getPositionFromClientX, refreshScrubberRect, scheduleSeek],
  )

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const { time, position } = getPositionFromClientX(e.clientX)
      scheduleHoverUpdate(time, position)

      if (isDragging) {
        scheduleSeek(time)
      }
    },
    [getPositionFromClientX, isDragging, scheduleSeek, scheduleHoverUpdate],
  )

  const handlePointerUp = React.useCallback(
    (e: React.PointerEvent) => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      setIsDragging(false)
      scrubberRectRef.current = null

      if (seekFrameRef.current !== null) {
        cancelAnimationFrame(seekFrameRef.current)
        seekFrameRef.current = null
      }

      const finalTime = pendingSeekTimeRef.current
      if (finalTime !== null) {
        onSeek(finalTime)
        pendingSeekTimeRef.current = null
      }
    },
    [onSeek],
  )

  const handlePointerLeave = React.useCallback(() => {
    scrubberRectRef.current = null
    if (hoverFrameRef.current !== null) {
      cancelAnimationFrame(hoverFrameRef.current)
      hoverFrameRef.current = null
    }
    pendingHoverRef.current = null
    lastHoverTimeRef.current = null
    lastHoverPositionRef.current = null
    setHoverTime(null)
  }, [])

  React.useEffect(() => {
    const scrubber = scrubberRef.current
    if (!scrubber) return

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(invalidateScrubberRect)
        : null

    resizeObserver?.observe(scrubber)
    window.addEventListener('scroll', invalidateScrubberRect, { passive: true })

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', invalidateScrubberRect)
    }
  }, [invalidateScrubberRect])

  React.useEffect(() => {
    return () => {
      if (seekFrameRef.current !== null) {
        cancelAnimationFrame(seekFrameRef.current)
      }
      if (hoverFrameRef.current !== null) {
        cancelAnimationFrame(hoverFrameRef.current)
      }
    }
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
      .filter((segment) => {
        const startSeconds = segment.StartTicks ?? 0
        const startPercent = (startSeconds / duration) * 100
        return startPercent < 100 // Filter out segments starting beyond 100%
      })
      .map((segment) => {
        // StartTicks/EndTicks are already in seconds for editing segments
        const startSeconds = segment.StartTicks ?? 0
        const endSeconds = segment.EndTicks ?? 0
        const startPercent = (startSeconds / duration) * 100
        const endPercent = (endSeconds / duration) * 100
        const clampedStart = Math.max(0, startPercent)
        const clampedEnd = Math.min(100, endPercent)
        const width = Math.max(0, clampedEnd - clampedStart)
        const colorConfig = segment.Type
          ? SEGMENT_COLORS[segment.Type]
          : DEFAULT_SEGMENT_COLOR
        return {
          id: segment.Id,
          type: segment.Type,
          start: clampedStart,
          width,
          color: colorConfig.css,
        }
      })
      .filter((region) => region.width > 0.1) // Only show segments wider than 0.1%
  }, [segments, duration])

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="text-xs text-muted-foreground font-mono min-w-[var(--spacing-time-display)]">
        {formatTime(currentTime)}
      </span>

      <div
        ref={scrubberRef}
        className="relative flex-1 h-2 cursor-pointer group touch-none"
        style={{ contain: 'layout style', touchAction: 'none' }}
        role="slider"
        aria-label={t('accessibility.player.videoProgress', 'Video progress')}
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
        onPointerEnter={refreshScrubberRect}
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
          <button
            key={`chapter-${marker.time}-${marker.position}-${marker.name}`}
            type="button"
            className="absolute top-1/2 w-1 h-3 rounded-sm bg-white/80 shadow-sm pointer-events-auto cursor-pointer transition-[height,background-color] hover:h-4 hover:bg-white z-10"
            style={{
              left: `${marker.position}%`,
              transform: 'translate(-50%, -50%)',
            }}
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
})
