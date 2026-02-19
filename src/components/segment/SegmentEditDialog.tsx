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
  DialogCloseButton,
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

interface SegmentEditDialogProps {
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

  const [localSegment, setLocalSegment] =
    React.useState<MediaSegmentDto>(segment)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [startText, setStartText] = React.useState(() =>
    String(segment.StartTicks ?? 0),
  )
  const [endText, setEndText] = React.useState(() =>
    String(segment.EndTicks ?? 0),
  )

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
      <SegmentEditDialogBody
        open={open}
        localSegment={localSegment}
        segmentColor={segmentColor}
        validation={validation}
        startInputRef={startInputRef}
        startText={startText}
        endText={endText}
        startSeconds={startSeconds}
        endSeconds={endSeconds}
        duration={duration}
        onClose={handleClose}
        onSave={handleSave}
        onCopy={handleCopy}
        onSetType={(type) =>
          setLocalSegment((prev) => ({ ...prev, Type: type }))
        }
        onSetStartText={setStartText}
        onSetEndText={setEndText}
        onCommitTime={commitTime}
        onOpenDeleteConfirm={() => setShowDeleteConfirm(true)}
        t={t}
      />

      <SegmentDeleteConfirmDialog
        open={showDeleteConfirm}
        segmentType={localSegment.Type}
        onOpenChange={setShowDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        t={t}
      />
    </>
  )
}

interface SegmentEditDialogBodyProps {
  open: boolean
  localSegment: MediaSegmentDto
  segmentColor: string
  validation: ReturnType<typeof validateSegment>
  startInputRef: React.RefObject<HTMLInputElement | null>
  startText: string
  endText: string
  startSeconds: number
  endSeconds: number
  duration: number
  onClose: () => void
  onSave: () => void
  onCopy: () => void
  onSetType: (type: MediaSegmentType) => void
  onSetStartText: (value: string) => void
  onSetEndText: (value: string) => void
  onCommitTime: (field: 'start' | 'end', text: string) => void
  onOpenDeleteConfirm: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function SegmentEditDialogBody({
  open,
  localSegment,
  segmentColor,
  validation,
  startInputRef,
  startText,
  endText,
  startSeconds,
  endSeconds,
  duration,
  onClose,
  onSave,
  onCopy,
  onSetType,
  onSetStartText,
  onSetEndText,
  onCommitTime,
  onOpenDeleteConfirm,
  t,
}: SegmentEditDialogBodyProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogCloseButton />
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
          <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
            <Label htmlFor="segment-type" className="sm:text-right">
              {t('segment.type')}
            </Label>
            <div className="sm:col-span-3">
              <Select
                value={localSegment.Type ?? 'Unknown'}
                onValueChange={(value) =>
                  value && onSetType(value as MediaSegmentType)
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
                onChange={(e) => onSetStartText(e.target.value)}
                onBlur={() => onCommitTime('start', startText)}
                className="font-mono flex-1"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {formatTime(startSeconds)}
              </span>
            </div>
          </div>

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
                onChange={(e) => onSetEndText(e.target.value)}
                onBlur={() => onCommitTime('end', endText)}
                className="font-mono flex-1"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {formatTime(endSeconds)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
            <Label className="sm:text-right">{t('segment.duration')}</Label>
            <div className="sm:col-span-3">
              <span className="text-sm font-mono">{formatTime(duration)}</span>
              <span className="text-sm text-muted-foreground ml-2">
                ({duration.toFixed(3)}s)
              </span>
            </div>
          </div>

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
              onClick={onCopy}
              className="flex-1 sm:flex-none"
            >
              <Copy className="size-4 mr-2" />
              Copy
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onOpenDeleteConfirm}
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
              onClick={onSave}
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
  )
}

interface SegmentDeleteConfirmDialogProps {
  open: boolean
  segmentType: MediaSegmentType | undefined
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onConfirm: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function SegmentDeleteConfirmDialog({
  open,
  segmentType,
  onOpenChange,
  onCancel,
  onConfirm,
  t,
}: SegmentDeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('editor.deleteSureTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('editor.deleteSure', { Type: segmentType })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('no')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('yes')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
