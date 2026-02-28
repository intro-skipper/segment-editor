/**
 * SegmentSlider component.
 * Interactive timeline control for adjusting segment start/end times.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Copy,
  Crosshair,
  GripVertical,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'

import type { MediaSegmentDto } from '@/types/jellyfin'
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import type { SegmentUpdate } from '@/types/segment'
import { formatTime, snapToFrame } from '@/lib/time-utils'
import {
  getSegmentColor,
  getSegmentCssVar,
  validateSegment,
} from '@/lib/segment-utils'
import { segmentsToIntroSkipperClipboardText } from '@/services/plugins/intro-skipper'
import { showNotification } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SEGMENT_CONFIG } from '@/lib/constants'
import {
  handleEndHandleKeyboard,
  handleStartHandleKeyboard,
} from '@/lib/range-keyboard'

const { MIN_SEGMENT_GAP } = SEGMENT_CONFIG

/** Handle width in pixels for positioning calculations */
const HANDLE_WIDTH = 14

/** Keep numeric input readable while preserving millisecond precision */
const TIME_INPUT_DECIMALS = 3

function formatInputSeconds(value: number): string {
  return value.toFixed(TIME_INPUT_DECIMALS).replace(/\.?0+$/, '')
}

function clampStartToBounds(start: number, end: number): number {
  return Math.max(0, Math.min(start, end - MIN_SEGMENT_GAP))
}

function clampEndToBounds(end: number, start: number, runtime: number): number {
  return Math.min(runtime, Math.max(end, start + MIN_SEGMENT_GAP))
}

function snapAndClampStart(
  value: number,
  end: number,
  frameStep: number | undefined,
): number {
  return clampStartToBounds(snapToFrame(value, frameStep), end)
}

function snapAndClampEnd(
  value: number,
  start: number,
  runtime: number,
  frameStep: number | undefined,
): number {
  return clampEndToBounds(snapToFrame(value, frameStep), start, runtime)
}

interface SegmentSliderProps {
  /** The segment to display and edit */
  segment: MediaSegmentDto
  /** Index of this segment in the list */
  index: number
  /** Whether this segment is currently active */
  isActive: boolean
  /** Total runtime of the media in seconds */
  runtimeSeconds: number
  /** Optional frame-based input step in seconds (e.g. 1001/24000) */
  frameStepSeconds?: number
  /** Callback when segment boundaries are updated */
  onUpdate: (data: SegmentUpdate) => void
  /** Callback when segment is deleted */
  onDelete: (index: number) => void
  /** Callback to seek player to a timestamp */
  onPlayerTimestamp: (timestamp: number) => void
  /** Callback to set this segment as active */
  onSetActive: (index: number) => void
  /** Callback to set this segment's start time from current player position */
  onSetStartFromPlayer?: (index: number) => void
  /** Callback to set this segment's end time from current player position */
  onSetEndFromPlayer?: (index: number) => void
  /** Callback to copy all segments to system clipboard as JSON */
  onCopyAllAsJson?: () => void
  /** Callback to open the segment edit dialog */
  onEdit?: (index: number) => void
  /** Vibrant theme colors derived from the current item artwork */
  vibrantColors: VibrantColors | null
}

/**
 * SegmentSlider component.
 * Displays a segment with dual-handle range slider and numeric inputs.
 */
