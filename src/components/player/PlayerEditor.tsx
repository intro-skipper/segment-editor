/**
 * PlayerEditor component.
 * Integrates Player with segment editing functionality.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardPaste, Loader2, Save } from 'lucide-react'

import { Player } from './Player'
import type {
  BaseItemDto,
  MediaSegmentDto,
  MediaSegmentType,
} from '@/types/jellyfin'
import type {
  CreateSegmentData,
  SegmentUpdate,
  TimestampUpdate,
} from '@/types/segment'
import type { SessionStore } from '@/stores/session-store'
import { useSegments } from '@/hooks/queries/use-segments'
import { useBatchSaveSegments } from '@/hooks/mutations/use-segment-mutations'
import { useAppStore } from '@/stores/app-store'
import { useSessionStore } from '@/stores/session-store'
import { ticksToSeconds } from '@/lib/time-utils'
import { generateUUID, sortSegmentsByStart } from '@/lib/segment-utils'
import {
  introSkipperClipboardTextToSegments,
  segmentsToIntroSkipperClipboardText,
} from '@/services/plugins/intro-skipper'
import { showNotification } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { useVibrantButtonStyle } from '@/hooks/use-vibrant-button-style'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { SegmentSlider } from '@/components/segment/SegmentSlider'
import { SegmentEditDialog } from '@/components/segment/SegmentEditDialog'
import { SegmentLoadingState } from '@/components/ui/async-state'

// Stable selectors to prevent re-renders - defined outside component
const selectVibrantColors = (state: SessionStore) => state.vibrantColors

export interface PlayerEditorProps {
  /** Media item to edit segments for */
  item: BaseItemDto
  /** Whether to fetch segments on mount */
  fetchSegments?: boolean
  /** Additional class names */
  className?: string
}

/**
 * PlayerEditor component.
 * Manages segment editing state and integrates with the Player component.
 */
