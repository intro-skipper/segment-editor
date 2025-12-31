/**
 * SegmentSlider component.
 * Interactive timeline control for adjusting segment start/end times.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, GripVertical, Play, Trash2 } from 'lucide-react'

import type { BaseItemDto, MediaSegmentDto } from '@/types/jellyfin'
import type { SegmentUpdate } from '@/types/segment'
import { formatTime } from '@/lib/time-utils'
import {
  getSegmentColor,
  getSegmentCssVar,
  validateSegment,
} from '@/lib/segment-utils'
import { useSessionStore } from '@/stores/session-store'
import { showNotification } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export interface SegmentSliderProps {
  /** The segment to display and edit */
  segment: MediaSegmentDto
  /** The media item this segment belongs to */
  item: BaseItemDto
  /** Index of this segment in the list */
  index: number
  /** Currently active segment index */
  activeIndex: number
  /** Total runtime of the media in seconds */
  runtimeSeconds: number
  /** Callback when segment boundaries are updated */
  onUpdate: (data: SegmentUpdate) => void
  /** Callback when segment is deleted */
  onDelete: (index: number) => void
  /** Callback to seek player to a timestamp */
  onPlayerTimestamp: (timestamp: number) => void
  /** Callback to set this segment as active */
  onSetActive: (index: number) => void
}

/**
 * SegmentSlider component.
 * Displays a segment with dual-handle range slider and numeric inputs.
 */
