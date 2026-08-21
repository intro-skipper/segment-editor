/**
 * Shared resolution for the fake i18next `t` used across component tests.
 *
 * Real `t` takes either a literal fallback string or an options object whose
 * `defaultValue` is the fallback and whose remaining entries are interpolation
 * params. Centralising that here lets each suite declare only the handful of
 * keys it actually asserts on.
 */

/** Interpolation params, plus the optional literal fallback i18next reads. */
export interface TranslationOptions {
  defaultValue?: string
  [param: string]: string | number | undefined
}

/** The second argument of `t`: a literal fallback, options, or nothing. */
export type TranslationArg = string | TranslationOptions | undefined

/** True when `t`'s second argument is the options object rather than a string. */
export const isTranslationOptions = (
  arg: TranslationArg,
): arg is TranslationOptions => arg !== undefined && arg instanceof Object

/**
 * Resolves `t(key, arg)` the way i18next would for an untranslated key: a
 * literal fallback wins, then `defaultValue` with `{{param}}` placeholders
 * interpolated, and finally the key itself.
 */
export function resolveTranslation(key: string, arg?: TranslationArg): string {
  if (arg === undefined) return key
  if (!isTranslationOptions(arg)) return arg

  const { defaultValue, ...params } = arg
  let text = defaultValue ?? key
  for (const [name, value] of Object.entries(params)) {
    // An explicitly-undefined param is a missing param, not the text
    // "undefined"; leave its placeholder for the assertion to catch.
    if (value === undefined) continue
    text = text.replaceAll(`{{${name}}}`, String(value))
  }
  return text
}
