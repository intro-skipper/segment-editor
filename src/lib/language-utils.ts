/**
 * Language normalization and matching utilities.
 * Used for track preference matching and display.
 *
 * @module lib/language-utils
 */

/**
 * Common language name to ISO 639-1 code mappings.
 * Handles full language names in various languages.
 */
const LANGUAGE_NAME_MAP: Record<string, string> = {
  // English names
  english: 'en',
  german: 'de',
  french: 'fr',
  spanish: 'es',
  italian: 'it',
  portuguese: 'pt',
  russian: 'ru',
  japanese: 'ja',
  chinese: 'zh',
  korean: 'ko',
  dutch: 'nl',
  polish: 'pl',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  arabic: 'ar',
  hebrew: 'he',
  hindi: 'hi',
  thai: 'th',
  vietnamese: 'vi',
  indonesian: 'id',
  turkish: 'tr',
  greek: 'el',
  czech: 'cs',
  hungarian: 'hu',
  romanian: 'ro',
  ukrainian: 'uk',
  // Native names
  deutsch: 'de',
  français: 'fr',
  español: 'es',
  italiano: 'it',
  português: 'pt',
  русский: 'ru',
  日本語: 'ja',
  中文: 'zh',
  한국어: 'ko',
  nederlands: 'nl',
  polski: 'pl',
  svenska: 'sv',
  norsk: 'no',
  dansk: 'da',
  suomi: 'fi',
  العربية: 'ar',
  עברית: 'he',
  हिन्दी: 'hi',
  ไทย: 'th',
  tiếng_việt: 'vi',
  türkçe: 'tr',
  ελληνικά: 'el',
  čeština: 'cs',
  magyar: 'hu',
  română: 'ro',
  українська: 'uk',
}

/**
 * ISO 639-2 (3-letter) to ISO 639-1 (2-letter) code mappings.
 */
const ISO_639_2_TO_1: Record<string, string> = {
  eng: 'en',
  deu: 'de',
  ger: 'de',
  fra: 'fr',
  fre: 'fr',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  rus: 'ru',
  jpn: 'ja',
  zho: 'zh',
  chi: 'zh',
  kor: 'ko',
  nld: 'nl',
  dut: 'nl',
  pol: 'pl',
  swe: 'sv',
  nor: 'no',
  dan: 'da',
  fin: 'fi',
  ara: 'ar',
  heb: 'he',
  hin: 'hi',
  tha: 'th',
  vie: 'vi',
  ind: 'id',
  tur: 'tr',
  ell: 'el',
  gre: 'el',
  ces: 'cs',
  cze: 'cs',
  hun: 'hu',
  ron: 'ro',
  rum: 'ro',
  ukr: 'uk',
  und: 'und', // Undetermined
}

/**
 * Normalizes a language string to a 2-letter ISO 639-1 code.
 * Handles various formats: 'en', 'eng', 'en-US', 'English', etc.
 *
 * @param language - Language string in any supported format
 * @returns Normalized 2-letter code, or null if invalid/empty
 */
export function normalizeLanguage(
  language: string | null | undefined,
): string | null {
  if (!language) return null

  const normalized = language.toLowerCase().trim()
  if (!normalized) return null

  // Check full language name mapping
  if (LANGUAGE_NAME_MAP[normalized]) {
    return LANGUAGE_NAME_MAP[normalized]
  }

  // Check ISO 639-2 (3-letter) mapping
  if (ISO_639_2_TO_1[normalized]) {
    return ISO_639_2_TO_1[normalized]
  }

  // Handle locale format (en-US -> en)
  const dashIndex = normalized.indexOf('-')
  if (dashIndex > 0) {
    return normalized.slice(0, dashIndex)
  }

  // Return first 2 characters for ISO codes
  return normalized.slice(0, 2)
}

/**
 * Checks if two language strings match after normalization.
 *
 * @param lang1 - First language string
 * @param lang2 - Second language string
 * @returns True if languages match, false otherwise
 */
export function languagesMatch(
  lang1: string | null | undefined,
  lang2: string | null | undefined,
): boolean {
  const normalized1 = normalizeLanguage(lang1)
  const normalized2 = normalizeLanguage(lang2)

  if (!normalized1 || !normalized2) return false
  return normalized1 === normalized2
}
