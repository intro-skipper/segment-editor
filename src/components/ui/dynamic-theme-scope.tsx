import type { ReactNode } from 'react'

import { useResolvedTheme } from '@/hooks/use-artwork-color'
import { buildDynamicThemeVars } from '@/lib/m3-dynamic-theme'
import { cn } from '@/lib/utils'

interface DynamicThemeScopeProps {
  seedColor: string | null
  className?: string
  children: ReactNode
}

/**
 * Scopes the app's theme tokens to a Material 3 dynamic scheme derived from
 * item artwork. Components inside consume the same shadcn tokens as
 * everywhere else, so the scheme reaches every primary, accent, surface,
 * border, and focus ring without per-component styling. Renders children on
 * the neutral base theme when no seed color is available (loading, no
 * artwork, or monochrome mode).
 */
export function DynamicThemeScope({
  seedColor,
  className,
  children,
}: DynamicThemeScopeProps) {
  const isDark = useResolvedTheme() === 'dark'
  const vars = seedColor ? buildDynamicThemeVars(seedColor, isDark) : null

  return (
    <div
      className={cn(
        'bg-background text-foreground transition-colors duration-500',
        className,
      )}
      style={vars ?? undefined}
    >
      {children}
    </div>
  )
}
