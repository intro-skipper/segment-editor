import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2 } from 'lucide-react'

import { AppearanceSection } from './sections/AppearanceSection'
import { CodecCompatibilitySection } from './sections/CodecCompatibilitySection'
import { LanguageSection } from './sections/LanguageSection'
import { JellyfinPlaybackSyncSection } from './sections/JellyfinPlaybackSyncSection'
import { PageSizeSection } from './sections/PageSizeSection'
import { SegmentSkipModeSection } from './sections/SegmentSkipModeSection'
import { ServerConnectionSection } from './sections/ServerConnectionSection'
import { ViewModeSection } from './sections/ViewModeSection'
import { useSessionStore } from '@/stores/session-store'
import { isPluginMode } from '@/services/jellyfin'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconDisc } from '@/components/ui/icon-disc'

export default function SettingsDialog() {
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLElement | null>(null)

  const settingsOpen = useSessionStore((s) => s.settingsOpen)
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen)

  const pluginMode = isPluginMode()

  const handleOpenChange = (open: boolean) => {
    if (open) {
      const active = document.activeElement
      // Keep the previous trigger when focus sits on a non-HTML element (an
      // inline SVG control, or null mid-transition) so close still restores it.
      if (active instanceof HTMLElement) triggerRef.current = active
    }
    setSettingsOpen(open)
    if (!open) {
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
  }

  return (
    <Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogCloseButton />
        <SettingsHeader title={`${t('app.title')} Settings`} />

        <div className="max-h-(--spacing-popup-max-height) overflow-y-auto px-3 pb-3">
          {!pluginMode && <ServerConnectionSection />}
          <AppearanceSection />
          <LanguageSection />
          <PageSizeSection />
          <ViewModeSection />
          <CodecCompatibilitySection />
          <SegmentSkipModeSection />
          <JellyfinPlaybackSyncSection />
        </div>
        {!pluginMode && (
          <div className="px-5 py-3 border-t border-border/50 text-center">
            <a
              href="https://github.com/intro-skipper/.github/blob/main/PRIVACY.md#website-privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('settings.privacyPolicy', 'Privacy Policy')}
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SettingsHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-3 pr-14">
      <IconDisc tone="primary">
        <Settings2 />
      </IconDisc>
      <div className="min-w-0">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription id="settings-description">
          Configure your preferences
        </DialogDescription>
      </div>
    </div>
  )
}
