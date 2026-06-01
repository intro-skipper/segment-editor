import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { ChapterInfo, MediaSegmentDto } from '@/types/jellyfin'
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

const SCRUBBER_STEP_FINE = 5
const SCRUBBER_STEP_COARSE = 10
const HOVER_TIME_EPSILON_SECONDS = 0.05
const HOVER_POSITION_EPSILON_PX = 1

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function TrickplayPreview({ position }: { position: TrickplayPosition }) {
  return (
    <div
      className="rounded overflow-hidden shadow-lg mb-1 bg-neutral-950"
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

interface ChapterMarker {
  name: string
  position: number
  time: number
}

interface SegmentRegion {
  id: MediaSegmentDto['Id']
  type: MediaSegmentDto['Type']
  start: number
  width: number
  color: string
}

function getChapterMarkers(
  chapters: Array<ChapterInfo> | null | undefined,
  duration: number,
): Array<ChapterMarker> {
  if (!chapters || chapters.length === 0 || duration <= 0) return []

  const markers: Array<ChapterMarker> = []
  for (const chapter of chapters) {
    const positionSeconds = ticksToSeconds(chapter.StartPositionTicks)
    const percentage = (positionSeconds / duration) * 100
    if (percentage >= 0 && percentage <= 100) {
      markers.push({
        name: chapter.Name || '',
        position: percentage,
        time: positionSeconds,
      })
    }
  }
  return markers
}

function getSegmentRegions(
  segments: Array<MediaSegmentDto> | undefined,
  duration: number,
): Array<SegmentRegion> {
  if (!segments || segments.length === 0 || duration <= 0) return []

  const regions: Array<SegmentRegion> = []
  for (const segment of segments) {
    const startSeconds = segment.StartTicks ?? 0
    const startPercent = (startSeconds / duration) * 100
    if (startPercent >= 100) continue
    const endSeconds = segment.EndTicks ?? 0
    const endPercent = (endSeconds / duration) * 100
    const clampedStart = Math.max(0, startPercent)
    const clampedEnd = Math.min(100, endPercent)
    const width = Math.max(0, clampedEnd - clampedStart)
    if (width <= 0.1) continue
    const colorConfig = segment.Type
      ? SEGMENT_COLORS[segment.Type]
      : DEFAULT_SEGMENT_COLOR
    regions.push({
      id: segment.Id,
      type: segment.Type,
      start: clampedStart,
      width,
      color: colorConfig.css,
    })
  }
  return regions
}

function ScrubberTrack({
  vibrantColors,
  trackStyle,
  bufferedStyle,
  progressStyle,
  segmentRegions,
}: {
  vibrantColors: VibrantColors | null
  trackStyle: React.CSSProperties | undefined
  bufferedStyle: React.CSSProperties
  progressStyle: React.CSSProperties
  segmentRegions: Array<SegmentRegion>
}) {
  return (
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
  )
}

function ScrubberChapterMarkers({
  markers,
  onHover,
  onLeave,
  onSeek,
}: {
  markers: Array<ChapterMarker>
  onHover: (marker: ChapterMarker) => void
  onLeave: () => void
  onSeek: (time: number) => void
}) {
  return (
    <>
      {markers.map((marker, index) => (
        <button
          key={`chapter-${marker.time}-${marker.position}-${marker.name}`}
          type="button"
          className="absolute top-1/2 w-1 h-3 rounded-sm bg-white/80 shadow-sm pointer-events-auto cursor-pointer transition-[height,background-color] hover:h-4 hover:bg-white z-10"
          style={{
            left: `${marker.position}%`,
            transform: 'translate(-50%, -50%)',
          }}
          aria-label={marker.name || `Chapter ${index + 1}`}
          onPointerEnter={() => onHover(marker)}
          onPointerLeave={onLeave}
          onClick={(e) => {
            e.stopPropagation()
            onSeek(marker.time)
          }}
          title={marker.name || `Chapter ${index + 1}`}
        />
      ))}
    </>
  )
}

function ChapterTooltip({
  chapter,
}: {
  chapter: { name: string; position: number } | null
}) {
  if (!chapter) return null
  return (
    <div
      className="absolute -top-8 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap z-20"
      style={{
        left: `${chapter.position}%`,
        transform: 'translateX(-50%)',
      }}
    >
      {chapter.name}
    </div>
  )
}

function HoverTimePreview({
  hoverTime,
  hoverIndicatorStyle,
  trickplayPosition,
}: {
  hoverTime: number | null
  hoverIndicatorStyle: React.CSSProperties
  trickplayPosition: TrickplayPosition | null
}) {
  if (hoverTime === null) return null
  return (
    <div
      className="absolute bottom-full mb-2 flex flex-col items-center pointer-events-none z-30"
      style={hoverIndicatorStyle}
    >
      {trickplayPosition && <TrickplayPreview position={trickplayPosition} />}
      <div className="bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
        {formatTime(hoverTime)}
      </div>
    </div>
  )
}

function ScrubberThumb({
  vibrantColors,
  thumbStyle,
}: {
  vibrantColors: VibrantColors | null
  thumbStyle: React.CSSProperties
}) {
  return (
    <div
      className={cn(
        'absolute top-1/2 w-4 h-4 rounded-full shadow-md transition-transform group-hover:scale-110',
        !vibrantColors && 'bg-primary',
      )}
      style={thumbStyle}
    />
  )
}

function useScrubberInteraction({
  safeDuration,
  safeCurrentTime,
  onSeek,
  setHoverTime,
  setHoverPosition,
}: {
  safeDuration: number
  safeCurrentTime: number
  onSeek: (time: number) => void
  setHoverTime: React.Dispatch<React.SetStateAction<number | null>>
  setHoverPosition: React.Dispatch<React.SetStateAction<number>>
}) {
  const scrubberRef = React.useRef<HTMLDivElement>(null)
  const isDraggingRef = React.useRef(false)
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

  const refreshScrubberRect = () => {
    const scrubber = scrubberRef.current
    if (!scrubber) {
      scrubberRectRef.current = null
      return null
    }

    const rect = scrubber.getBoundingClientRect()
    scrubberRectRef.current = rect
    return rect
  }

  const getPositionFromClientX = (
    clientX: number,
  ): { time: number; position: number } => {
    if (safeDuration <= 0) {
      return { time: 0, position: 0 }
    }

    const rect = scrubberRectRef.current ?? refreshScrubberRect()
    if (!rect || rect.width <= 0) {
      return { time: 0, position: 0 }
    }

    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const time = (x / rect.width) * safeDuration
    return { time, position: x }
  }

  const scheduleSeek = (time: number) => {
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
  }

  const scheduleHoverUpdate = (time: number, position: number) => {
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
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    refreshScrubberRect()
    isDraggingRef.current = true
    const { time } = getPositionFromClientX(e.clientX)
    scheduleSeek(time)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const { time, position } = getPositionFromClientX(e.clientX)
    scheduleHoverUpdate(time, position)

    if (isDraggingRef.current) {
      scheduleSeek(time)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    isDraggingRef.current = false
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
  }

  const handlePointerLeave = () => {
    scrubberRectRef.current = null
    if (hoverFrameRef.current !== null) {
      cancelAnimationFrame(hoverFrameRef.current)
      hoverFrameRef.current = null
    }
    pendingHoverRef.current = null
    lastHoverTimeRef.current = null
    lastHoverPositionRef.current = null
    setHoverTime(null)
  }

  React.useEffect(() => {
    const scrubber = scrubberRef.current
    if (!scrubber) return

    const handler = () => {
      scrubberRectRef.current = null
    }

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handler) : null

    resizeObserver?.observe(scrubber)
    window.addEventListener('scroll', handler, { passive: true })

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', handler)
    }
  }, [])

  React.useEffect(() => {
    const seekFrame = seekFrameRef
    const hoverFrame = hoverFrameRef
    return () => {
      if (seekFrame.current !== null) {
        cancelAnimationFrame(seekFrame.current)
      }
      if (hoverFrame.current !== null) {
        cancelAnimationFrame(hoverFrame.current)
      }
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (safeDuration <= 0) return

    const result = handleRangeKeyboard(e.key, e.shiftKey, {
      min: 0,
      max: safeDuration,
      value: safeCurrentTime,
      stepFine: SCRUBBER_STEP_FINE,
      stepCoarse: SCRUBBER_STEP_COARSE,
    })

    if (result.handled) {
      e.preventDefault()
      onSeek(result.newValue)
    }
  }

  return {
    scrubberRef,
    refreshScrubberRect,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handleKeyDown,
  }
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

const selectServerAddress = (s: { serverAddress: string }) => s.serverAddress
const selectApiKey = (s: { apiKey: string | undefined }) => s.apiKey

export function PlayerScrubber({
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
  const [hoverTime, setHoverTime] = React.useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = React.useState(0)
  const [hoveredChapter, setHoveredChapter] = React.useState<{
    name: string
    position: number
  } | null>(null)

  const trickplayInfo = getBestTrickplayInfo(trickplay)

  const previewTime = hoverTime === null ? null : Math.round(hoverTime * 4) / 4

  const trickplayPosition = (() => {
    if (!trickplayInfo || !itemId || previewTime === null) return null
    return getTrickplayPosition(
      previewTime,
      trickplayInfo.info,
      itemId,
      trickplayInfo.mediaSourceId,
      serverAddress,
      apiKey,
    )
  })()

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const safeCurrentTime = Number.isFinite(currentTime)
    ? clamp(currentTime, 0, safeDuration)
    : 0
  const safeBuffered = Number.isFinite(buffered)
    ? clamp(buffered, 0, safeDuration)
    : 0
  const rangeMax = Math.round(safeDuration)
  const rangeValue = clamp(Math.round(safeCurrentTime), 0, rangeMax)

  const progress = safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0
  const bufferedProgress =
    safeDuration > 0 ? (safeBuffered / safeDuration) * 100 : 0

  const {
    scrubberRef,
    refreshScrubberRect,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handleKeyDown,
  } = useScrubberInteraction({
    safeDuration,
    safeCurrentTime,
    onSeek,
    setHoverTime,
    setHoverPosition,
  })

  const handleChapterHover = (marker: ChapterMarker) => {
    setHoveredChapter({ name: marker.name, position: marker.position })
    setHoverTime(null)
  }

  const trackStyle = vibrantColors
    ? { backgroundColor: vibrantColors.primary + '30' }
    : undefined

  const progressStyle = {
    width: `${progress}%`,
    backgroundColor: vibrantColors?.accent,
  }

  const thumbStyle = {
    left: `${progress}%`,
    backgroundColor: vibrantColors?.accent,
    boxShadow: vibrantColors
      ? `0 0 0 2px ${vibrantColors.primary}40, 0 4px 6px -1px rgba(0, 0, 0, 0.1)`
      : undefined,
    transform: 'translate(-50%, -50%)',
  }

  const bufferedStyle = { width: `${bufferedProgress}%` }

  const hoverIndicatorStyle = {
    left: hoverPosition,
    transform: 'translateX(-50%)',
  }

  const chapterMarkers = getChapterMarkers(chapters, safeDuration)
  // Note: editingSegments store StartTicks/EndTicks in SECONDS (not Jellyfin ticks)
  // because the SegmentSlider works with seconds for the UI.
  const segmentRegions = getSegmentRegions(segments, safeDuration)

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="text-xs text-muted-foreground font-mono min-w-[var(--spacing-time-display)]">
        {formatTime(safeCurrentTime)}
      </span>

      <div
        ref={scrubberRef}
        className="relative flex-1 h-2 cursor-pointer group touch-none"
        style={{ contain: 'layout style', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerEnter={refreshScrubberRect}
      >
        <input
          type="range"
          min={0}
          max={rangeMax}
          value={rangeValue}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
          onKeyDown={handleKeyDown}
          className="sr-only"
          aria-label={t('accessibility.player.videoProgress', 'Video progress')}
          aria-valuetext={`${formatTime(safeCurrentTime)} of ${formatTime(safeDuration)}`}
        />
        <ScrubberTrack
          vibrantColors={vibrantColors}
          trackStyle={trackStyle}
          bufferedStyle={bufferedStyle}
          progressStyle={progressStyle}
          segmentRegions={segmentRegions}
        />

        <ScrubberChapterMarkers
          markers={chapterMarkers}
          onHover={handleChapterHover}
          onLeave={() => setHoveredChapter(null)}
          onSeek={onSeek}
        />

        <ChapterTooltip chapter={hoveredChapter} />

        <div
          className={cn(
            'absolute top-0 w-0.5 h-full bg-white/50 pointer-events-none transition-opacity',
            hoverTime !== null ? 'opacity-100' : 'opacity-0',
          )}
          style={hoverIndicatorStyle}
        />

        <ScrubberThumb vibrantColors={vibrantColors} thumbStyle={thumbStyle} />

        <HoverTimePreview
          hoverTime={hoverTime}
          hoverIndicatorStyle={hoverIndicatorStyle}
          trickplayPosition={trickplayPosition}
        />
      </div>

      <span className="text-xs text-muted-foreground font-mono min-w-[var(--spacing-time-display)] text-right">
        {formatTime(safeDuration)}
      </span>
    </div>
  )
}
