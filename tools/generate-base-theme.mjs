/**
 * Generates the app's base (non-dynamic) theme tokens from a single brand
 * seed color through the same Material 3 pipeline as the artwork-derived
 * dynamic schemes (SchemeContent + seed normalization, see
 * src/lib/m3-dynamic-theme.ts). Run with:
 *
 *   node tools/generate-base-theme.mjs
 *
 * and splice the printed blocks into src/styles.css.
 */

import {
  Hct,
  MaterialDynamicColors,
  SchemeContent,
  argbFromHex,
  hexFromArgb,
} from '@material/material-color-utilities'

// The pre-M3 brand primary, oklch(0.6716 0.1368 48.513), as hex.
function oklchToHex(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const toSrgb = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(v * 255)))
  }
  const [r, g, bl] = lin.map(toSrgb)
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const SEED_HEX = oklchToHex(0.6716, 0.1368, 48.513)

// Mirror the seed normalization from src/lib/m3-dynamic-theme.ts
const seed = Hct.fromInt(argbFromHex(SEED_HEX))
seed.tone = Math.min(Math.max(seed.tone, 40), 60)
seed.chroma = Math.max(seed.chroma, 28)

const M = MaterialDynamicColors

function buildTokens(isDark) {
  const scheme = new SchemeContent(seed, isDark, 0)
  const color = (role) => hexFromArgb(role.getArgb(scheme))

  return {
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
    '--destructive': color(M.error),
    '--destructive-foreground': color(M.onError),
    '--border': color(M.outlineVariant),
    '--input': color(M.outlineVariant),
    '--ring': color(M.primary),
    '--chart-1': color(M.primary),
    '--chart-2': color(M.secondary),
    '--chart-3': color(M.tertiary),
    '--chart-4': color(M.error),
    '--chart-5': color(M.outline),
    '--sidebar': color(M.surfaceContainer),
    '--sidebar-foreground': color(M.onSurface),
    '--sidebar-primary': color(M.primary),
    '--sidebar-primary-foreground': color(M.onPrimary),
    '--sidebar-accent': color(M.surfaceContainerHigh),
    '--sidebar-accent-foreground': color(M.onSurface),
    '--sidebar-border': color(M.outlineVariant),
    '--sidebar-ring': color(M.primary),
  }
}

console.log(`/* seed: ${SEED_HEX} (normalized) */`)
for (const isDark of [false, true]) {
  console.log(isDark ? '\n.dark {' : '\n:root {')
  for (const [token, value] of Object.entries(buildTokens(isDark))) {
    console.log(`  ${token}: ${value};`)
  }
  console.log('}')
}
