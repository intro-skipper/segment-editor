/**
 * DesktopFallback — Shown when the app is loaded inside a Jellyfin desktop
 * client whose embedded browser lacks the features this app needs.
 * Directs users to open the standalone browser version instead.
 */

import { MonitorX } from 'lucide-react'

import { getStandaloneEditorUrl } from '@/services/jellyfin/core'
import { buttonVariants } from '@/components/ui/button-variants'
import { ErrorCard } from '@/components/ui/error-card'

export function DesktopFallback() {
  const editorUrl = getStandaloneEditorUrl()

  return (
    <div className="flex min-h-dvh flex-col">
      <ErrorCard
        icon={<MonitorX />}
        tone="muted"
        title={<h1>Segment Editor</h1>}
        description="This app is not supported in the Jellyfin desktop client. Please open it in your browser instead."
        actions={
          <a
            href={editorUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-interactive-transition="true"
            className={buttonVariants({ size: 'lg' })}
          >
            Open in Browser
          </a>
        }
      >
        <div className="mbe-4 cursor-text select-all break-all rounded-2xl border border-input bg-input/30 px-4 py-2.5 font-mono text-xs text-muted-foreground">
          {editorUrl}
        </div>
      </ErrorCard>
    </div>
  )
}
