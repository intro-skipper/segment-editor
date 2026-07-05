import type { CSSProperties, ReactNode } from 'react'

import type { VibrantColors } from '@/hooks/use-vibrant-color'
import { resolveTheme } from '@/hooks/use-vibrant-color'
import { buildDynamicThemeVars } from '@/lib/m3-dynamic-theme'
import { cn } from '@/lib/utils'
import { selectTheme, useAppStore } from '@/stores/app-store'

interface DynamicThemeScopeProps {
  colors: VibrantColors | null
  className?: string
  children: ReactNode
}

/**
 * Scopes the app's theme tokens to a Material 3 dynamic scheme derived from
 * item artwork. Components inside consume the same shadcn tokens as
 * everywhere else, so the scheme reaches every primary, accent, surface,
 * border, and focus ring without per-component styling. Renders children on
 * the neutral base theme when colors are unavailable (loading, no artwork,
 * or monochrome mode).
 */
export function DynamicThemeScope({
  colors,
  className,
  children,
}: DynamicThemeScopeProps) {
  const theme = useAppStore(selectTheme)
  const isDark = resolveTheme(theme) === 'dark'
  const vars = colors ? buildDynamicThemeVars(colors.accent, isDark) : null

  return (
    <div
      className={cn(
        'bg-background text-foreground transition-colors duration-500',
        className,
      )}
      style={(vars ?? undefined) as CSSProperties | undefined}
    >
      {children}
    </div>
  )
}
