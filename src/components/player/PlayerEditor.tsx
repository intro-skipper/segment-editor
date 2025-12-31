/**
 * PlayerEditor component.
 * Integrates Player with segment editing functionality.
 * Requirements: 3.2, 3.3, 4.5
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ClipboardPaste, Save } from 'lucide-react'

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
import { useSegments } from '@/hooks/queries/use-segments'
import { useBatchSaveSegments } from '@/hooks/mutations/use-segment-mutations'
import { useAppStore } from '@/stores/app-store'
import { useSessionStore } from '@/stores/session-store'
import { ticksToSeconds } from '@/lib/time-utils'
import { generateUUID, sortSegmentsByStart } from '@/lib/segment-utils'
import { showNotification } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SegmentSlider } from '@/components/segment/SegmentSlider'
import { SegmentEditDialog } from '@/components/segment/SegmentEditDialog'

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
  const navigate = useNavigate()
  const showVideoPlayer = useAppStore((state) => state.showVideoPlayer)
  const { getFromClipboard } = useSessionStore()
  const batchSaveMutation = useBatchSaveSegments()

  // Fetch segments from server
  const { data: serverSegments = [] } = useSegments(item.Id ?? '', {
    enabled: fetchSegments && !!item.Id,
  })

  // Local editing state - segments in seconds for UI
  const [editingSegments, setEditingSegments] = React.useState<
    Array<MediaSegmentDto>
  >([])
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [playerTimestamp, setPlayerTimestamp] = React.useState<
    number | undefined
  >()
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingSegmentIndex, setEditingSegmentIndex] = React.useState<
    number | null
  >(null)

  // Runtime in seconds
  const runtimeSeconds = React.useMemo(() => {
    return ticksToSeconds(item.RunTimeTicks) || 0
  }, [item.RunTimeTicks])

  // Initialize editing segments from server data
  // Note: serverSegments already have times in seconds (converted by the API layer)
  React.useEffect(() => {
    if (serverSegments.length > 0) {
      const sorted = [...serverSegments].sort(sortSegmentsByStart)
      setEditingSegments(sorted)
    }
  }, [serverSegments])

  // Format item title
  const itemTitle = React.useMemo(() => {
    if (item.SeriesName) {
      return `${item.SeriesName} S${item.ParentIndexNumber}E${item.IndexNumber}: ${item.Name}`
    }
    return item.Name ?? 'Unknown'
  }, [item])

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

        const updated = [...prev]
        const segment = updated[activeIndex] as MediaSegmentDto | undefined
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
    setPlayerTimestamp(timestamp)
    // Reset after a short delay
    setTimeout(() => setPlayerTimestamp(undefined), 100)
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

  // Paste from clipboard
  const handlePasteFromClipboard = React.useCallback(() => {
    const clipboardSegment = getFromClipboard()
    if (clipboardSegment) {
      // Clipboard stores segments in seconds (same as editingSegments)
      const newSegment: MediaSegmentDto = {
        ...clipboardSegment,
        Id: generateUUID(),
        ItemId: item.Id,
      }

      setEditingSegments((prev) => {
        const updated = [...prev, newSegment].sort(sortSegmentsByStart)
        const newIndex = updated.findIndex((s) => s.Id === newSegment.Id)
        setActiveIndex(newIndex >= 0 ? newIndex : updated.length - 1)
        return updated
      })

      showNotification({
        type: 'positive',
        message: 'Segment pasted from clipboard',
      })
    } else {
      showNotification({
        type: 'negative',
        message: t('editor.noSegmentInClipboard'),
      })
    }
  }, [getFromClipboard, item.Id, t])

  // Save all segments
  const handleSaveAll = React.useCallback(async () => {
    if (!item.Id) return

    // Note: editingSegments are in seconds, the API layer handles conversion to ticks
    try {
      await batchSaveMutation.mutateAsync({
        itemId: item.Id,
        existingSegments: serverSegments,
        newSegments: editingSegments,
      })

      showNotification({
        type: 'positive',
        message: t('editor.saveSegment'),
      })
    } catch (error) {
      showNotification({
        type: 'negative',
        message: 'Failed to save segments',
      })
    }
  }, [item.Id, editingSegments, serverSegments, batchSaveMutation, t, navigate])

  // Navigate back
  const handleBack = React.useCallback(() => {
    navigate({ to: '/' })
  }, [navigate])

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={handleBack}>
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="text-xl font-semibold truncate">{itemTitle}</h1>
      </div>

      {/* Player */}
      {showVideoPlayer && (
        <Player
          item={item}
          timestamp={playerTimestamp}
          onCreateSegment={handleCreateSegment}
          onUpdateSegmentTimestamp={handleUpdateSegmentTimestamp}
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
        {editingSegments.length === 0 ? (
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
                  item={item}
                  index={index}
                  activeIndex={activeIndex}
                  runtimeSeconds={runtimeSeconds}
                  onUpdate={handleUpdateSegment}
                  onDelete={handleDeleteSegment}
                  onPlayerTimestamp={handlePlayerTimestamp}
                  onSetActive={setActiveIndex}
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
          item={item}
          onClose={handleCloseEditDialog}
          onSave={handleSaveSegmentFromDialog}
          onDelete={handleDeleteSegmentFromDialog}
        />
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
        <Button
          onClick={handleSaveAll}
          disabled={batchSaveMutation.isPending}
          className="w-full sm:w-auto"
        >
          <Save className="size-4 mr-2" />
          {t('editor.saveSegment')}
        </Button>
        <Button
          variant="outline"
          onClick={handlePasteFromClipboard}
          className="w-full sm:w-auto"
        >
          <ClipboardPaste className="size-4 mr-2" />
          Paste
        </Button>
        <Button
          variant="outline"
          onClick={handleBack}
          className="w-full sm:w-auto"
        >
          {t('back')}
        </Button>
      </div>
    </div>
  )
}
