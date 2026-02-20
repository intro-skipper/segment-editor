import { Toaster as Sonner } from 'sonner'
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
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
 * Displays notifications in the top-right corner with auto-dismiss.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useAppStore((state) => state.theme)
  const resolvedTheme = resolveTheme(theme)

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position="top-right"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: (
          <div className="animate-spin" aria-hidden>
            <Loader2Icon className="size-4" />
          </div>
        ),
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
