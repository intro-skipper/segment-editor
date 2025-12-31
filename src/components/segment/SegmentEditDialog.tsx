/**
 * SegmentEditDialog component.
 * Dialog for editing segment details with validation.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Save, Trash2 } from 'lucide-react'

import type {
  BaseItemDto,
  MediaSegmentDto,
  MediaSegmentType,
} from '@/types/jellyfin'
import { formatTime, parseTimeString } from '@/lib/time-utils'
import {
  SEGMENT_TYPES,
  getSegmentColor,
  validateSegment,
} from '@/lib/segment-utils'
import { useSessionStore } from '@/stores/session-store'
import { showNotification } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SegmentEditDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** The segment to edit */
  segment: MediaSegmentDto
  /** The media item this segment belongs to */
  item: BaseItemDto
  /** Callback when dialog is closed */
  onClose: () => void
  /** Callback when segment is saved */
  onSave: (segment: MediaSegmentDto) => void
  /** Callback when segment is deleted */
  onDelete: (segment: MediaSegmentDto) => void
}

/**
 * SegmentEditDialog component.
 * Provides a form for editing segment details with validation.
 */
export function SegmentEditDialog({
  open,
  segment,
  item: _item, // Reserved for future use
  onClose,
  onSave,
  onDelete,
}: SegmentEditDialogProps) {
  const { t } = useTranslation()
  const { saveToClipboard } = useSessionStore()

  // Suppress unused variable warning
  void _item

  // Local editing state
  const [localSegment, setLocalSegment] =
    React.useState<MediaSegmentDto>(segment)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)

  // Sync local state when segment prop changes
  React.useEffect(() => {
    setLocalSegment(segment)
  }, [segment])

  // Computed values
  const startSeconds = localSegment.StartTicks ?? 0
  const endSeconds = localSegment.EndTicks ?? 0
  const duration = endSeconds - startSeconds
  const validation = validateSegment(localSegment)

  // Handle type change
  const handleTypeChange = React.useCallback(
    (value: MediaSegmentType | null) => {
      if (value) {
        setLocalSegment((prev) => ({
          ...prev,
          Type: value,
        }))
      }
    },
    [],
  )

  // Handle start time change
  const handleStartChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseTimeString(e.target.value)
      if (!isNaN(value) && value >= 0) {
        setLocalSegment((prev) => ({
          ...prev,
          StartTicks: value,
        }))
      }
    },
    [],
  )

  // Handle end time change
  const handleEndChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseTimeString(e.target.value)
      if (!isNaN(value) && value >= 0) {
        setLocalSegment((prev) => ({
          ...prev,
          EndTicks: value,
        }))
      }
    },
    [],
  )

  // Handle save
  const handleSave = React.useCallback(() => {
    if (validation.valid) {
      onSave(localSegment)
      onClose()
    }
  }, [validation.valid, localSegment, onSave, onClose])

  // Handle copy to clipboard
  const handleCopy = React.useCallback(() => {
    saveToClipboard(localSegment)
    showNotification({
      type: 'positive',
      message: t('editor.segmentCopiedToClipboard'),
    })
  }, [localSegment, saveToClipboard, t])

  // Handle delete confirmation
  const handleDeleteClick = React.useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  // Handle confirmed delete
  const handleConfirmDelete = React.useCallback(() => {
    onDelete(localSegment)
    setShowDeleteConfirm(false)
    onClose()
  }, [localSegment, onDelete, onClose])

  // Handle cancel delete
  const handleCancelDelete = React.useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  const segmentColor = getSegmentColor(localSegment.Type)

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t('segment.edit')}
              <Badge
                variant="outline"
                className={cn('text-white border-0 ml-2', segmentColor)}
              >
                {localSegment.Type}
              </Badge>
            </DialogTitle>
            <DialogDescription>{t('editor.slider.title')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Segment Type */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
              <Label htmlFor="segment-type" className="sm:text-right">
                {t('segment.type')}
              </Label>
              <div className="sm:col-span-3">
                <Select
                  value={localSegment.Type ?? 'Unknown'}
                  onValueChange={handleTypeChange}
                >
                  <SelectTrigger id="segment-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEGMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'size-3 rounded-full',
                              getSegmentColor(type),
                            )}
                          />
                          {type}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Start Time */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
              <Label htmlFor="segment-start" className="sm:text-right">
                {t('segment.start')}
              </Label>
              <div className="sm:col-span-3 flex items-center gap-2">
                <Input
                  id="segment-start"
                  type="number"
                  step="0.001"
                  min="0"
                  value={startSeconds.toFixed(3)}
                  onChange={handleStartChange}
                  className="font-mono flex-1"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatTime(startSeconds)}
                </span>
              </div>
            </div>

            {/* End Time */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
              <Label htmlFor="segment-end" className="sm:text-right">
                {t('segment.end')}
              </Label>
              <div className="sm:col-span-3 flex items-center gap-2">
                <Input
                  id="segment-end"
                  type="number"
                  step="0.001"
                  min="0"
                  value={endSeconds.toFixed(3)}
                  onChange={handleEndChange}
                  className="font-mono flex-1"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatTime(endSeconds)}
                </span>
              </div>
            </div>

            {/* Duration (read-only) */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
              <Label className="sm:text-right">{t('segment.duration')}</Label>
              <div className="sm:col-span-3">
                <span className="text-sm font-mono">
                  {formatTime(duration)}
                </span>
                <span className="text-sm text-muted-foreground ml-2">
                  ({duration.toFixed(3)}s)
                </span>
              </div>
            </div>

            {/* Validation Error */}
            {!validation.valid && (
              <div className="col-span-full">
                <p className="text-sm text-destructive text-center">
                  {validation.error ?? t('validation.StartEnd')}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-3 sm:flex-row sm:gap-2">
            <div className="flex gap-2 w-full sm:w-auto sm:flex-1 order-2 sm:order-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="flex-1 sm:flex-none"
              >
                <Copy className="size-4 mr-2" />
                Copy
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteClick}
                className="flex-1 sm:flex-none"
              >
                <Trash2 className="size-4 mr-2" />
                Delete
              </Button>
            </div>
            <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 sm:flex-none"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!validation.valid}
                className="flex-1 sm:flex-none"
              >
                <Save className="size-4 mr-2" />
                {t('editor.saveSegment')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('editor.deleteSureTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('editor.deleteSure', { Type: localSegment.Type })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>
              {t('no')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              {t('yes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
