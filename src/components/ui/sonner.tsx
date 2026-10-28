import { Toaster as Sonner } from 'sonner'
import {
  CircleCheckIcon,
  InfoIcon,
  LoaderIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type { ToasterProps } from 'sonner'
import { useAppStore } from '@/stores/app-store'

/**
 * Resolves the theme for sonner based on app store theme setting.
 * Handles 'auto' by detecting system preference.
 */
function resolveTheme(theme: 'auto' | 'dark' | 'light'): 'light' | 'dark' {
  if (theme === 'auto') {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    return 'light'
  }
  return theme
}

/**
 * Toast notification component using sonner.
 * Integrates with the app's theme system via Zustand store.
 * Displays notifications in the bottom-right corner with auto-dismiss,
 * keeping them clear of the header actions.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useAppStore((state) => state.theme)
  const resolvedTheme = resolveTheme(theme)

  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-right"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <LoaderIcon className="size-4" aria-hidden="true" />,
      }}
      style={
        // SAFETY: CSSProperties declares no index signature for custom
        // properties, but React forwards `--*` keys to the DOM untouched.
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border':
            'color-mix(in oklch, var(--foreground) 5%, transparent)',
          '--border-radius': 'calc(var(--radius) + 0.25rem)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
