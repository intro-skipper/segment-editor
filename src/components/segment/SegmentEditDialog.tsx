/**
 * SegmentEditDialog - Dialog for editing segment details with validation.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Save, Trash2 } from 'lucide-react'
import { useForm, useStore } from '@tanstack/react-form'

import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import { formatTime } from '@/lib/time-utils'
import {
  buildSegmentFromFormValues,
  createSegmentFormSchema,
  getSegmentDraftState,
  getSegmentFormDefaults,
} from '@/lib/forms/segment-form'
import { SEGMENT_TYPES, getSegmentColor } from '@/lib/segment-utils'
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
  const wasOpenRef = React.useRef(open)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)

  const form = useForm({
    defaultValues: getSegmentFormDefaults(segment),
    validators: {
      onSubmit: createSegmentFormSchema(),
    },
    onSubmit: ({ value }) => {
      const result = buildSegmentFromFormValues(segment, value)
      if (!result.success) return
      onSave(result.segment)
      handleClose()
    },
  })

  const values = useStore(form.store, (state) => state.values)
  const isDirty = useStore(form.store, (state) => state.isDirty)
  const { draftRange, validation } = React.useMemo(
    () =>
      getSegmentDraftState(values, {
        startSeconds: segment.StartTicks ?? 0,
        endSeconds: segment.EndTicks ?? 0,
      }),
    [segment.EndTicks, segment.StartTicks, values],
  )
  const segmentColor = getSegmentColor(values.type)
  const rawDuration = draftRange.endSeconds - draftRange.startSeconds
  const duration = Math.max(0, rawDuration)

  const handleClose = React.useCallback(() => {
    onClose()
    requestAnimationFrame(() => {
      triggerRef.current?.focus()
    })
  }, [onClose])

  React.useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement
    }
  }, [open])

  React.useEffect(() => {
    const justOpened = open && !wasOpenRef.current
    wasOpenRef.current = open

    if (!open) return
    if (justOpened) {
      form.reset(getSegmentFormDefaults(segment))
      return
    }
    if (isDirty) return
    form.reset(getSegmentFormDefaults(segment))
  }, [
    form,
    isDirty,
    open,
    segment.EndTicks,
    segment.Id,
    segment.StartTicks,
    segment.Type,
  ])

  const handleSave = React.useCallback(() => {
    void form.handleSubmit()
  }, [form])

  const handleCopy = React.useCallback(async () => {
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

  function handleConfirmDelete() {
    onDelete(segment)
    setShowDeleteConfirm(false)
    handleClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="sm:max-w-md" initialFocus={startInputRef}>
          <DialogCloseButton />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t('segment.edit')}
              <Badge
                variant="outline"
                className={cn('text-white border-0 ml-2', segmentColor)}
              >
                {values.type}
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
            <form.Field name="type">
              {(field) => (
                <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                  <Label htmlFor="segment-type" className="sm:text-right">
                    {t('segment.type')}
                  </Label>
                  <div className="sm:col-span-3">
                    <Select
                      value={String(field.state.value)}
                      onValueChange={(value) =>
                        value && field.handleChange(value as MediaSegmentType)
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
              )}
            </form.Field>

            <form.Field name="startText">
              {(field) => (
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
                      value={String(field.state.value)}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className="font-mono flex-1"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatTime(draftRange.startSeconds)}
                    </span>
                  </div>
                </div>
              )}
            </form.Field>

            <form.Field name="endText">
              {(field) => (
                <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                  <Label htmlFor="segment-end" className="sm:text-right">
                    {t('segment.end')}
                  </Label>
                  <div className="sm:col-span-3 flex items-center gap-2">
                    <Input
                      id="segment-end"
                      type="text"
                      inputMode="decimal"
                      value={String(field.state.value)}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className="font-mono flex-1"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatTime(draftRange.endSeconds)}
                    </span>
                  </div>
                </div>
              )}
            </form.Field>

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

      <SegmentDeleteConfirmDialog
        open={showDeleteConfirm}
        segmentType={values.type}
        onOpenChange={setShowDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        t={t}
      />
    </>
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
