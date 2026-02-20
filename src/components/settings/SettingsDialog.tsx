import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2 } from 'lucide-react'

import {
  AppearanceSection,
  CodecCompatibilitySection,
  LanguageSection,
  PageSizeSection,
  ServerConnectionSection,
} from './sections'
import { useSessionStore } from '@/stores/session-store'
import { isPluginContext } from '@/services/jellyfin'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { withErrorBoundary } from '@/components/with-error-boundary'

// Stable: plugin context is determined by build/runtime and never changes after init
const PLUGIN_MODE = isPluginContext()

function SettingsDialogBase() {
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLElement | null>(null)

  const settingsOpen = useSessionStore((s) => s.settingsOpen)
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen)

  const pluginMode = PLUGIN_MODE

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        triggerRef.current = document.activeElement as HTMLElement
      }
      setSettingsOpen(open)
      if (!open) {
        requestAnimationFrame(() => triggerRef.current?.focus())
      }
    },
    [setSettingsOpen],
  )

  return (
    <Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md p-0 bg-popover/95 backdrop-blur-xl border-border/50 shadow-2xl overflow-hidden"
        aria-describedby="settings-description"
      >
        <SettingsHeader title={`${t('app.title')} Settings`} />

        <div className="max-h-[min(480px,70vh)] overflow-y-auto px-3 pb-3">
          {!pluginMode && <ServerConnectionSection />}
          <AppearanceSection />
          <LanguageSection />
          <PageSizeSection />
          <CodecCompatibilitySection />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SettingsHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-3">
      <div className="size-10 rounded-xl bg-primary/15 flex items-center justify-center">
        <Settings2 className="size-5 text-primary" />
      </div>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p id="settings-description" className="text-xs text-muted-foreground">
          Configure your preferences
        </p>
      </div>
    </div>
  )
}

// Wrap with error boundary for reliability
export const SettingsDialog = withErrorBoundary(SettingsDialogBase)
