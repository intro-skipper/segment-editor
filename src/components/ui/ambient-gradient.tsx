import { formatRgb, parse } from 'culori'

import type { VibrantColors } from '@/hooks/use-vibrant-color'

/**
 * Alpha applied to the artwork color at the top of the wash before it fades
 * to transparent.
 */
const WASH_ALPHA = 0.45

/**
 * Vibrant backgrounds are plain hex strings, so the translucent gradient stop
 * can be precomputed as an rgba() color. This keeps the wash working in
 * engines without `color-mix()` support (pre-2023 browsers and webviews).
 */
function washColor(color: string): string | null {
  const parsed = parse(color)
  if (!parsed) return null
  return formatRgb({ ...parsed, alpha: WASH_ALPHA })
}

/**
 * Non-interactive ambient color wash for detail pages.
 * Renders a top gradient strip derived from the item artwork while the page
 * itself stays on neutral theme surfaces.
 */
export function AmbientGradient({ colors }: { colors: VibrantColors | null }) {
  if (!colors) return null

  const stop = washColor(colors.background)
  if (!stop) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[45vh]"
      style={{
        background: `linear-gradient(to bottom, ${stop}, transparent)`,
      }}
    />
  )
}
