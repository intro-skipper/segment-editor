import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys'
import { useBlocker } from '@tanstack/react-router'
import { ClipboardPaste, Eye, Loader2, Plus, Save, Undo2 } from 'lucide-react'

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
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import { useSegments } from '@/services/segments/queries'
import { useBatchSaveSegments } from '@/services/segments/mutations'
import { useAppStore } from '@/stores/app-store'
import { snapToFrame, ticksToSeconds } from '@/lib/time-utils'
import { resolveFrameStepSeconds } from '@/lib/frame-rate-utils'
import {
  areSegmentListsEqual,
  generateUUID,
  resolveSegmentIndex,
  sortSegmentsByStart,
} from '@/lib/segment-utils'
import {
  introSkipperClipboardTextToSegments,
  segmentsToIntroSkipperClipboardText,
} from '@/services/plugins/intro-skipper'
import { showNotification } from '@/lib/notifications'
import { cn } from '@/lib/utils'
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { SegmentSlider } from '@/components/segment/SegmentSlider'
import { SegmentEditDialog } from '@/components/segment/SegmentEditDialog'
import { SegmentTypeMenu } from '@/components/segment/SegmentTypeMenu'
import { SegmentLoadingState } from '@/components/ui/segment-loading-state'

const SEGMENT_VIRTUALIZATION_STYLE: React.CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: '0 280px',
}

/** Pre-computed platform-aware shortcut display for the save button title */
const MOD_S_DISPLAY = formatForDisplay('Mod+S')

interface PlayerEditorProps {
  item: BaseItemDto
  fetchSegments?: boolean
  vibrantColors: VibrantColors | null
  className?: string
}

type SegmentUpdater = (prev: Array<MediaSegmentDto>) => Array<MediaSegmentDto>

interface ParsedImportResult {
  segments: Array<MediaSegmentDto>
  skipped: number
  unknownTypes: Array<string>
}

function buildImportInfoSuffix({
  skipped,
  unknownTypes,
}: Pick<ParsedImportResult, 'skipped' | 'unknownTypes'>): string {
  const infoParts: Array<string> = []
  if (skipped > 0) {
    infoParts.push(`${skipped} skipped`)
  }
  if (unknownTypes.length > 0) {
    infoParts.push(`unknown: ${unknownTypes.join(', ')}`)
  }

  if (infoParts.length === 0) {
    return ''
  }

  return ` (${infoParts.join('; ')})`
}

function getSegmentStartTicks(segment: MediaSegmentDto): number {
  return segment.StartTicks ?? 0
}

function getSegmentEndTicks(segment: MediaSegmentDto): number {
  return segment.EndTicks ?? getSegmentStartTicks(segment)
}

