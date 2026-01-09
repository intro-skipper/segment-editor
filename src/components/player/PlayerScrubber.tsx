/**
 * PlayerScrubber component.
 * Timeline scrubber for video playback with seek functionality.
 * Supports mouse, touch, and keyboard interactions.
 */

import * as React from 'react'

import type { VibrantColors } from '@/hooks/use-vibrant-color'
import type { SessionStore } from '@/stores/session-store'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/time-utils'
import { useSessionStore } from '@/stores/session-store'
import { handleRangeKeyboard } from '@/lib/keyboard-utils'

/** Step sizes for scrubber keyboard navigation */
const SCRUBBER_STEP_FINE = 5
const SCRUBBER_STEP_COARSE = 10

export interface PlayerScrubberProps {
  currentTime: number
  duration: number
  buffered?: number
  onSeek: (time: number) => void
  className?: string
}

// Stable selector to prevent re-renders - returns primitive reference
const selectVibrantColors = (s: SessionStore): VibrantColors | null =>
  s.vibrantColors

export function PlayerScrubber({
  currentTime,
  duration,
  buffered = 0,
  onSeek,
  className,
}: PlayerScrubberProps) {
  const vibrantColors = useSessionStore(selectVibrantColors)
  const scrubberRef = React.useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [hoverTime, setHoverTime] = React.useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = React.useState(0)

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
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              !vibrantColors && 'bg-primary',
            )}
            style={progressStyle}
          />
        </div>

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
            className="absolute -top-8 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg pointer-events-none"
            style={hoverIndicatorStyle}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      <span className="text-xs text-muted-foreground font-mono min-w-[var(--spacing-time-display)] text-right">
        {formatTime(duration)}
      </span>
    </div>
  )
}
