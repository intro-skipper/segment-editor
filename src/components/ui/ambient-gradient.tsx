import type { VibrantColors } from '@/hooks/use-vibrant-color'

/**
 * Non-interactive ambient color wash for detail pages.
 * Renders a top gradient strip derived from the item artwork while the page
 * itself stays on neutral theme surfaces.
 */
export function AmbientGradient({ colors }: { colors: VibrantColors | null }) {
  if (!colors) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[45vh]"
      style={{
        background: `linear-gradient(to bottom, color-mix(in oklab, ${colors.background} 45%, transparent), transparent)`,
      }}
    />
  )
}
