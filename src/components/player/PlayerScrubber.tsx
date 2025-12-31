/**
 * PlayerScrubber component.
 * Timeline scrubber for video playback with seek functionality.
 * Requirements: 3.5
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/time-utils'

export interface PlayerScrubberProps {
  /** Current playback time in seconds */
  currentTime: number
  /** Total duration in seconds */
  duration: number
  /** Buffered time in seconds */
  buffered?: number
  /** Callback when user seeks to a new time */
  onSeek: (time: number) => void
  /** Additional class names */
  className?: string
}

/**
 * Timeline scrubber component for video playback.
 * Displays current time, allows seeking via click/drag.
 */
export function PlayerScrubber({
  currentTime,
  duration,
  buffered = 0,
  onSeek,
  className,
}: PlayerScrubberProps) {
  const scrubberRef = React.useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [hoverTime, setHoverTime] = React.useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = React.useState(0)

  // Refs for stable callback references
  const durationRef = React.useRef(duration)
  const onSeekRef = React.useRef(onSeek)
  const isDraggingRef = React.useRef(isDragging)

  React.useEffect(() => {
    durationRef.current = duration
  }, [duration])
  React.useEffect(() => {
    onSeekRef.current = onSeek
  }, [onSeek])
  React.useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  // Calculate progress percentages
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0

  // Calculate time from mouse position - stable reference
  const getTimeFromPosition = React.useCallback((clientX: number): number => {
    if (!scrubberRef.current || durationRef.current <= 0) return 0

    const rect = scrubberRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const percentage = x / rect.width
    return percentage * durationRef.current
  }, [])

  // Handle mouse down - start dragging
  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const time = getTimeFromPosition(e.clientX)
      onSeekRef.current(time)
    },
    [getTimeFromPosition],
  )

  // Handle mouse move - update hover preview and drag
  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent) => {
      if (!scrubberRef.current) return

      const rect = scrubberRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      const time = getTimeFromPosition(e.clientX)

      setHoverTime(time)
      setHoverPosition(x)

      if (isDraggingRef.current) {
        onSeekRef.current(time)
      }
    },
    [getTimeFromPosition],
  )

  // Handle mouse leave - clear hover state
  const handleMouseLeave = React.useCallback(() => {
    setHoverTime(null)
  }, [])

  // Global mouse up handler for drag end - stable reference
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false)
    }

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        const time = getTimeFromPosition(e.clientX)
        onSeekRef.current(time)
      }
    }

    if (isDragging) {
      document.addEventListener('mouseup', handleGlobalMouseUp)
      document.addEventListener('mousemove', handleGlobalMouseMove)
    }

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp)
      document.removeEventListener('mousemove', handleGlobalMouseMove)
    }
  }, [isDragging, getTimeFromPosition])

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Current time display */}
      <span className="text-xs text-muted-foreground font-mono min-w-[70px]">
        {formatTime(currentTime)}
      </span>

      {/* Scrubber track */}
      <div
        ref={scrubberRef}
        className="relative flex-1 h-2 cursor-pointer group"
        role="slider"
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 5
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            onSeek(Math.max(0, currentTime - step))
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            onSeek(Math.min(duration, currentTime + step))
          } else if (e.key === 'Home') {
            e.preventDefault()
            onSeek(0)
          } else if (e.key === 'End') {
            e.preventDefault()
            onSeek(duration)
          }
        }}
      >
        {/* Background track */}
        <div className="absolute inset-0 bg-muted rounded-full overflow-hidden">
          {/* Buffered progress */}
          <div
            className="absolute inset-y-0 left-0 bg-muted-foreground/30 rounded-full transition-transform"
            style={{ width: `${bufferedProgress}%` }}
          />
          {/* Playback progress */}
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full transition-transform"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Hover indicator */}
        <div
          className={cn(
            'absolute top-0 w-0.5 h-full bg-white/50 pointer-events-none transition-opacity',
            hoverTime !== null ? 'opacity-100' : 'opacity-0',
          )}
          style={{ left: `${hoverPosition}px`, transform: 'translateX(-50%)' }}
        />

        {/* Playback head */}
        <div
          className="absolute top-1/2 w-4 h-4 bg-primary rounded-full shadow-md transition-transform group-hover:scale-110"
          style={{
            left: `${progress}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Hover time tooltip */}
        {hoverTime !== null && (
          <div
            className="absolute -top-8 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg pointer-events-none"
            style={{
              left: `${hoverPosition}px`,
              transform: 'translateX(-50%)',
            }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* Duration display */}
      <span className="text-xs text-muted-foreground font-mono min-w-[70px] text-right">
        {formatTime(duration)}
      </span>
    </div>
  )
}
