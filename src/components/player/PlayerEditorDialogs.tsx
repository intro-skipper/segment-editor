/**
 * The confirmation dialogs PlayerEditor opens: clipboard import and the
 * unsaved-changes navigation guard. Segment deletion reuses
 * SegmentDeleteConfirmDialog from SegmentEditDialog.
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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

/** Title + description alert with the footer buttons as children. */
function EditorAlertDialog({
  open,
  onDismiss,
  title,
  description,
  children,
}: {
  open: boolean
  /** Called when the dialog is closed by escape, overlay click, etc. */
  onDismiss: () => void
  title: ReactNode
  description: ReactNode
  children: ReactNode
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDismiss()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>{children}</AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function ImportSegmentsDialog({
  open,
  existingCount,
  onDismiss,
  onMerge,
  onReplace,
}: {
  open: boolean
  existingCount: number
  onDismiss: () => void
  onMerge: () => void
  onReplace: () => void
}) {
  const { t } = useTranslation()

  return (
    <EditorAlertDialog
      open={open}
      onDismiss={onDismiss}
      title={t('editor.importTitle', 'Import Segments')}
      description={t(
        'editor.importDescription',
        `You have ${existingCount} existing segments. Would you like to replace them or merge with the imported segments?`,
      )}
    >
      <AlertDialogCancel onClick={onDismiss}>
        {t('common.cancel', 'Cancel')}
      </AlertDialogCancel>
      <AlertDialogAction variant="outline" onClick={onMerge}>
        {t('editor.importMerge', 'Merge')}
      </AlertDialogAction>
      <AlertDialogAction onClick={onReplace}>
        {t('editor.importReplace', 'Replace')}
      </AlertDialogAction>
    </EditorAlertDialog>
  )
}

/**
 * Navigation guard shown while edits are unsaved. During an in-flight save
 * the only exits are "stay" and "leave" (the save finishes in the
 * background); otherwise leaving discards the local edits.
 */
export function UnsavedChangesDialog({
  open,
  isSaving,
  onStay,
  onLeave,
  onDiscardAndLeave,
}: {
  open: boolean
  isSaving: boolean
  onStay: () => void
  onLeave: () => void
  onDiscardAndLeave: () => void
}) {
  const { t } = useTranslation()

  return (
    <EditorAlertDialog
      open={open}
      onDismiss={onStay}
      title={
        isSaving
          ? t('editor.saveInProgressTitle', 'Save in progress')
          : t('editor.unsavedTitle', 'Discard unsaved changes?')
      }
      description={
        isSaving
          ? t(
              'editor.saveInProgressDescription',
              'Your segment edits are still being saved. If you leave now, the save will finish in the background.',
            )
          : t(
              'editor.unsavedDescription',
              'You have unsaved segment edits. They will be lost if you leave.',
            )
      }
    >
      <AlertDialogCancel onClick={onStay}>
        {isSaving ? t('editor.stay', 'Stay') : t('common.cancel', 'Cancel')}
      </AlertDialogCancel>
      {isSaving ? (
        // Cancelling the batch save is not safe: it deletes the
        // existing segments before recreating them, so an abort between
        // the two phases would wipe the item's segments remotely.
        // Leaving lets the in-flight save finish in the background.
        <AlertDialogAction onClick={onLeave}>
          {t('editor.leave', 'Leave')}
        </AlertDialogAction>
      ) : (
        <AlertDialogAction variant="destructive" onClick={onDiscardAndLeave}>
          {t('editor.discardAndLeave', 'Discard & leave')}
        </AlertDialogAction>
      )}
    </EditorAlertDialog>
  )
}
