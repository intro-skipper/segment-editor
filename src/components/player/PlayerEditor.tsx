import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useBlocker } from '@tanstack/react-router'
import { ClipboardPaste, Eye, Plus } from 'lucide-react'

import { Player } from './Player'
import { PlaybackProvider } from './playback-context'
import { EditorActionBar } from './EditorActionBar'
import {
  ImportSegmentsDialog,
  UnsavedChangesDialog,
} from './PlayerEditorDialogs'
import type {
  BaseItemDto,
  MediaSegmentDto,
  MediaSegmentType,
} from '@/types/jellyfin'
import type { SegmentUpdate, TimestampUpdate } from '@/types/segment'
import type { SegmentTarget } from '@/services/segments/edit-session'
import { useSegmentEditSession } from '@/services/segments/edit-session'
import { useAppStore } from '@/stores/app-store'
import { ticksToSeconds } from '@/lib/time-utils'
import { resolveFrameStepSeconds } from '@/lib/frame-rate-utils'
import {
  introSkipperClipboardTextToSegments,
  segmentsToIntroSkipperClipboardText,
} from '@/services/plugins/intro-skipper'
import { showNotification } from '@/lib/notifications'
import { usePlaybackSession } from '@/hooks/use-playback-session'
import { cn, elementAt } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { SegmentSlider } from '@/components/segment/SegmentSlider'
import {
  SegmentDeleteConfirmDialog,
  SegmentEditDialog,
} from '@/components/segment/SegmentEditDialog'
import { SegmentTypeMenu } from '@/components/segment/SegmentTypeMenu'
import { SegmentLoadingState } from '@/components/ui/segment-loading-state'
import {
  findMediaSource,
  getSelectableMediaSources,
  itemForMediaSource,
} from '@/lib/media-source-utils'

const SEGMENT_VIRTUALIZATION_STYLE: React.CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: '0 280px',
}

/**
 * One row of the segment list.
 *
 * The row lives inside a `.map()`, which React Compiler cannot cache per item,
 * so its own component boundary is what gives each row a cache keyed on its
 * own props. Without it, any list-level change (a new active index, an edit to
 * one segment) re-renders every SegmentSlider in the list. Props are
 * destructured rather than spread so the compiler tracks them field by field.
 */
function SegmentListRow({
  segment,
  index,
  isActive,
  runtimeSeconds,
  frameStepSeconds,
  onUpdate,
  onDelete,
  onEdit,
  onChangeType,
  onPlayerTimestamp,
  onSetActive,
  getPlayerTime,
  onCopyAllAsJson,
}: React.ComponentProps<typeof SegmentSlider>) {
  return (
    <div style={SEGMENT_VIRTUALIZATION_STYLE}>
      <SegmentSlider
        segment={segment}
        index={index}
        isActive={isActive}
        runtimeSeconds={runtimeSeconds}
        frameStepSeconds={frameStepSeconds}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onEdit={onEdit}
        onChangeType={onChangeType}
        onPlayerTimestamp={onPlayerTimestamp}
        onSetActive={onSetActive}
        getPlayerTime={getPlayerTime}
        onCopyAllAsJson={onCopyAllAsJson}
      />
    </div>
  )
}

interface PlayerEditorProps {
  item: BaseItemDto
  fetchSegments?: boolean
  className?: string
}

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

interface PendingDelete {
  target: SegmentTarget
  type?: MediaSegmentDto['Type']
}