export function SegmentSlider({
  segment,
  item: _item, // Reserved for future use (e.g., item-specific validation)
  index,
  activeIndex,
  runtimeSeconds,
  onUpdate,
  onDelete,
  onPlayerTimestamp,
  onSetActive,
}: SegmentSliderProps) {
  // _item is available for future item-specific features
  void _item
  const { t } = useTranslation()
  const { saveToClipboard } = useSessionStore()
  const sliderRef = React.useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = React.useState<'start' | 'end' | null>(
    null,
  )
  const [localStart, setLocalStart] = React.useState(segment.StartTicks ?? 0)
  const [localEnd, setLocalEnd] = React.useState(segment.EndTicks ?? 0)

  // Refs for values needed in pointer handlers without causing re-renders
  const localStartRef = React.useRef(localStart)
  const localEndRef = React.useRef(localEnd)
  const isDraggingRef = React.useRef(isDragging)

  React.useEffect(() => {
    localStartRef.current = localStart
  }, [localStart])
  React.useEffect(() => {
    localEndRef.current = localEnd
  }, [localEnd])
  React.useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  const isActive = index === activeIndex
  const segmentColor = getSegmentColor(segment.Type)
  const segmentCssVar = getSegmentCssVar(segment.Type)

  // Sync local state with prop changes
  React.useEffect(() => {
    setLocalStart(segment.StartTicks ?? 0)
    setLocalEnd(segment.EndTicks ?? 0)
  }, [segment.StartTicks, segment.EndTicks])

  // Calculate positions as percentages
  const startPercent =
    runtimeSeconds > 0 ? (localStart / runtimeSeconds) * 100 : 0
  const endPercent =
    runtimeSeconds > 0 ? (localEnd / runtimeSeconds) * 100 : 100
  const widthPercent = endPercent - startPercent

  // Duration in seconds
  const duration = localEnd - localStart

  // Validation
  const validation = validateSegment({
    ...segment,
    StartTicks: localStart,
    EndTicks: localEnd,
  })

  // Handle mouse/touch events for dragging - stable handler factory
  const handlePointerDown = React.useMemo(
    () => (handle: 'start' | 'end') => (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(handle)
      onSetActive(index)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [index, onSetActive],
  )

  // Pointer move uses refs to avoid recreating on every local state change
  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const dragging = isDraggingRef.current
      if (!dragging || !sliderRef.current) return

      const rect = sliderRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
      const newTime = (percent / 100) * runtimeSeconds

      if (dragging === 'start') {
        const maxStart = localEndRef.current - 0.1
        const clampedStart = Math.min(newTime, maxStart)
        setLocalStart(Math.max(0, clampedStart))
      } else {
        const minEnd = localStartRef.current + 0.1
        const clampedEnd = Math.max(newTime, minEnd)
        setLocalEnd(Math.min(runtimeSeconds, clampedEnd))
      }
    },
    [runtimeSeconds],
  )

  const handlePointerUp = React.useCallback(
    (e: React.PointerEvent) => {
      const dragging = isDraggingRef.current
      if (!dragging) return
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      setIsDragging(null)

      // Emit update using refs for current values
      if (segment.Id) {
        onUpdate({
          id: segment.Id,
          start: localStartRef.current,
          end: localEndRef.current,
        })
      }
    },
    [segment.Id, onUpdate],
  )

  // Handle numeric input changes
  const handleStartInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value)
      if (!isNaN(value) && value >= 0 && value < localEnd) {
        setLocalStart(value)
      }
    },
    [localEnd],
  )

  const handleEndInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value)
      if (!isNaN(value) && value > localStart && value <= runtimeSeconds) {
        setLocalEnd(value)
      }
    },
    [localStart, runtimeSeconds],
  )

  const handleInputBlur = React.useCallback(() => {
    if (segment.Id && validation.valid) {
      onUpdate({
        id: segment.Id,
        start: localStart,
        end: localEnd,
      })
    }
  }, [segment.Id, localStart, localEnd, validation.valid, onUpdate])

  // Copy to clipboard
  const handleCopy = React.useCallback(() => {
    saveToClipboard(segment)
    showNotification({
      type: 'positive',
      message: t('editor.segmentCopiedToClipboard'),
    })
  }, [segment, saveToClipboard, t])

  // Delete segment
  const handleDelete = React.useCallback(() => {
    onDelete(index)
  }, [index, onDelete])

  // Seek to start
  const handleSeekStart = React.useCallback(() => {
    onPlayerTimestamp(localStart)
  }, [localStart, onPlayerTimestamp])

  // Seek to end
  const handleSeekEnd = React.useCallback(() => {
    onPlayerTimestamp(localEnd)
  }, [localEnd, onPlayerTimestamp])

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all',
        isActive
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-primary/50',
      )}
      onClick={() => onSetActive(index)}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GripVertical className="size-4 text-muted-foreground cursor-grab" />
          <Badge
            variant="outline"
            className={cn('text-white border-0', segmentColor)}
          >
            {segment.Type}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {t('segment.duration')}: {formatTime(duration)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            title={t('editor.segmentCopiedToClipboard')}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Slider track */}
      <div
        ref={sliderRef}
        className="relative h-10 sm:h-8 bg-muted rounded-md cursor-pointer mb-3 touch-none"
        role="slider"
        aria-label={`${segment.Type} segment from ${formatTime(localStart)} to ${formatTime(localEnd)}`}
        aria-valuemin={0}
        aria-valuemax={runtimeSeconds}
        aria-valuenow={localStart}
        aria-valuetext={`Start: ${formatTime(localStart)}, End: ${formatTime(localEnd)}`}
        tabIndex={0}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Segment range visualization */}
        <div
          className="absolute top-0 h-full rounded-md opacity-60"
          style={{
            left: `${startPercent}%`,
            width: `${widthPercent}%`,
            backgroundColor: segmentCssVar,
          }}
        />

        {/* Start handle */}
        <div
          className={cn(
            'absolute top-0 h-full w-4 sm:w-3 cursor-ew-resize rounded-l-md transition-colors',
            isDragging === 'start'
              ? 'bg-primary'
              : 'bg-primary/80 hover:bg-primary',
          )}
          style={{ left: `calc(${startPercent}% - 8px)` }}
          role="slider"
          aria-label={`${segment.Type} segment start handle`}
          aria-valuemin={0}
          aria-valuemax={localEnd - 0.1}
          aria-valuenow={localStart}
          aria-valuetext={formatTime(localStart)}
          tabIndex={0}
          onPointerDown={handlePointerDown('start')}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              const newStart = Math.max(0, localStart - 0.1)
              setLocalStart(newStart)
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              const newStart = Math.min(localEnd - 0.1, localStart + 0.1)
              setLocalStart(newStart)
            }
          }}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/50" />
        </div>

        {/* End handle */}
        <div
          className={cn(
            'absolute top-0 h-full w-4 sm:w-3 cursor-ew-resize rounded-r-md transition-colors',
            isDragging === 'end'
              ? 'bg-primary'
              : 'bg-primary/80 hover:bg-primary',
          )}
          style={{ left: `calc(${endPercent}% - 8px)` }}
          role="slider"
          aria-label={`${segment.Type} segment end handle`}
          aria-valuemin={localStart + 0.1}
          aria-valuemax={runtimeSeconds}
          aria-valuenow={localEnd}
          aria-valuetext={formatTime(localEnd)}
          tabIndex={0}
          onPointerDown={handlePointerDown('end')}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              const newEnd = Math.max(localStart + 0.1, localEnd - 0.1)
              setLocalEnd(newEnd)
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              const newEnd = Math.min(runtimeSeconds, localEnd + 0.1)
              setLocalEnd(newEnd)
            }
          }}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/50" />
        </div>
      </div>

      {/* Time inputs row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        {/* Start time */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSeekStart}
            title="Seek to start"
            className="shrink-0"
          >
            <Play className="size-3" />
          </Button>
          <label className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
            {t('segment.start')}:
          </label>
          <Input
            type="number"
            step="0.001"
            min="0"
            max={localEnd - 0.001}
            value={localStart.toFixed(3)}
            onChange={handleStartInputChange}
            onBlur={handleInputBlur}
            className="w-full sm:w-28 h-8 text-sm font-mono"
          />
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
            {formatTime(localStart)}
          </span>
        </div>

        {/* End time */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSeekEnd}
            title="Seek to end"
            className="shrink-0"
          >
            <Play className="size-3" />
          </Button>
          <label className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
            {t('segment.end')}:
          </label>
          <Input
            type="number"
            step="0.001"
            min={localStart + 0.001}
            max={runtimeSeconds}
            value={localEnd.toFixed(3)}
            onChange={handleEndInputChange}
            onBlur={handleInputBlur}
            className="w-full sm:w-28 h-8 text-sm font-mono"
          />
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
            {formatTime(localEnd)}
          </span>
        </div>
      </div>

      {/* Validation error */}
      {!validation.valid && (
        <p className="text-sm text-destructive mt-2">
          {validation.error ?? t('validation.StartEnd')}
        </p>
      )}
    </div>
  )
}
