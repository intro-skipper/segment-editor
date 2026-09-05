import { useTranslation } from 'react-i18next'
import { formatForDisplay } from '@tanstack/react-hotkeys'
import { ClipboardPaste, Loader2, Save, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Pre-computed platform-aware shortcut display for the save button title */
const MOD_S_DISPLAY = formatForDisplay('Mod+S')

/** Sticky bottom toolbar: dirty/saving status plus discard, paste and save. */
export function EditorActionBar({
  isDirty,
  isSaving,
  segmentCount,
  onDiscard,
  onPaste,
  onSave,
}: {
  isDirty: boolean
  isSaving: boolean
  segmentCount: number
  onDiscard: () => void
  onPaste: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()

  return (
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
                count: segmentCount,
                defaultValue: '{{count}} segments',
              })}
            </span>
          )}
        </p>

        <div className="flex items-center gap-2 shrink-0">
          {isDirty && !isSaving && (
            <Button
              variant="ghost"
              onClick={onDiscard}
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
            onClick={onPaste}
            aria-label={t('editor.paste', 'Paste segment from clipboard')}
          >
            <ClipboardPaste className="size-4" aria-hidden="true" />
            {t('editor.paste', 'Paste')}
          </Button>
          <Button
            onClick={onSave}
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
  )
}
