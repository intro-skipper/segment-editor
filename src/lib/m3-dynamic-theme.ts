/**
 * Material 3 dynamic color scheme derived from item artwork.
 * Maps M3 dynamic color roles onto the app's shadcn theme tokens so any
 * component consuming the standard tokens picks up the dynamic scheme when
 * rendered inside a DynamicThemeScope.
 */

import {
  Hct,
  MaterialDynamicColors,
  SchemeContent,
  argbFromHex,
  hexFromArgb,
} from '@material/material-color-utilities'
import type { DynamicColor } from '@material/material-color-utilities'

export type DynamicThemeVars = Record<string, string>

/**
 * SchemeContent stays faithful to the artwork hue (the scheme Android uses
 * for media-derived color). Swap for SchemeVibrant/SchemeExpressive here to
 * tune how far the scheme is allowed to drift from the source color.
 */
const SchemeVariant = SchemeContent

const schemeCache = new Map<string, DynamicThemeVars>()

export function buildDynamicThemeVars(
  sourceHex: string,
  isDark: boolean,
): DynamicThemeVars | null {
  const key = `${sourceHex}:${isDark ? 'dark' : 'light'}`
  const cached = schemeCache.get(key)
  if (cached) return cached

  let sourceArgb: number
  try {
    sourceArgb = argbFromHex(sourceHex)
  } catch {
    return null
  }

  // Normalize the seed: artwork swatches can be near-black or washed out,
  // which SchemeContent would faithfully carry into unusable role colors
  // (e.g. a black primary in light mode). Clamping tone and enforcing a
  // minimum chroma preserves the artwork hue while guaranteeing usable
  // tonal palettes in both modes.
  const seed = Hct.fromInt(sourceArgb)
  seed.tone = Math.min(Math.max(seed.tone, 40), 60)
  seed.chroma = Math.max(seed.chroma, 28)

  const scheme = new SchemeVariant(seed, isDark, 0)
  const color = (role: DynamicColor): string =>
    hexFromArgb(role.getArgb(scheme))
  const M = MaterialDynamicColors

  const vars = {
    '--background': color(M.surface),
    '--foreground': color(M.onSurface),
    '--card': color(M.surfaceContainerLow),
    '--card-foreground': color(M.onSurface),
    '--popover': color(M.surfaceContainerHigh),
    '--popover-foreground': color(M.onSurface),
    '--primary': color(M.primary),
    '--primary-foreground': color(M.onPrimary),
    '--secondary': color(M.secondaryContainer),
    '--secondary-foreground': color(M.onSecondaryContainer),
    '--muted': color(M.surfaceContainerHigh),
    '--muted-foreground': color(M.onSurfaceVariant),
    '--accent': color(M.tertiaryContainer),
    '--accent-foreground': color(M.onTertiaryContainer),
    '--border': color(M.outlineVariant),
    '--input': color(M.outlineVariant),
    '--ring': color(M.primary),
  } satisfies DynamicThemeVars

  schemeCache.set(key, vars)
  return vars
}