/** Targets a segment by Id, falling back to its index for one without. */
const targetOf = (segment: MediaSegmentDto, index: number): SegmentTarget =>
  segment.Id ? { id: segment.Id } : { index }

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

  const selectableMediaSources = React.useMemo(
    () => getSelectableMediaSources(item),
    [item],
  )
  const defaultMediaSourceId = selectableMediaSources[0]?.Id ?? ''
  const [selectedMediaSourceId, setSelectedMediaSourceId] =
    React.useState(defaultMediaSourceId)

  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingSegmentIndex, setEditingSegmentIndex] = React.useState<
    number | null
  >(null)

  const [pendingImport, setPendingImport] =
    React.useState<ParsedImportResult | null>(null)
  const [pendingDelete, setPendingDelete] =
    React.useState<PendingDelete | null>(null)

  // Reset editor-local state when the edited item changes while this
  // component stays mounted (e.g. switching episodes from the header),
  // so open dialogs never leak across items. The session resets the draft.
  const [renderedItemId, setRenderedItemId] = React.useState(item.Id)
  if (renderedItemId !== item.Id) {
    setRenderedItemId(item.Id)
    setSelectedMediaSourceId(defaultMediaSourceId)
    setEditDialogOpen(false)
    setEditingSegmentIndex(null)
    setPendingImport(null)
    setPendingDelete(null)
  }

  const selectedMediaSource = findMediaSource(item, selectedMediaSourceId)
  const effectiveMediaSourceId = selectedMediaSource?.Id ?? ''
  const playbackItem = React.useMemo(
    () => itemForMediaSource(item, effectiveMediaSourceId),
    [item, effectiveMediaSourceId],
  )

  const { engine, videoRef } = usePlaybackSession({ item: playbackItem })

  const runtimeSeconds = ticksToSeconds(playbackItem.RunTimeTicks) || 0
  const frameStepSeconds = resolveFrameStepSeconds(playbackItem)

  // Destructured so handlers close over the commands, which keep their
  // identity between edits, not over the session object, which does not.
  const {
    segments: editingSegments,
    activeIndex,
    isLoading,
    isDirty,
    isSaving,
    create,
    update,
    remove,
    importSegments,
    select,
    step,
    save,
    discard,
  } = useSegmentEditSession(item.Id ?? '', {
    enabled: fetchSegments && !!item.Id,
    rules: { runtimeSeconds, frameStepSeconds },
  })

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

  const handleUpdateSegmentTimestamp = (data: TimestampUpdate) => {
    update(
      data.index === undefined ? 'active' : { index: data.index },
      data.start
        ? { StartTicks: data.currentTime }
        : { EndTicks: data.currentTime },
    )
  }

  const getPlayerTime = () => engine.playhead.getSnappedTime()

  const handleUpdateSegment = (data: SegmentUpdate) => {
    update({ id: data.id }, { StartTicks: data.start, EndTicks: data.end })
  }

  const handleChangeSegmentType = (index: number, type: MediaSegmentType) => {
    update({ index }, { Type: type })
  }

  const handleRequestDeleteSegment = (index: number) => {
    // Read via the ref: reading `editingSegments` here would give the handler a
    // new identity on every edit, cache-missing every SegmentListRow below.
    const segment = elementAt(editingSegmentsRef.current, index)
    if (segment === undefined) return
    setPendingDelete({ target: targetOf(segment, index), type: segment.Type })
  }

  const handleConfirmDeleteSegment = () => {
    if (pendingDelete !== null) remove(pendingDelete.target)
    setPendingDelete(null)
  }

  const handleCancelDeleteSegment = () => {
    setPendingDelete(null)
  }

  // A no-op while the player is hidden.
  const handlePlayerTimestamp = (timestamp: number) => {
    engine.playhead.seek(timestamp)
  }

  const handleOpenEditDialog = (index: number) => {
    setEditingSegmentIndex(index)
    setEditDialogOpen(true)
  }

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false)
    setEditingSegmentIndex(null)
  }

  const handleSaveSegmentFromDialog = (segment: MediaSegmentDto) => {
    update(targetOf(segment, editingSegmentIndex ?? -1), {
      Type: segment.Type,
      StartTicks: segment.StartTicks,
      EndTicks: segment.EndTicks,
    })
  }

  const handleDeleteSegmentFromDialog = (segment: MediaSegmentDto) => {
    remove(targetOf(segment, editingSegmentIndex ?? -1))
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

        importSegments(result.segments, 'replace')

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

    importSegments(pending.segments, 'replace')

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

    importSegments(pending.segments, 'merge')

    const infoSuffix = buildImportInfoSuffix(pending)
    showNotification({
      type: 'positive',
      message: `Added ${pending.segments.length} segments${infoSuffix}`,
    })

    dismissImportDialog()
  }

  const handleCreateSegmentOfType = (type: MediaSegmentType) => {
    create({
      type,
      start: getPlayerTime(),
    })
  }

  useHotkey('Mod+S', () => {
    void save()
  })

  useHotkey('[', () => {
    step(-1)
  })

  useHotkey(']', () => {
    step(1)
  })

  return (
    <div className={cn('flex flex-col gap-6 max-w-6xl mx-auto', className)}>
      {showVideoPlayer ? (
        <PlaybackProvider engine={engine}>
          <Player
            item={playbackItem}
            videoRef={videoRef}
            mediaSourceControls={{
              sources: selectableMediaSources,
              value: effectiveMediaSourceId,
              onSelect: setSelectedMediaSourceId,
            }}
            segments={editingSegments}
            onCreateSegment={create}
            onUpdateSegmentTimestamp={handleUpdateSegmentTimestamp}
          />
        </PlaybackProvider>
      ) : (
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowVideoPlayer(true)}
            aria-label={t('player.restore', 'Show player')}
          >
            <Eye className="size-4" aria-hidden="true" />
            {t('player.restore', 'Show player')}
          </Button>
          <SegmentTypeMenu
            onSelect={handleCreateSegmentOfType}
            render={<Button variant="outline" />}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('editor.newSegment')}
          </SegmentTypeMenu>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {isLoading ? (
          <SegmentLoadingState count={2} />
        ) : editingSegments.length === 0 ? (
          <Empty>
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
                  <Plus className="size-4" aria-hidden="true" />
                  {t('editor.newSegment')}
                </SegmentTypeMenu>
                <Button variant="outline" onClick={handlePasteFromClipboard}>
                  <ClipboardPaste className="size-4" aria-hidden="true" />
                  {t('editor.paste', 'Paste')}
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3 pbe-2">
            {editingSegments.map((segment, index) => (
              <SegmentListRow
                key={segment.Id}
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
                onSetActive={select}
                getPlayerTime={showVideoPlayer ? getPlayerTime : undefined}
                onCopyAllAsJson={handleCopyAllAsJson}
              />
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

      <ImportSegmentsDialog
        open={pendingImport !== null}
        existingCount={editingSegments.length}
        onDismiss={dismissImportDialog}
        onMerge={handleImportMerge}
        onReplace={handleImportReplace}
      />

      <SegmentDeleteConfirmDialog
        open={pendingDelete !== null}
        segmentType={pendingDelete?.type}
        onDismiss={handleCancelDeleteSegment}
        onConfirm={handleConfirmDeleteSegment}
      />

      <UnsavedChangesDialog
        open={blocker.status === 'blocked'}
        isSaving={isSaving}
        onStay={() => blocker.reset?.()}
        onLeave={() => blocker.proceed?.()}
        onDiscardAndLeave={() => {
          // Match the dialog copy: discard local edits before leaving
          // so they cannot leak back in if this editor stays mounted.
          discard()
          blocker.proceed?.()
        }}
      />

      <EditorActionBar
        isDirty={isDirty}
        isSaving={isSaving}
        segmentCount={editingSegments.length}
        onDiscard={discard}
        onPaste={handlePasteFromClipboard}
        onSave={() => void save()}
      />
    </div>
  )
}
