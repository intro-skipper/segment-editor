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
  className?: string
}

interface EditingState {
  localEditingSegments: Array<MediaSegmentDto> | null
  activeIndex: number
}

interface EditingUpdate {
  segments: Array<MediaSegmentDto>
  activeIndex?: number
}

type SegmentUpdater = (
  segments: Array<MediaSegmentDto>,
  activeIndex: number,
) => EditingUpdate | null

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
  className,
}: PlayerEditorProps) {
  return useRenderPlayerEditor({
    item,
    fetchSegments,
    className,
  })
}

function useRenderPlayerEditor({
  item,
  fetchSegments = true,
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

  const [{ localEditingSegments, activeIndex }, setEditingState] =
    React.useState<EditingState>({
      localEditingSegments: null,
      activeIndex: 0,
    })
  const editingSegments = localEditingSegments ?? sortedServerSegments
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
    setEditingState({ localEditingSegments: null, activeIndex: 0 })
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

  const proceedBlockedNavigation = React.useEffectEvent(() => {
    blocker.proceed?.()
  })

  // If the user tried to leave during an in-flight save and the save then
  // completed (local edits cleared, nothing dirty anymore), let the pending
  // navigation continue instead of leaving a stale "discard" prompt open.
  React.useLayoutEffect(() => {
    if (blocker.status === 'blocked' && !isDirty) {
      proceedBlockedNavigation()
    }
  }, [blocker.status, isDirty])

  const editingSegmentsRef = React.useRef(editingSegments)
  React.useEffect(() => {
    editingSegmentsRef.current = editingSegments
  }, [editingSegments])
  const timestampTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(null)

  React.useEffect(
    () => () => {
      if (timestampTimeoutRef.current) clearTimeout(timestampTimeoutRef.current)
    },
    [],
  )

  const updateEditingSegments = (updater: SegmentUpdater): void => {
    setEditingState((previous) => {
      const update = updater(
        previous.localEditingSegments ?? sortedServerSegments,
        previous.activeIndex,
      )
      if (!update) return previous

      return {
        localEditingSegments: update.segments,
        activeIndex: update.activeIndex ?? previous.activeIndex,
      }
    })
  }

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

    updateEditingSegments((segments) => {
      const { nextSegments, insertedIndex } = insertSegmentSorted(
        segments,
        newSegment,
      )
      return { segments: nextSegments, activeIndex: insertedIndex }
    })
  }

  const handleUpdateSegmentTimestamp = (data: TimestampUpdate) => {
    updateEditingSegments((segments, currentActiveIndex) => {
      if (segments.length === 0) return null

      const targetIndex = data.index ?? currentActiveIndex
      const segment = segments[targetIndex] as MediaSegmentDto | undefined
      if (segment === undefined) return null

      const updatedSegment: MediaSegmentDto = {
        ...segment,
        StartTicks: data.start ? data.currentTime : segment.StartTicks,
        EndTicks: data.start ? segment.EndTicks : data.currentTime,
      }

      const { nextSegments, insertedIndex } = replaceSegmentSorted(
        segments,
        updatedSegment,
      )
      return { segments: nextSegments, activeIndex: insertedIndex }
    })
  }

  const getPlayerTime = () => {
    const raw = getCurrentTimeRef.current?.()
    if (raw === undefined) return undefined
    return snapToFrame(raw, frameStepSeconds)
  }

  const handleUpdateSegment = (data: SegmentUpdate) => {
    updateEditingSegments((segments) => {
      const segmentToUpdate = segments.find((seg) => seg.Id === data.id)
      if (!segmentToUpdate) return null

      const { nextSegments } = replaceSegmentSorted(segments, {
        ...segmentToUpdate,
        StartTicks: data.start,
        EndTicks: data.end,
      })
      return { segments: nextSegments }
    })
  }

  const handleChangeSegmentType = (index: number, type: MediaSegmentType) => {
    updateEditingSegments((segments) => {
      const segment = segments[index] as MediaSegmentDto | undefined
      if (!segment || segment.Type === type) return null

      const { nextSegments, insertedIndex } = replaceSegmentSorted(segments, {
        ...segment,
        Type: type,
      })
      return { segments: nextSegments, activeIndex: insertedIndex }
    })
  }

  const handleDeleteSegment = (index: number) => {
    updateEditingSegments((segments, currentActiveIndex) => {
      if (index < 0 || index >= segments.length) return null

      const updated = [...segments]
      updated.splice(index, 1)

      const nextActiveIndex =
        updated.length === 0
          ? 0
          : currentActiveIndex > index
            ? currentActiveIndex - 1
            : Math.max(0, Math.min(currentActiveIndex, updated.length - 1))
      return { segments: updated, activeIndex: nextActiveIndex }
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
    updateEditingSegments((segments) => {
      const { nextSegments, insertedIndex } = replaceSegmentSorted(
        segments,
        updatedSegment,
      )
      return { segments: nextSegments, activeIndex: insertedIndex }
    })
  }

  const handleDeleteSegmentFromDialog = (segment: MediaSegmentDto) => {
    updateEditingSegments((segments, currentActiveIndex) => ({
      segments: segments.filter((seg) => seg.Id !== segment.Id),
      activeIndex: Math.max(0, currentActiveIndex - 1),
    }))
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

        updateEditingSegments(() => ({
          segments: result.segments.toSorted(sortSegmentsByStart),
          activeIndex: 0,
        }))

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

    const savedSegments = editingSegmentsRef.current

    try {
      await batchSaveMutation.mutateAsync({
        itemId: item.Id,
        existingSegments: serverSegments,
        newSegments: savedSegments,
      })

      // Clear only the exact edits this save persisted. If the item changed
      // or the user kept editing while the save was in flight, the current
      // edits are a different array and must survive.
      setEditingState((previous) =>
        previous.localEditingSegments === savedSegments
          ? { ...previous, localEditingSegments: null }
          : previous,
      )
    } catch {
      // Errors surface via the mutation's onError toast; edits stay dirty.
    }
  }

  const handleDiscardEdits = () => {
    setEditingState({ localEditingSegments: null, activeIndex: 0 })
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

    updateEditingSegments(() => ({
      segments: pending.segments.toSorted(sortSegmentsByStart),
      activeIndex: 0,
    }))

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

    updateEditingSegments((segments) => ({
      segments: [...segments, ...pending.segments].sort(sortSegmentsByStart),
    }))

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
    setEditingState((previous) => ({
      ...previous,
      activeIndex:
        editingSegments.length === 0
          ? 0
          : (previous.activeIndex - 1 + editingSegments.length) %
            editingSegments.length,
    }))
  })

  useHotkey(']', () => {
    setEditingState((previous) => ({
      ...previous,
      activeIndex:
        editingSegments.length === 0
          ? 0
          : (previous.activeIndex + 1) % editingSegments.length,
    }))
  })

  return (
    <div className={cn('flex flex-col gap-6 max-w-6xl mx-auto', className)}>
      {showVideoPlayer && (
        <Player
          item={item}
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
                  onSetActive={(nextActiveIndex) =>
                    setEditingState((previous) => ({
                      ...previous,
                      activeIndex: nextActiveIndex,
                    }))
                  }
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
              {isSaving
                ? t('editor.saveInProgressTitle', 'Save in progress')
                : t('editor.unsavedTitle', 'Discard unsaved changes?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSaving
                ? t(
                    'editor.saveInProgressDescription',
                    'Your segment edits are still being saved. If you leave now, the save will finish in the background.',
                  )
                : t(
                    'editor.unsavedDescription',
                    'You have unsaved segment edits. They will be lost if you leave.',
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {isSaving
                ? t('editor.stay', 'Stay')
                : t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            {isSaving ? (
              // Cancelling the batch save is not safe: it deletes the
              // existing segments before recreating them, so an abort between
              // the two phases would wipe the item's segments remotely.
              // Leaving lets the in-flight save finish in the background.
              <AlertDialogAction onClick={() => blocker.proceed?.()}>
                {t('editor.leave', 'Leave')}
              </AlertDialogAction>
            ) : (
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
            )}
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
                  {isSaving
                    ? t('editor.saving', 'Saving…')
                    : t('editor.unsavedChanges', 'Unsaved changes')}
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