function findInsertionIndex(
  segments: ReadonlyArray<MediaSegmentDto>,
  segment: MediaSegmentDto,
): number {
  const nextStart = getSegmentStartTicks(segment)
  const nextEnd = getSegmentEndTicks(segment)

  let low = 0
  let high = segments.length

  while (low < high) {
    const mid = (low + high) >> 1
    const candidate = segments[mid]
    const candidateStart = getSegmentStartTicks(candidate)
    const candidateEnd = getSegmentEndTicks(candidate)

    if (
      candidateStart < nextStart ||
      (candidateStart === nextStart && candidateEnd <= nextEnd)
    ) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

function insertSegmentSorted(
  segments: ReadonlyArray<MediaSegmentDto>,
  segment: MediaSegmentDto,
): { nextSegments: Array<MediaSegmentDto>; insertedIndex: number } {
  const insertedIndex = findInsertionIndex(segments, segment)
  const nextSegments = [...segments]
  nextSegments.splice(insertedIndex, 0, segment)
  return { nextSegments, insertedIndex }
}

function replaceSegmentSorted(
  segments: ReadonlyArray<MediaSegmentDto>,
  updatedSegment: MediaSegmentDto,
): { nextSegments: Array<MediaSegmentDto>; insertedIndex: number } {
  if (!updatedSegment.Id) {
    const nextSegments = segments.toSorted(sortSegmentsByStart)
    return { nextSegments, insertedIndex: 0 }
  }

  const previousIndex = segments.findIndex(
    (seg) => seg.Id === updatedSegment.Id,
  )
  if (previousIndex === -1) {
    return insertSegmentSorted(segments, updatedSegment)
  }

  const nextSegments = [...segments]
  nextSegments.splice(previousIndex, 1)
  const insertedIndex = findInsertionIndex(nextSegments, updatedSegment)
  nextSegments.splice(insertedIndex, 0, updatedSegment)

  return { nextSegments, insertedIndex }
}

export function PlayerEditor({
  item,
  fetchSegments = true,
  vibrantColors,
  className,
}: PlayerEditorProps) {
  return useRenderPlayerEditor({
    item,
    fetchSegments,
    vibrantColors,
    className,
  })
}

function useRenderPlayerEditor({
  item,
  fetchSegments = true,
  vibrantColors,
  className,
}: PlayerEditorProps) {
  const { t } = useTranslation()
  const showVideoPlayer = useAppStore((state) => state.showVideoPlayer)
  const setShowVideoPlayer = useAppStore((state) => state.setShowVideoPlayer)

  const batchSaveMutation = useBatchSaveSegments()

  const { data: serverSegments = [], isLoading: isLoadingSegments } =
    useSegments(item.Id ?? '', {
      enabled: fetchSegments && !!item.Id,
    })

  const sortedServerSegments = serverSegments.toSorted(sortSegmentsByStart)

  const [localEditingSegments, setLocalEditingSegments] =
    React.useState<Array<MediaSegmentDto> | null>(null)
  const editingSegments = localEditingSegments ?? sortedServerSegments
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [playerTimestamp, setPlayerTimestamp] = React.useState<number>()
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingSegmentIndex, setEditingSegmentIndex] = React.useState<
    number | null
  >(null)

  const getCurrentTimeRef = React.useRef<(() => number) | null>(null)

  const [pendingImport, setPendingImport] =
    React.useState<ParsedImportResult | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<{
    id?: MediaSegmentDto['Id']
    type?: MediaSegmentDto['Type']
    index: number
  } | null>(null)

  // Reset editor-local state when the edited item changes while this
  // component stays mounted (e.g. switching episodes from the header),
  // so edits and open dialogs never leak across items.
  const [renderedItemId, setRenderedItemId] = React.useState(item.Id)
  if (renderedItemId !== item.Id) {
    setRenderedItemId(item.Id)
    setLocalEditingSegments(null)
    setActiveIndex(0)
    setEditDialogOpen(false)
    setEditingSegmentIndex(null)
    setPendingImport(null)
    setPendingDelete(null)
  }

  const isSaving = batchSaveMutation.isPending

  // The batch save writes the new list into the query cache optimistically
  // (onMutate), which would make the local/server comparison report "clean"
  // while the request is still in flight. Treat the editor as dirty until the
  // save is confirmed so navigation and tab-close stay guarded; on failure the
  // cache rolls back and the comparison keeps the editor dirty.
  const isDirty =
    localEditingSegments !== null &&
    (isSaving ||
      !areSegmentListsEqual(localEditingSegments, sortedServerSegments))

  const blocker = useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: () => isDirty,
    disabled: !isDirty,
    withResolver: true,
  })

  const saveAbortRef = React.useRef<AbortController | null>(null)

  const updateEditingSegments = (updater: SegmentUpdater) => {
    setLocalEditingSegments((prev) => updater(prev ?? sortedServerSegments))
  }

  const editingSegmentsRef = React.useRef(editingSegments)
  React.useEffect(() => {
    editingSegmentsRef.current = editingSegments
  }, [editingSegments])
  const timestampTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(null)

  React.useEffect(
    () => () => {
      if (timestampTimeoutRef.current) clearTimeout(timestampTimeoutRef.current)
      saveAbortRef.current?.abort()
    },
    [],
  )

  const runtimeSeconds = ticksToSeconds(item.RunTimeTicks) || 0

  const frameStepSeconds = resolveFrameStepSeconds(item)

  const handleCreateSegment = (data: CreateSegmentData) => {
    const newSegment: MediaSegmentDto = {
      Id: generateUUID(),
      ItemId: item.Id,
      Type: data.type,
      StartTicks: data.start,
      EndTicks: data.end ?? data.start + 1,
    }

    updateEditingSegments((prev) => {
      const { nextSegments, insertedIndex } = insertSegmentSorted(
        prev,
        newSegment,
      )
      setActiveIndex(insertedIndex)
      return nextSegments
    })
  }

  const handleUpdateSegmentTimestamp = (data: TimestampUpdate) => {
    updateEditingSegments((prev) => {
      if (prev.length === 0) return prev

      const targetIndex = data.index ?? activeIndex
      const segment = prev[targetIndex] as MediaSegmentDto | undefined
      if (segment === undefined) return prev

      const updatedSegment: MediaSegmentDto = {
        ...segment,
        StartTicks: data.start ? data.currentTime : segment.StartTicks,
        EndTicks: data.start ? segment.EndTicks : data.currentTime,
      }

      const { nextSegments, insertedIndex } = replaceSegmentSorted(
        prev,
        updatedSegment,
      )
      setActiveIndex(insertedIndex)

      return nextSegments
    })
  }

  const getPlayerTime = () => {
    const raw = getCurrentTimeRef.current?.()
    if (raw === undefined) return undefined
    return snapToFrame(raw, frameStepSeconds)
  }

  const handleUpdateSegment = (data: SegmentUpdate) => {
    updateEditingSegments((prev) => {
      const segmentToUpdate = prev.find((seg) => seg.Id === data.id)
      if (!segmentToUpdate) return prev

      const { nextSegments } = replaceSegmentSorted(prev, {
        ...segmentToUpdate,
        StartTicks: data.start,
        EndTicks: data.end,
      })

      return nextSegments
    })
  }

  const handleChangeSegmentType = (index: number, type: MediaSegmentType) => {
    updateEditingSegments((prev) => {
      const segment = prev[index] as MediaSegmentDto | undefined
      if (!segment || segment.Type === type) return prev

      const { nextSegments, insertedIndex } = replaceSegmentSorted(prev, {
        ...segment,
        Type: type,
      })
      setActiveIndex(insertedIndex)

      return nextSegments
    })
  }

  const handleDeleteSegment = (index: number) => {
    updateEditingSegments((prev) => {
      if (index < 0 || index >= prev.length) return prev

      const updated = [...prev]
      updated.splice(index, 1)

      setActiveIndex((prevIndex) => {
        if (updated.length === 0) return 0
        if (prevIndex > index) return prevIndex - 1
        return Math.max(0, Math.min(prevIndex, updated.length - 1))
      })

      return updated
    })
  }

  const handleRequestDeleteSegment = (index: number) => {
    const segment = editingSegments[index] as MediaSegmentDto | undefined
    if (segment === undefined) return
    setPendingDelete({ id: segment.Id, type: segment.Type, index })
  }

  const handleConfirmDeleteSegment = () => {
    if (pendingDelete !== null) {
      // Resolve by Id at confirmation time: edits made while the dialog is
      // open can re-sort the list, so the captured index may be stale.
      const currentIndex = resolveSegmentIndex(editingSegments, pendingDelete)
      if (currentIndex !== -1) handleDeleteSegment(currentIndex)
    }
    setPendingDelete(null)
  }

  const handleCancelDeleteSegment = () => {
    setPendingDelete(null)
  }

  const handlePlayerTimestamp = (timestamp: number) => {
    if (timestampTimeoutRef.current) clearTimeout(timestampTimeoutRef.current)
    setPlayerTimestamp(timestamp)
    timestampTimeoutRef.current = setTimeout(
      () => setPlayerTimestamp(undefined),
      100,
    )
  }

  const handleOpenEditDialog = (index: number) => {
    setEditingSegmentIndex(index)
    setEditDialogOpen(true)
  }

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false)
    setEditingSegmentIndex(null)
  }

  const handleSaveSegmentFromDialog = (updatedSegment: MediaSegmentDto) => {
    updateEditingSegments((prev) => {
      const { nextSegments, insertedIndex } = replaceSegmentSorted(
        prev,
        updatedSegment,
      )
      setActiveIndex(insertedIndex)
      return nextSegments
    })
  }

  const handleDeleteSegmentFromDialog = (segment: MediaSegmentDto) => {
    updateEditingSegments((prev) => prev.filter((seg) => seg.Id !== segment.Id))
    setActiveIndex((prev) => Math.max(0, prev - 1))
  }

  const handlePasteFromClipboard = () => {
    if (!item.Id) return
    const itemId = item.Id

    void navigator.clipboard
      .readText()
      .then((text) => {
        const result = introSkipperClipboardTextToSegments(text, {
          itemId,
          maxDurationSeconds: runtimeSeconds,
        })

        if (result.segments.length === 0) {
          showNotification({
            type: 'negative',
            message: result.error ?? t('editor.noSegmentInClipboard'),
          })
          return
        }

        if (editingSegmentsRef.current.length > 0) {
          setPendingImport(result)
          return
        }

        updateEditingSegments(() => {
          const updated = result.segments.toSorted(sortSegmentsByStart)
          setActiveIndex(0)
          return updated
        })

        const infoSuffix = buildImportInfoSuffix(result)
        showNotification({
          type: 'positive',
          message: `Imported ${result.segments.length} segments${infoSuffix}`,
        })
      })
      .catch(() => {
        showNotification({
          type: 'negative',
          message: t('editor.noSegmentInClipboard', 'No segment in clipboard'),
        })
      })
  }

  const handleSaveAll = async () => {
    if (!item.Id || isSaving || !isDirty) return

    saveAbortRef.current?.abort()
    const controller = new AbortController()
    saveAbortRef.current = controller

    const currentSegments = editingSegmentsRef.current

    try {
      await batchSaveMutation.mutateAsync({
        itemId: item.Id,
        existingSegments: serverSegments,
        newSegments: currentSegments,
      })

      if (!controller.signal.aborted) {
        setLocalEditingSegments(null)
      }
    } catch {}
  }

  const handleDiscardEdits = () => {
    setLocalEditingSegments(null)
    setActiveIndex(0)
  }

  const handleCopyAllAsJson = async () => {
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
  }

  const dismissImportDialog = () => {
    setPendingImport(null)
  }

  const handleImportReplace = () => {
    const pending = pendingImport
    if (!pending) return

    updateEditingSegments(() => {
      const updated = pending.segments.toSorted(sortSegmentsByStart)
      setActiveIndex(0)
      return updated
    })

    const infoSuffix = buildImportInfoSuffix(pending)
    showNotification({
      type: 'positive',
      message: `Replaced with ${pending.segments.length} segments${infoSuffix}`,
    })

    dismissImportDialog()
  }

  const handleImportMerge = () => {
    const pending = pendingImport
    if (!pending) return

    updateEditingSegments((prev) => {
      const merged = [...prev, ...pending.segments].sort(sortSegmentsByStart)
      return merged
    })

    const infoSuffix = buildImportInfoSuffix(pending)
    showNotification({
      type: 'positive',
      message: `Added ${pending.segments.length} segments${infoSuffix}`,
    })

    dismissImportDialog()
  }

  const handleImportCancel = dismissImportDialog

  const handleCreateSegmentOfType = (type: MediaSegmentType) => {
    handleCreateSegment({
      type,
      start: getPlayerTime() ?? 0,
    })
  }

  useHotkey('Mod+S', () => {
    void handleSaveAll()
  })

  useHotkey('[', () => {
    setActiveIndex((prev) =>
      editingSegments.length === 0
        ? 0
        : (prev - 1 + editingSegments.length) % editingSegments.length,
    )
  })

  useHotkey(']', () => {
    setActiveIndex((prev) =>
      editingSegments.length === 0 ? 0 : (prev + 1) % editingSegments.length,
    )
  })

  return (
    <div className={cn('flex flex-col gap-6 max-w-6xl mx-auto', className)}>
      {showVideoPlayer && (
        <Player
          item={item}
          vibrantColors={vibrantColors}
          timestamp={playerTimestamp}
          segments={editingSegments}
          frameStepSeconds={frameStepSeconds}
          onCreateSegment={handleCreateSegment}
          onUpdateSegmentTimestamp={handleUpdateSegmentTimestamp}
          getCurrentTimeRef={getCurrentTimeRef}
        />
      )}

      {!showVideoPlayer && (
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowVideoPlayer(true)}
            aria-label={t('player.restore', 'Show player')}
          >
            <Eye className="size-4 mr-2" aria-hidden="true" />
            {t('player.restore', 'Show player')}
          </Button>
          <SegmentTypeMenu
            onSelect={handleCreateSegmentOfType}
            render={<Button variant="outline" />}
          >
            <Plus className="size-4 mr-2" aria-hidden="true" />
            {t('editor.newSegment')}
          </SegmentTypeMenu>
        </div>
      )}

      <div className="space-y-4">
        {isLoadingSegments ? (
          <SegmentLoadingState count={2} />
        ) : editingSegments.length === 0 ? (
          <Empty className="border-none bg-transparent py-8">
            <EmptyHeader>
              <EmptyTitle>
                {t('editor.noSegmentsTitle', 'No segments yet')}
              </EmptyTitle>
              <EmptyDescription>
                {t(
                  'editor.noSegmentsHint',
                  'Create a segment or paste one from your clipboard.',
                )}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-3">
                <SegmentTypeMenu
                  onSelect={handleCreateSegmentOfType}
                  render={<Button variant="outline" />}
                >
                  <Plus className="size-4 mr-2" aria-hidden="true" />
                  {t('editor.newSegment')}
                </SegmentTypeMenu>
                <Button variant="outline" onClick={handlePasteFromClipboard}>
                  <ClipboardPaste className="size-4 mr-2" aria-hidden="true" />
                  {t('editor.paste', 'Paste')}
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-3 pb-2">
            {editingSegments.map((segment, index) => (
              <div
                key={segment.Id ?? `segment-${index}`}
                style={SEGMENT_VIRTUALIZATION_STYLE}
              >
                <SegmentSlider
                  segment={segment}
                  index={index}
                  isActive={index === activeIndex}
                  runtimeSeconds={runtimeSeconds}
                  frameStepSeconds={frameStepSeconds}
                  onUpdate={handleUpdateSegment}
                  onDelete={handleRequestDeleteSegment}
                  onEdit={handleOpenEditDialog}
                  onChangeType={handleChangeSegmentType}
                  onPlayerTimestamp={handlePlayerTimestamp}
                  onSetActive={setActiveIndex}
                  getPlayerTime={showVideoPlayer ? getPlayerTime : undefined}
                  onCopyAllAsJson={handleCopyAllAsJson}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {editingSegmentIndex !== null && editingSegments[editingSegmentIndex] && (
        <SegmentEditDialog
          key={editingSegments[editingSegmentIndex].Id ?? editingSegmentIndex}
          open={editDialogOpen}
          segment={editingSegments[editingSegmentIndex]}
          runtimeSeconds={runtimeSeconds}
          onClose={handleCloseEditDialog}
          onSave={handleSaveSegmentFromDialog}
          onDelete={handleDeleteSegmentFromDialog}
        />
      )}

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) dismissImportDialog()
        }}
      >
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

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('editor.deleteSureTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('editor.deleteSure', {
                Type: pendingDelete?.type,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDeleteSegment}>
              {t('no')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteSegment}>
              {t('yes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('editor.unsavedTitle', 'Discard unsaved changes?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'editor.unsavedDescription',
                'You have unsaved segment edits. They will be lost if you leave.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                // Match the dialog copy: discard local edits before leaving
                // so they cannot leak back in if this editor stays mounted.
                handleDiscardEdits()
                blocker.proceed?.()
              }}
            >
              {t('editor.discardAndLeave', 'Discard & leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="sticky bottom-0 z-20 bg-background/85 backdrop-blur-md border-t border-border/40 pb-safe">
        <div
          className="flex items-center justify-between gap-3 py-3"
          role="toolbar"
          aria-label={t('editor.actions', 'Segment actions')}
        >
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground min-w-0"
            role="status"
            aria-live="polite"
          >
            {isDirty ? (
              <>
                <span
                  className="size-2 rounded-full bg-amber-500 shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">
                  {t('editor.unsavedChanges', 'Unsaved changes')}
                </span>
              </>
            ) : (
              <span className="truncate tabular-nums">
                {t('editor.segmentCount', {
                  count: editingSegments.length,
                  defaultValue: '{{count}} segments',
                })}
              </span>
            )}
          </p>

          <div className="flex items-center gap-2 shrink-0">
            {isDirty && !isSaving && (
              <Button
                variant="ghost"
                onClick={handleDiscardEdits}
                aria-label={t('editor.discard', 'Discard unsaved edits')}
              >
                <Undo2 className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {t('editor.discard', 'Discard')}
                </span>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handlePasteFromClipboard}
              aria-label={t('editor.paste', 'Paste segment from clipboard')}
            >
              <ClipboardPaste className="size-4" aria-hidden="true" />
              {t('editor.paste', 'Paste')}
            </Button>
            <Button
              onClick={() => void handleSaveAll()}
              disabled={isSaving || !isDirty}
              aria-label={t('editor.saveSegment', 'Save all segments')}
              aria-busy={isSaving}
              title={`${t('editor.saveSegment', 'Save')} (${MOD_S_DISPLAY})`}
            >
              {isSaving ? (
                <div className="animate-spin" aria-hidden="true">
                  <Loader2 className="size-4" />
                </div>
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {isSaving && <span className="sr-only">Saving segments</span>}
              {t('editor.saveSegment')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