export const SegmentSlider = React.memo(function SegmentSliderComponent({
  segment,
  index,
  isActive,
  runtimeSeconds,
  frameStepSeconds,
  onUpdate,
  onDelete,
  onPlayerTimestamp,
  onSetActive,
  onSetStartFromPlayer,
  onSetEndFromPlayer,
  onCopyAllAsJson,
  onEdit,
  vibrantColors,
}: SegmentSliderProps) {
  const { t } = useTranslation()
  const sliderRef = React.useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = React.useState<'start' | 'end' | null>(
    null,
  )
  // Local edits are applied immediately; external prop updates are synced
  // back in when the user is not actively dragging or typing.
  const [localRange, setLocalRange] = React.useState(() => ({
    start: segment.StartTicks ?? 0,
    end: segment.EndTicks ?? 0,
  }))
  const [copyMenuOpen, setCopyMenuOpen] = React.useState(false)
  const [activeInput, setActiveInput] = React.useState<'start' | 'end' | null>(
    null,
  )
  const [timeInputDraft, setTimeInputDraft] = React.useState<{
    start?: string
    end?: string
  }>({})
  const localStart = localRange.start
  const localEnd = localRange.end

  const localStartRef = React.useRef(localStart)
  const localEndRef = React.useRef(localEnd)
  const isDraggingRef = React.useRef(isDragging)
  const pointerCaptureTargetRef = React.useRef<HTMLElement | null>(null)
  const pointerIdRef = React.useRef<number | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const pendingPositionRef = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    localStartRef.current = localStart
    localEndRef.current = localEnd
    isDraggingRef.current = isDragging
  }, [localStart, localEnd, isDragging])

  React.useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  React.useLayoutEffect(() => {
    if (isDragging || activeInput !== null) return

    const nextStart = segment.StartTicks ?? 0
    const nextEnd = segment.EndTicks ?? 0

    setLocalRange((current) =>
      current.start === nextStart && current.end === nextEnd
        ? current
        : { start: nextStart, end: nextEnd },
    )
  }, [
    segment.Id,
    segment.StartTicks,
    segment.EndTicks,
    isDragging,
    activeInput,
  ])

  const segmentColor = getSegmentColor(segment.Type)
  const segmentCssVar = getSegmentCssVar(segment.Type)

  const validation = React.useMemo(
    () =>
      validateSegment({
        ...segment,
        StartTicks: localStart,
        EndTicks: localEnd,
      }),
    [segment, localStart, localEnd],
  )

  const segmentStyles = React.useMemo(() => {
    const startPercent =
      runtimeSeconds > 0 ? (localStart / runtimeSeconds) * 100 : 0
    const endPercent =
      runtimeSeconds > 0 ? (localEnd / runtimeSeconds) * 100 : 100
    return {
      startPercent,
      endPercent,
      widthPercent: endPercent - startPercent,
    }
  }, [localStart, localEnd, runtimeSeconds])

  const { startPercent, endPercent, widthPercent } = segmentStyles

  const duration = localEnd - localStart

  const frameStep =
    typeof frameStepSeconds === 'number' &&
    Number.isFinite(frameStepSeconds) &&
    frameStepSeconds > 0
      ? frameStepSeconds
      : undefined

  const inputStep = frameStep ?? MIN_SEGMENT_GAP

  const startInputValue =
    activeInput === 'start'
      ? (timeInputDraft.start ?? formatInputSeconds(localStart))
      : formatInputSeconds(localStart)
  const endInputValue =
    activeInput === 'end'
      ? (timeInputDraft.end ?? formatInputSeconds(localEnd))
      : formatInputSeconds(localEnd)

  const commitSegmentUpdate = React.useCallback(
    (start: number, end: number) => {
      if (!segment.Id) return

      const currentStart = segment.StartTicks ?? 0
      const currentEnd = segment.EndTicks ?? 0
      if (start === currentStart && end === currentEnd) return

      const nextValidation = validateSegment({
        ...segment,
        StartTicks: start,
        EndTicks: end,
      })
      if (!nextValidation.valid) return

      onUpdate({ id: segment.Id, start, end })
    },
    [segment, onUpdate],
  )

  const handlePointerDown = React.useCallback(
    (handle: 'start' | 'end') => (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(handle)
      onSetActive(index)

      const captureTarget = e.currentTarget as HTMLElement
      captureTarget.setPointerCapture(e.pointerId)
      pointerCaptureTargetRef.current = captureTarget
      pointerIdRef.current = e.pointerId
    },
    [index, onSetActive],
  )

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const dragging = isDraggingRef.current
      if (!dragging || !sliderRef.current) return

      const rect = sliderRef.current.getBoundingClientRect()
      const percent = Math.max(
        0,
        Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
      )
      const newTime = (percent / 100) * runtimeSeconds

      pendingPositionRef.current = newTime

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const pendingTime = pendingPositionRef.current
          if (pendingTime === null) return

          const currentDragging = isDraggingRef.current
          if (currentDragging === 'start') {
            setLocalRange((current) => ({
              ...current,
              start: clampStartToBounds(pendingTime, localEndRef.current),
            }))
          } else if (currentDragging === 'end') {
            setLocalRange((current) => ({
              ...current,
              end: clampEndToBounds(
                pendingTime,
                localStartRef.current,
                runtimeSeconds,
              ),
            }))
          }
        })
      }
    },
    [runtimeSeconds],
  )

  const handlePointerUp = React.useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      const pendingTime = pendingPositionRef.current
      if (pendingTime !== null) {
        const currentDragging = isDraggingRef.current
        if (currentDragging === 'start') {
          const newStart = snapAndClampStart(
            pendingTime,
            localEndRef.current,
            frameStep,
          )
          localStartRef.current = newStart
          setLocalRange((current) => ({ ...current, start: newStart }))
        } else {
          const newEnd = snapAndClampEnd(
            pendingTime,
            localStartRef.current,
            runtimeSeconds,
            frameStep,
          )
          localEndRef.current = newEnd
          setLocalRange((current) => ({ ...current, end: newEnd }))
        }
        pendingPositionRef.current = null
      }

      const captureTarget = pointerCaptureTargetRef.current
      const pointerId = pointerIdRef.current ?? e.pointerId
      if (captureTarget && captureTarget.hasPointerCapture(pointerId)) {
        captureTarget.releasePointerCapture(pointerId)
      }
      pointerCaptureTargetRef.current = null
      pointerIdRef.current = null

      setIsDragging(null)
      commitSegmentUpdate(localStartRef.current, localEndRef.current)
    },
    [runtimeSeconds, frameStep, commitSegmentUpdate],
  )

  const handleInputChange = React.useCallback(
    (type: 'start' | 'end') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value
      setTimeInputDraft((current) => ({ ...current, [type]: rawValue }))

      if (!rawValue.trim()) return

      const value = Number(rawValue)
      if (!Number.isFinite(value) || value < 0) return

      if (type === 'start') {
        setLocalRange((current) => ({
          ...current,
          start: clampStartToBounds(value, current.end),
        }))
      } else {
        setLocalRange((current) => ({
          ...current,
          end: clampEndToBounds(value, current.start, runtimeSeconds),
        }))
      }
    },
    [runtimeSeconds],
  )

  const handleInputBlur = React.useCallback(
    (type: 'start' | 'end') => {
      let nextStart = localStart
      let nextEnd = localEnd

      if (type === 'start') {
        nextStart = snapAndClampStart(localStart, localEnd, frameStep)
        setLocalRange((current) => ({ ...current, start: nextStart }))
      } else {
        nextEnd = snapAndClampEnd(
          localEnd,
          localStart,
          runtimeSeconds,
          frameStep,
        )
        setLocalRange((current) => ({ ...current, end: nextEnd }))
      }

      setActiveInput(null)
      setTimeInputDraft((current) => {
        const next = { ...current }
        delete next[type]
        return next
      })

      commitSegmentUpdate(nextStart, nextEnd)
    },
    [localStart, localEnd, runtimeSeconds, frameStep, commitSegmentUpdate],
  )

  // Copy segment to system clipboard as JSON
  const handleCopy = React.useCallback(async () => {
    setCopyMenuOpen(false)
    try {
      const result = segmentsToIntroSkipperClipboardText([segment])
      await navigator.clipboard.writeText(result.text)
      showNotification({
        type: 'positive',
        message: t('editor.segmentCopiedToClipboard'),
      })
    } catch {
      showNotification({
        type: 'negative',
        message: t('editor.copyFailed', 'Clipboard access denied'),
      })
    }
  }, [segment, t])

  // Copy all segments to system clipboard as JSON
  const handleCopyAllAsJson = React.useCallback(() => {
    setCopyMenuOpen(false)
    onCopyAllAsJson?.()
  }, [onCopyAllAsJson])

  const handleDelete = React.useCallback(
    () => onDelete(index),
    [index, onDelete],
  )
  const handleSeekStart = React.useCallback(
    () => onPlayerTimestamp(localStart),
    [localStart, onPlayerTimestamp],
  )
  const handleSeekEnd = React.useCallback(
    () => onPlayerTimestamp(localEnd),
    [localEnd, onPlayerTimestamp],
  )

  // Set timestamp from current player position
  const handleSetStartFromPlayer = React.useCallback(
    () => onSetStartFromPlayer?.(index),
    [index, onSetStartFromPlayer],
  )
  const handleSetEndFromPlayer = React.useCallback(
    () => onSetEndFromPlayer?.(index),
    [index, onSetEndFromPlayer],
  )

  const handleHandleBlur = React.useCallback(
    (type: 'start' | 'end') => {
      if (type === 'start') {
        const snappedStart = snapAndClampStart(localStart, localEnd, frameStep)
        setLocalRange((current) => ({ ...current, start: snappedStart }))
        commitSegmentUpdate(snappedStart, localEnd)
        return
      }

      const snappedEnd = snapAndClampEnd(
        localEnd,
        localStart,
        runtimeSeconds,
        frameStep,
      )
      setLocalRange((current) => ({ ...current, end: snappedEnd }))
      commitSegmentUpdate(localStart, snappedEnd)
    },
    [localStart, localEnd, runtimeSeconds, frameStep, commitSegmentUpdate],
  )

  const handleStartKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      const result = handleStartHandleKeyboard(
        e.key,
        e.shiftKey,
        localStart,
        localEnd,
        MIN_SEGMENT_GAP,
      )
      if (result.handled) {
        e.preventDefault()
        setLocalRange((current) => ({
          ...current,
          start: snapAndClampStart(result.newValue, current.end, frameStep),
        }))
      }
    },
    [localStart, localEnd, frameStep],
  )

  const handleEndKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      const result = handleEndHandleKeyboard(
        e.key,
        e.shiftKey,
        localStart,
        localEnd,
        runtimeSeconds,
        MIN_SEGMENT_GAP,
      )
      if (result.handled) {
        e.preventDefault()
        setLocalRange((current) => ({
          ...current,
          end: snapAndClampEnd(
            result.newValue,
            current.start,
            runtimeSeconds,
            frameStep,
          ),
        }))
      }
    },
    [localStart, localEnd, runtimeSeconds, frameStep],
  )

  // Memoize style objects to prevent re-renders
  const containerStyle = React.useMemo(
    () =>
      vibrantColors
        ? {
            borderColor: isActive
              ? vibrantColors.primary
              : vibrantColors.primary + '30',
            boxShadow: isActive
              ? `0 8px 32px ${vibrantColors.primary}15`
              : undefined,
          }
        : undefined,
    [vibrantColors, isActive],
  )

  const iconStyle = React.useMemo(
    () => (vibrantColors ? { color: vibrantColors.primary } : undefined),
    [vibrantColors],
  )

  // Memoize slider handle styles
  const segmentRangeStyle = React.useMemo(
    () => ({
      left: `${startPercent}%`,
      width: `${widthPercent}%`,
      backgroundColor: segmentCssVar,
      opacity: 0.7,
    }),
    [startPercent, widthPercent, segmentCssVar],
  )

  const startHandleStyle = React.useMemo(
    () => ({
      left: `calc(${startPercent}% - ${HANDLE_WIDTH / 2}px)`,
      backgroundColor: segmentCssVar,
    }),
    [startPercent, segmentCssVar],
  )

  const endHandleStyle = React.useMemo(
    () => ({
      left: `calc(${endPercent}% - ${HANDLE_WIDTH / 2}px)`,
      backgroundColor: segmentCssVar,
    }),
    [endPercent, segmentCssVar],
  )

  const handleSetActiveClick = React.useCallback(
    () => onSetActive(index),
    [onSetActive, index],
  )

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-card/50 backdrop-blur-sm p-4 transition-[transform,box-shadow,background-color,border-color] duration-200',
        isActive
          ? 'border-primary/60 bg-primary/5 shadow-lg shadow-primary/10'
          : 'border-border/50 hover:border-primary/30 hover:bg-card/80',
      )}
      style={containerStyle}
      onPointerDownCapture={handleSetActiveClick}
      onFocusCapture={handleSetActiveClick}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <GripVertical
            className="size-4 text-muted-foreground/50 cursor-grab hidden sm:block sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
          />
          <Badge
            variant="outline"
            className={cn(
              'text-white border-0 font-medium px-3 py-1 shadow-sm',
              segmentColor,
            )}
          >
            {segment.Type}
          </Badge>
          <span className="text-sm text-muted-foreground font-medium tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {/* Copy dropdown menu */}
          <DropdownMenu open={copyMenuOpen} onOpenChange={setCopyMenuOpen}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('accessibility.copySegment')}
                  className="hover:bg-primary/10"
                />
              }
            >
              <Copy className="size-4" aria-hidden="true" style={iconStyle} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopy}>
                {t('editor.copy', 'Copy')}
              </DropdownMenuItem>
              {onCopyAllAsJson && (
                <DropdownMenuItem onClick={handleCopyAllAsJson}>
                  {t('editor.copyAll', 'Copy all')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {onEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(index)}
              aria-label={t('segment.edit')}
              className="hover:bg-primary/10"
            >
              <Pencil className="size-4" aria-hidden="true" style={iconStyle} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDelete}
            aria-label={t('accessibility.deleteSegment')}
            className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Slider track - with proper overflow handling */}
      <div
        ref={sliderRef}
        className="relative h-10 bg-muted/50 rounded-lg cursor-pointer mb-4 touch-none overflow-hidden"
        style={{ padding: `0 ${HANDLE_WIDTH / 2}px` }}
        role="group"
        aria-label={t('segment.sliderGroup', { type: segment.Type })}
        aria-describedby={`segment-${segment.Id}-description`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span id={`segment-${segment.Id}-description`} className="sr-only">
          {t('segment.sliderDescription', {
            type: segment.Type,
            start: formatTime(localStart),
            end: formatTime(localEnd),
            duration: formatTime(duration),
          })}
        </span>

        {/* Inner track container for proper handle positioning */}
        <div className="relative h-full w-full">
          {/* Segment range visualization */}
          <div
            className="absolute top-1 bottom-1 rounded-md transition-[left,width,background-color,opacity] duration-75"
            style={segmentRangeStyle}
          />

          {/* Start handle */}
          <div
            className={cn(
              'segment-handle absolute top-0 bottom-0 w-3.5 cursor-ew-resize z-10',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'flex items-center justify-center',
            )}
            style={startHandleStyle}
            role="slider"
            aria-label={t('segment.startHandle', { type: segment.Type })}
            aria-valuemin={0}
            aria-valuemax={localEnd - MIN_SEGMENT_GAP}
            aria-valuenow={localStart}
            aria-valuetext={formatTime(localStart)}
            aria-orientation="horizontal"
            tabIndex={0}
            onPointerDown={handlePointerDown('start')}
            onKeyDown={handleStartKeyDown}
            onBlur={() => handleHandleBlur('start')}
          >
            <div className="w-0.5 h-4 bg-white/60 rounded-full" />
          </div>

          {/* End handle */}
          <div
            className={cn(
              'segment-handle absolute top-0 bottom-0 w-3.5 cursor-ew-resize z-10',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'flex items-center justify-center',
            )}
            style={endHandleStyle}
            role="slider"
            aria-label={t('segment.endHandle', { type: segment.Type })}
            aria-valuemin={localStart + MIN_SEGMENT_GAP}
            aria-valuemax={runtimeSeconds}
            aria-valuenow={localEnd}
            aria-valuetext={formatTime(localEnd)}
            aria-orientation="horizontal"
            tabIndex={0}
            onPointerDown={handlePointerDown('end')}
            onKeyDown={handleEndKeyDown}
            onBlur={() => handleHandleBlur('end')}
          >
            <div className="w-0.5 h-4 bg-white/60 rounded-full" />
          </div>
        </div>
      </div>

      {/* Time inputs row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-6">
        {/* Start time */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSeekStart}
            aria-label={t('accessibility.seekToStart')}
            title={t('accessibility.seekToStart')}
            className="shrink-0 hover:bg-primary/10"
          >
            <Play className="size-3" aria-hidden="true" style={iconStyle} />
          </Button>
          {onSetStartFromPlayer && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleSetStartFromPlayer}
              aria-label={t('editor.setStartTime', 'Set start from player')}
              title={`${t('editor.setStartTime', 'Set start from player')} (E)`}
              className="shrink-0 hover:bg-primary/10"
            >
              <Crosshair
                className="size-3"
                aria-hidden="true"
                style={iconStyle}
              />
            </Button>
          )}
          <label
            htmlFor={`segment-${segment.Id}-start`}
            className="text-sm text-muted-foreground whitespace-nowrap shrink-0"
          >
            {t('segment.start')}:
          </label>
          <Input
            id={`segment-${segment.Id}-start`}
            type="number"
            step={inputStep}
            min="0"
            max={Math.max(0, localEnd - MIN_SEGMENT_GAP)}
            value={startInputValue}
            onFocus={() => setActiveInput('start')}
            onChange={handleInputChange('start')}
            onBlur={() => handleInputBlur('start')}
            className="w-full sm:w-28 h-8 text-sm font-mono bg-background/50"
            aria-describedby={`segment-${segment.Id}-start-formatted`}
          />
          <span
            id={`segment-${segment.Id}-start-formatted`}
            className="text-xs text-muted-foreground shrink-0 hidden sm:inline tabular-nums"
          >
            {formatTime(localStart)}
          </span>
        </div>

        {/* End time */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSeekEnd}
            aria-label={t('accessibility.seekToEnd')}
            title={t('accessibility.seekToEnd')}
            className="shrink-0 hover:bg-primary/10"
          >
            <Play className="size-3" aria-hidden="true" style={iconStyle} />
          </Button>
          {onSetEndFromPlayer && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleSetEndFromPlayer}
              aria-label={t('editor.setEndTime', 'Set end from player')}
              title={`${t('editor.setEndTime', 'Set end from player')} (F)`}
              className="shrink-0 hover:bg-primary/10"
            >
              <Crosshair
                className="size-3"
                aria-hidden="true"
                style={iconStyle}
              />
            </Button>
          )}
          <label
            htmlFor={`segment-${segment.Id}-end`}
            className="text-sm text-muted-foreground whitespace-nowrap shrink-0"
          >
            {t('segment.end')}:
          </label>
          <Input
            id={`segment-${segment.Id}-end`}
            type="number"
            step={inputStep}
            min={localStart + MIN_SEGMENT_GAP}
            max={runtimeSeconds}
            value={endInputValue}
            onFocus={() => setActiveInput('end')}
            onChange={handleInputChange('end')}
            onBlur={() => handleInputBlur('end')}
            className="w-full sm:w-28 h-8 text-sm font-mono bg-background/50"
            aria-describedby={`segment-${segment.Id}-end-formatted`}
          />
          <span
            id={`segment-${segment.Id}-end-formatted`}
            className="text-xs text-muted-foreground shrink-0 hidden sm:inline tabular-nums"
          >
            {formatTime(localEnd)}
          </span>
        </div>
      </div>

      {/* Validation error */}
      {!validation.valid && (
        <p
          className="text-sm text-destructive mt-3 flex items-center gap-2"
          role="alert"
        >
          <span className="size-1.5 rounded-full bg-destructive" />
          {validation.error ?? t('validation.StartEnd')}
        </p>
      )}
    </div>
  )
})
