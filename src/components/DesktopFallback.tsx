/**
 * DesktopFallback — Shown when the app is loaded inside a Jellyfin desktop
 * client whose embedded browser lacks the features this app needs.
 * Directs users to open the standalone browser version instead.
 */

import { getStandaloneEditorUrl } from '@/services/jellyfin/core'

export function DesktopFallback() {
  const editorUrl = getStandaloneEditorUrl()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8 font-sans text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-10 text-center">
        <h1 className="mb-3 text-xl font-semibold">Segment Editor</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          This app is not supported in the Jellyfin desktop client. Please open
          it in your browser instead.
        </p>
        <a
          href={editorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-block cursor-pointer rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90"
        >
          Open in Browser
        </a>
        <div className="mt-1 cursor-text select-all break-all rounded-md border border-border bg-background px-4 py-2.5 font-mono text-[0.8125rem] text-muted-foreground">
          {editorUrl}
        </div>
      </div>
    </div>
  )
}
