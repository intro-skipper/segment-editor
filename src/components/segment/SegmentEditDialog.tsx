/**
 * SegmentEditDialog - Dialog for editing segment details with validation.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Save, Trash2 } from 'lucide-react'

import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import { formatTime, parseTimeString } from '@/lib/time-utils'
import {
  SEGMENT_TYPES,
  getSegmentColor,
  validateSegment,
} from '@/lib/segment-utils'
import { segmentsToIntroSkipperClipboardText } from '@/services/plugins/intro-skipper'
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
  open: boolean
  segment: MediaSegmentDto
  onClose: () => void
  onSave: (segment: MediaSegmentDto) => void
  onDelete: (segment: MediaSegmentDto) => void
}

export function SegmentEditDialog({
  open,
  segment,
  onClose,
  onSave,
  onDelete,
}: SegmentEditDialogProps) {
  const { t } = useTranslation()
  const startInputRef = React.useRef<HTMLInputElement>(null)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const prevSegmentRef = React.useRef(segment)

  const [localSegment, setLocalSegment] =
    React.useState<MediaSegmentDto>(segment)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [startText, setStartText] = React.useState(() =>
    String(segment.StartTicks ?? 0),
  )
  const [endText, setEndText] = React.useState(() =>
    String(segment.EndTicks ?? 0),
  )

  // Sync local state when segment prop changes
  if (segment !== prevSegmentRef.current) {
    prevSegmentRef.current = segment
    setLocalSegment(segment)
    setStartText(String(segment.StartTicks ?? 0))
    setEndText(String(segment.EndTicks ?? 0))
  }

  // Store the trigger element when dialog opens for focus restoration
  React.useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement
    }
  }, [open])

  // Auto-focus start input when dialog opens
  React.useEffect(() => {
    if (!open) return
    const timeoutId = window.setTimeout(() => startInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [open])

  // Handle dialog close with focus restoration
  const handleClose = React.useCallback(() => {
    onClose()
    // Restore focus to the element that triggered the dialog
    // Use requestAnimationFrame for better timing than setTimeout
    requestAnimationFrame(() => {
      triggerRef.current?.focus()
    })
  }, [onClose])

  // Computed values
  const { startSeconds, endSeconds, duration, validation } =
    React.useMemo(() => {
      const start = localSegment.StartTicks ?? 0
      const end = localSegment.EndTicks ?? 0
      return {
        startSeconds: start,
        endSeconds: end,
        duration: end - start,
        validation: validateSegment(localSegment),
      }
    }, [localSegment])

  const commitTime = React.useCallback(
    (field: 'start' | 'end', text: string) => {
      const value = parseTimeString(text)
      if (value < 0) return
      setLocalSegment((prev) => ({
        ...prev,
        [field === 'start' ? 'StartTicks' : 'EndTicks']: value,
      }))
    },
    [],
  )

  const handleSave = React.useCallback(() => {
    commitTime('start', startText)
    commitTime('end', endText)
    if (validation.valid) {
      onSave(localSegment)
      handleClose()
    }
  }, [
    commitTime,
    startText,
    endText,
    validation.valid,
    localSegment,
    onSave,
    handleClose,
  ])

  const handleCopy = React.useCallback(async () => {
    try {
      const result = segmentsToIntroSkipperClipboardText([localSegment])
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
  }, [localSegment, t])

  const handleConfirmDelete = React.useCallback(() => {
    onDelete(localSegment)
    setShowDeleteConfirm(false)
    handleClose()
  }, [localSegment, onDelete, handleClose])

  const segmentColor = getSegmentColor(localSegment.Type)

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
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

          <div
            className="grid gap-4 py-4"
            aria-describedby={
              !validation.valid ? 'segment-validation-error' : undefined
            }
          >
            {/* Segment Type */}
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
              <Label htmlFor="segment-type" className="sm:text-right">
                {t('segment.type')}
              </Label>
              <div className="sm:col-span-3">
                <Select
                  value={localSegment.Type ?? 'Unknown'}
                  onValueChange={(v) =>
                    v &&
                    setLocalSegment((prev) => ({
                      ...prev,
                      Type: v as MediaSegmentType,
                    }))
                  }
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
                  ref={startInputRef}
                  type="text"
                  inputMode="decimal"
                  value={startText}
                  onChange={(e) => setStartText(e.target.value)}
                  onBlur={() => commitTime('start', startText)}
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
                  type="text"
                  inputMode="decimal"
                  value={endText}
                  onChange={(e) => setEndText(e.target.value)}
                  onBlur={() => commitTime('end', endText)}
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
              <p
                id="segment-validation-error"
                role="alert"
                className="text-sm text-destructive text-center col-span-full"
              >
                {validation.error ?? t('validation.StartEnd')}
              </p>
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
                onClick={() => setShowDeleteConfirm(true)}
                className="flex-1 sm:flex-none"
              >
                <Trash2 className="size-4 mr-2" />
                Delete
              </Button>
            </div>
            <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
              <Button
                variant="outline"
                onClick={handleClose}
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
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>
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