export function PlayerEditor({
  item,
  fetchSegments = true,
  className,
}: PlayerEditorProps) {
  const { t } = useTranslation()
  const showVideoPlayer = useAppStore((state) => state.showVideoPlayer)

  // Use individual selectors instead of useShallow to avoid object creation
  const vibrantColors = useSessionStore(selectVibrantColors)
  const { getButtonStyle, iconColor, hasColors } =
    useVibrantButtonStyle(vibrantColors)
  const batchSaveMutation = useBatchSaveSegments()

  // Fetch segments from server
  const { data: serverSegments = [], isLoading: isLoadingSegments } =
    useSegments(item.Id ?? '', {
      enabled: fetchSegments && !!item.Id,
    })

  // Local editing state
  const [editingSegments, setEditingSegments] = React.useState<
    Array<MediaSegmentDto>
  >([])
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [playerTimestamp, setPlayerTimestamp] = React.useState<number>()
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingSegmentIndex, setEditingSegmentIndex] = React.useState<
    number | null
  >(null)

  // Ref to get current player time
  const getCurrentTimeRef = React.useRef<(() => number) | null>(null)

  // Import confirmation dialog state
  const [importDialogOpen, setImportDialogOpen] = React.useState(false)
  const pendingImportRef = React.useRef<{
    segments: Array<MediaSegmentDto>
    skipped: number
    unknownTypes: Array<string>
  } | null>(null)

  // Track previous server segments to detect changes
  // Use a ref to track the data identity, not the array reference
  const prevServerSegmentsRef = React.useRef<Array<MediaSegmentDto> | null>(
    null,
  )

  // Track if save is in progress to prevent concurrent operations
  const isSaving = batchSaveMutation.isPending

  // AbortController ref for cancelling in-flight save operations
  const saveAbortRef = React.useRef<AbortController | null>(null)

  // Keep a ref to the latest editing segments for async operations
  const editingSegmentsRef = React.useRef(editingSegments)
  React.useEffect(() => {
    editingSegmentsRef.current = editingSegments
  }, [editingSegments])
  const timestampTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(null)

  // Cleanup timeout and abort controller on unmount
  React.useEffect(
    () => () => {
      if (timestampTimeoutRef.current) clearTimeout(timestampTimeoutRef.current)
      saveAbortRef.current?.abort()
    },
    [],
  )

  const runtimeSeconds = React.useMemo(
    () => ticksToSeconds(item.RunTimeTicks) || 0,
    [item.RunTimeTicks],
  )

  // Sync editing segments from server when segment data changes
  // Compare by reference - React Query maintains stable references when data hasn't changed
  if (
    serverSegments !== prevServerSegmentsRef.current &&
    serverSegments.length > 0
  ) {
    prevServerSegmentsRef.current = serverSegments
    setEditingSegments([...serverSegments].sort(sortSegmentsByStart))
  }

  // Handle segment creation from player
  const handleCreateSegment = React.useCallback(
    (data: CreateSegmentData) => {
      const newSegment: MediaSegmentDto = {
        Id: generateUUID(),
        ItemId: item.Id,
        Type: data.type,
        StartTicks: data.start,
        EndTicks: data.end ?? data.start + 1,
      }

      setEditingSegments((prev) => {
        const updated = [...prev, newSegment].sort(sortSegmentsByStart)
        // Set active index to the new segment
        const newIndex = updated.findIndex((s) => s.Id === newSegment.Id)
        setActiveIndex(newIndex >= 0 ? newIndex : updated.length - 1)
        return updated
      })
    },
    [item.Id],
  )

  // Handle timestamp update from player
  const handleUpdateSegmentTimestamp = React.useCallback(
    (data: TimestampUpdate) => {
      setEditingSegments((prev) => {
        if (prev.length === 0) return prev

        // Use provided index or fall back to activeIndex
        const targetIndex = data.index ?? activeIndex
        const updated = [...prev]
        const segment = updated[targetIndex] as MediaSegmentDto | undefined
        if (segment === undefined) return prev

        if (data.start) {
          segment.StartTicks = data.currentTime
        } else {
          segment.EndTicks = data.currentTime
        }

        return updated.sort(sortSegmentsByStart)
      })
    },
    [activeIndex],
  )

  // Handle setting a segment's start time from current player position
  const handleSetStartFromPlayer = React.useCallback(
    (index: number) => {
      const currentTime = getCurrentTimeRef.current?.()
      if (currentTime === undefined) return
      handleUpdateSegmentTimestamp({ currentTime, start: true, index })
    },
    [handleUpdateSegmentTimestamp],
  )

  // Handle setting a segment's end time from current player position
  const handleSetEndFromPlayer = React.useCallback(
    (index: number) => {
      const currentTime = getCurrentTimeRef.current?.()
      if (currentTime === undefined) return
      handleUpdateSegmentTimestamp({ currentTime, start: false, index })
    },
    [handleUpdateSegmentTimestamp],
  )

  // Handle segment update from slider
  const handleUpdateSegment = React.useCallback((data: SegmentUpdate) => {
    setEditingSegments((prev) => {
      const updated = prev.map((seg) =>
        seg.Id === data.id
          ? { ...seg, StartTicks: data.start, EndTicks: data.end }
          : seg,
      )
      return updated.sort(sortSegmentsByStart)
    })
  }, [])

  // Handle segment deletion
  const handleDeleteSegment = React.useCallback((index: number) => {
    setEditingSegments((prev) => {
      const updated = [...prev]
      updated.splice(index, 1)
      // Update active index within the callback to use the new length
      setActiveIndex((prevIndex) =>
        Math.max(0, Math.min(prevIndex, updated.length - 1)),
      )
      return updated
    })
  }, [])

  // Handle player timestamp request (seek video to segment time)
  const handlePlayerTimestamp = React.useCallback((timestamp: number) => {
    if (timestampTimeoutRef.current) clearTimeout(timestampTimeoutRef.current)
    setPlayerTimestamp(timestamp)
    timestampTimeoutRef.current = setTimeout(
      () => setPlayerTimestamp(undefined),
      100,
    )
  }, [])

  // Open edit dialog for a segment
  const handleOpenEditDialog = React.useCallback((index: number) => {
    setEditingSegmentIndex(index)
    setEditDialogOpen(true)
  }, [])

  // Close edit dialog
  const handleCloseEditDialog = React.useCallback(() => {
    setEditDialogOpen(false)
    setEditingSegmentIndex(null)
  }, [])

  // Save segment from edit dialog
  const handleSaveSegmentFromDialog = React.useCallback(
    (updatedSegment: MediaSegmentDto) => {
      setEditingSegments((prev) => {
        const updated = prev.map((seg) =>
          seg.Id === updatedSegment.Id ? updatedSegment : seg,
        )
        return updated.sort(sortSegmentsByStart)
      })
    },
    [],
  )

  // Delete segment from edit dialog
  const handleDeleteSegmentFromDialog = React.useCallback(
    (segment: MediaSegmentDto) => {
      setEditingSegments((prev) => prev.filter((seg) => seg.Id !== segment.Id))
      setActiveIndex((prev) => Math.max(0, prev - 1))
    },
    [],
  )

  // Paste from clipboard with validation
  const handlePasteFromClipboard = React.useCallback(async () => {
    if (!item.Id) return

    try {
      const text = await navigator.clipboard.readText()
      const result = introSkipperClipboardTextToSegments(text, {
        itemId: item.Id,
        maxDurationSeconds: runtimeSeconds,
      })

      if (result.segments.length === 0) {
        showNotification({
          type: 'negative',
          message: result.error ?? t('editor.noSegmentInClipboard'),
        })
        return
      }

      // If there are existing segments, show confirmation dialog
      if (editingSegmentsRef.current.length > 0) {
        pendingImportRef.current = result
        setImportDialogOpen(true)
        return
      }

      // No existing segments, replace directly
      setEditingSegments(() => {
        const updated = [...result.segments].sort(sortSegmentsByStart)
        setActiveIndex(0)
        return updated
      })

      // Build informative notification message
      const infoParts: Array<string> = []
      if (result.skipped > 0) {
        infoParts.push(`${result.skipped} skipped`)
      }
      if (result.unknownTypes.length > 0) {
        infoParts.push(`unknown: ${result.unknownTypes.join(', ')}`)
      }
      const infoSuffix =
        infoParts.length > 0 ? ` (${infoParts.join('; ')})` : ''
      showNotification({
        type: 'positive',
        message: `Imported ${result.segments.length} segments${infoSuffix}`,
      })
    } catch {
      showNotification({
        type: 'negative',
        message: t('editor.noSegmentInClipboard', 'No segment in clipboard'),
      })
    }
  }, [item.Id, runtimeSeconds, t])

  // Save all segments with race condition prevention
  const handleSaveAll = React.useCallback(async () => {
    if (!item.Id || isSaving) return

    // Cancel any previous in-flight save
    saveAbortRef.current?.abort()
    const controller = new AbortController()
    saveAbortRef.current = controller

    // Use ref to get latest segments at the moment of save
    const currentSegments = editingSegmentsRef.current

    try {
      await batchSaveMutation.mutateAsync({
        itemId: item.Id,
        existingSegments: serverSegments,
        newSegments: currentSegments,
      })

      // Only show notification if not aborted
      if (!controller.signal.aborted) {
        showNotification({
          type: 'positive',
          message: t('editor.saveSegment'),
        })
      }
    } catch {
      // Error notification is handled by the mutation's onError handler
      // No additional notification needed here to avoid duplicate toasts
    }
  }, [item.Id, isSaving, serverSegments, batchSaveMutation, t])

  // Copy all segments to system clipboard as JSON
  const handleCopyAllAsJson = React.useCallback(async () => {
    const segmentsToCopy = editingSegmentsRef.current
    if (segmentsToCopy.length === 0) {
      showNotification({
        type: 'negative',
        message: t('editor.noSegments', 'No segments to copy'),
      })
      return
    }

    try {
      const result = segmentsToIntroSkipperClipboardText(segmentsToCopy)
      await navigator.clipboard.writeText(result.text)

      // Build informative notification message
      if (result.excludedCount > 0) {
        const excludedInfo = result.excludedTypes.join(', ')
        showNotification({
          type: 'positive',
          message: t(
            'editor.copyWithExcluded',
            `Copied all (${result.excludedCount} ${excludedInfo} excluded)`,
          ),
        })
      } else {
        showNotification({
          type: 'positive',
          message: t('editor.copiedAllAsJson', 'Copied all segments as JSON'),
        })
      }
    } catch {
      showNotification({
        type: 'negative',
        message: t('editor.copyFailed', 'Clipboard access denied'),
      })
    }
  }, [t])

  // Handle import confirmation: replace all segments
  const handleImportReplace = React.useCallback(() => {
    const pending = pendingImportRef.current
    if (!pending) return

    setEditingSegments(() => {
      const updated = [...pending.segments].sort(sortSegmentsByStart)
      setActiveIndex(0)
      return updated
    })

    const infoParts: Array<string> = []
    if (pending.skipped > 0) {
      infoParts.push(`${pending.skipped} skipped`)
    }
    if (pending.unknownTypes.length > 0) {
      infoParts.push(`unknown: ${pending.unknownTypes.join(', ')}`)
    }
    const infoSuffix = infoParts.length > 0 ? ` (${infoParts.join('; ')})` : ''
    showNotification({
      type: 'positive',
      message: `Replaced with ${pending.segments.length} segments${infoSuffix}`,
    })

    pendingImportRef.current = null
    setImportDialogOpen(false)
  }, [])

  // Handle import confirmation: merge with existing segments
  const handleImportMerge = React.useCallback(() => {
    const pending = pendingImportRef.current
    if (!pending) return

    setEditingSegments((prev) => {
      const merged = [...prev, ...pending.segments].sort(sortSegmentsByStart)
      return merged
    })

    const infoParts: Array<string> = []
    if (pending.skipped > 0) {
      infoParts.push(`${pending.skipped} skipped`)
    }
    if (pending.unknownTypes.length > 0) {
      infoParts.push(`unknown: ${pending.unknownTypes.join(', ')}`)
    }
    const infoSuffix = infoParts.length > 0 ? ` (${infoParts.join('; ')})` : ''
    showNotification({
      type: 'positive',
      message: `Added ${pending.segments.length} segments${infoSuffix}`,
    })

    pendingImportRef.current = null
    setImportDialogOpen(false)
  }, [])

  // Handle import dialog cancel
  const handleImportCancel = React.useCallback(() => {
    pendingImportRef.current = null
    setImportDialogOpen(false)
  }, [])

  return (
    <div className={cn('flex flex-col gap-6 max-w-6xl mx-auto', className)}>
      {/* Player */}
      {showVideoPlayer && (
        <Player
          item={item}
          timestamp={playerTimestamp}
          onCreateSegment={handleCreateSegment}
          onUpdateSegmentTimestamp={handleUpdateSegmentTimestamp}
          getCurrentTimeRef={getCurrentTimeRef}
        />
      )}

      {/* Segment creation button when player is hidden */}
      {!showVideoPlayer && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() =>
              handleCreateSegment({
                type: 'Intro' as MediaSegmentType,
                start: 0,
              })
            }
          >
            {t('editor.newSegment')}
          </Button>
        </div>
      )}

      {/* Segments list */}
      <div className="space-y-4">
        {isLoadingSegments ? (
          <SegmentLoadingState count={2} />
        ) : editingSegments.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {t('editor.noSegments')}
          </p>
        ) : (
          <div className="space-y-3">
            {editingSegments.map((segment, index) => (
              <div
                key={segment.Id}
                onDoubleClick={() => handleOpenEditDialog(index)}
              >
                <SegmentSlider
                  segment={segment}
                  index={index}
                  activeIndex={activeIndex}
                  runtimeSeconds={runtimeSeconds}
                  onUpdate={handleUpdateSegment}
                  onDelete={handleDeleteSegment}
                  onPlayerTimestamp={handlePlayerTimestamp}
                  onSetActive={setActiveIndex}
                  onSetStartFromPlayer={
                    showVideoPlayer ? handleSetStartFromPlayer : undefined
                  }
                  onSetEndFromPlayer={
                    showVideoPlayer ? handleSetEndFromPlayer : undefined
                  }
                  onCopyAllAsJson={handleCopyAllAsJson}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Segment Edit Dialog */}
      {editingSegmentIndex !== null && editingSegments[editingSegmentIndex] && (
        <SegmentEditDialog
          open={editDialogOpen}
          segment={editingSegments[editingSegmentIndex]}
          onClose={handleCloseEditDialog}
          onSave={handleSaveSegmentFromDialog}
          onDelete={handleDeleteSegmentFromDialog}
        />
      )}

      {/* Import Confirmation Dialog */}
      <AlertDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('editor.importTitle', 'Import Segments')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'editor.importDescription',
                `You have ${editingSegments.length} existing segments. Would you like to replace them or merge with the imported segments?`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleImportCancel}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={handleImportMerge}>
              {t('editor.importMerge', 'Merge')}
            </AlertDialogAction>
            <AlertDialogAction onClick={handleImportReplace}>
              {t('editor.importReplace', 'Replace')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        className="flex flex-row justify-center gap-4"
        role="group"
        aria-label={t('editor.actions', 'Segment actions')}
      >
        <button
          onClick={handlePasteFromClipboard}
          aria-label={t('editor.paste', 'Paste segment from clipboard')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full text-base font-semibold',
            'sm:flex-none sm:px-10 sm:py-4 sm:text-lg sm:min-w-[var(--spacing-button-min)]',
            'transition-all duration-200 ease-out border-2',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            !hasColors &&
              'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground border-transparent',
          )}
          style={getButtonStyle(false)}
        >
          <ClipboardPaste
            className="size-4 sm:size-5"
            aria-hidden="true"
            style={iconColor ? { color: iconColor } : undefined}
          />
          {t('editor.paste', 'Paste')}
        </button>
        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          aria-label={t('editor.saveSegment', 'Save all segments')}
          aria-busy={isSaving}
          aria-live="polite"
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full text-base font-semibold',
            'sm:flex-none sm:px-10 sm:py-4 sm:text-lg sm:min-w-[var(--spacing-button-min)]',
            'transition-all duration-200 ease-out border-2',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            !hasColors &&
              'bg-primary/20 text-primary border-primary/40 hover:bg-primary/30',
          )}
          style={getButtonStyle(true)}
        >
          {isSaving ? (
            <Loader2
              className="size-4 sm:size-5 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Save className="size-4 sm:size-5" aria-hidden="true" />
          )}
          {isSaving && <span className="sr-only">Saving segments</span>}
          {t('editor.saveSegment')}
        </button>
      </div>
    </div>
  )
}
