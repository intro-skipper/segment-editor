import { useTranslation } from 'react-i18next'
import { formatForDisplay } from '@tanstack/react-hotkeys'
import type React from 'react'

import { PLAYER_SHORTCUT_GROUPS } from '@/lib/player-shortcuts'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

const SHORTCUT_GROUPS_DISPLAY = PLAYER_SHORTCUT_GROUPS.map((group) => ({
  labelKey: group.labelKey,
  shortcuts: group.shortcuts.map((shortcut) => ({
    labelKey: shortcut.labelKey,
    displayKeys: shortcut.hotkeys.map((hotkey) => formatForDisplay(hotkey)),
  })),
}))

/** Every player-page shortcut, grouped by task. Pass the fullscreen element as `container` in fullscreen; otherwise it portals to body, above any open dialog. */
export function PlayerShortcutsDialog({
  open,
  onOpenChange,
  container,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  container: React.RefObject<HTMLElement | null> | undefined
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={container} className="sm:max-w-3xl">
        <DialogCloseButton />
        <div className="flex flex-col gap-6">
          <DialogTitle>{t('player.keyboardShortcuts')}</DialogTitle>
          <div className="flex flex-wrap gap-x-8 gap-y-6">
            {SHORTCUT_GROUPS_DISPLAY.map((group) => (
              <section key={group.labelKey} className="flex-1 basis-52">
                <h3 className="text-xs font-semibold mbe-1">
                  {t(group.labelKey)}
                </h3>
                <dl>
                  {group.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.labelKey}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <dt className="min-w-0">{t(shortcut.labelKey)}</dt>
                      <dd className="flex shrink-0 gap-1">
                        {shortcut.displayKeys.map((key) => (
                          <kbd key={key}>{key}</kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
