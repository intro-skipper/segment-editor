/**
 * Time conversion and formatting utilities.
 * Jellyfin uses .NET ticks (100-nanosecond intervals) for time values.
 * 1 tick = 100 nanoseconds = 0.0000001 seconds
 * 1 second = 10,000,000 ticks
 */

/** Ticks per second constant for .NET tick conversion */
const TICKS_PER_SECOND = 10_000_000

/** Maximum safe tick value to prevent overflow */
const MAX_SAFE_TICKS = Number.MAX_SAFE_INTEGER

/** Maximum safe seconds value (roughly 285 years) */
const MAX_SAFE_SECONDS = MAX_SAFE_TICKS / TICKS_PER_SECOND

/** Minimum valid time value (0) */
const MIN_TIME_VALUE = 0

/**
 * Safely converts a value to a finite number.
 * Returns 0 for null, undefined, NaN, Infinity, or non-numeric values.
 * @param value - Any value to convert
 * @returns A finite number, or 0 for invalid inputs
 */
export function toSafeNumber(value: unknown): number {
  if (value == null) return 0
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

/**
 * Clamps a number to a valid time range [0, max].
 * @param value - The value to clamp
 * @param max - Maximum allowed value (defaults to MAX_SAFE_SECONDS)
 * @returns Clamped value within valid range
 */
function clampToTimeRange(
  value: number,
  max: number = MAX_SAFE_SECONDS,
): number {
  const safeValue = toSafeNumber(value)
  const safeMax = toSafeNumber(max)
  return Math.max(MIN_TIME_VALUE, Math.min(safeValue, safeMax))
}

/**
 * Converts .NET ticks to seconds.
 * Returns 0 for invalid inputs (null, undefined, NaN, Infinity, negative).
 * @param ticks - Tick value to convert
 * @returns Seconds value, clamped to valid range [0, MAX_SAFE_SECONDS]
 */
export function ticksToSeconds(ticks: number | null | undefined): number {
  const safeTicks = toSafeNumber(ticks)
  if (safeTicks < MIN_TIME_VALUE) return 0
  if (safeTicks > MAX_SAFE_TICKS) return MAX_SAFE_SECONDS
  return safeTicks / TICKS_PER_SECOND
}

/**
 * Converts seconds to .NET ticks.
 * Returns 0 for invalid inputs (null, undefined, NaN, Infinity, negative).
 * Clamps to MAX_SAFE_INTEGER to prevent overflow.
 * @param seconds - Seconds value to convert
 * @returns Tick value, clamped to valid range [0, MAX_SAFE_TICKS]
 */
export function secondsToTicks(seconds: number | null | undefined): number {
  const safeSeconds = toSafeNumber(seconds)
  if (safeSeconds < MIN_TIME_VALUE) return 0
  if (safeSeconds > MAX_SAFE_SECONDS) return MAX_SAFE_TICKS
  return Math.round(safeSeconds * TICKS_PER_SECOND)
}

/**
 * Formats seconds into a time string like '01:20:15.123' or '20:15.123'.
 * Returns '00:00.000' for invalid inputs (NaN, Infinity, negative).
 * @param timeInSeconds - Time value in seconds
 * @returns Formatted time string
 */
export function formatTime(timeInSeconds: number): string {
  const time = clampToTimeRange(timeInSeconds)

  const hours = Math.floor(time / 3600)
  const minutes = Math.floor((time % 3600) / 60)
  const seconds = Math.floor(time % 60)
  const milliseconds = Math.round((time % 1) * 1000)

  const mm = minutes.toString().padStart(2, '0')
  const ss = seconds.toString().padStart(2, '0')
  const ms = milliseconds.toString().padStart(3, '0')

  if (hours > 0) {
    const hh = hours.toString().padStart(2, '0')
    return `${hh}:${mm}:${ss}.${ms}`
  }

  return `${mm}:${ss}.${ms}`
}

/**
 * Formats seconds into a human-readable time string like '1h 10m 20s'.
 * Returns '0s' for invalid inputs (NaN, Infinity, negative).
 * @param timeInSeconds - Time value in seconds
 * @returns Human-readable time string
 */
export function formatReadableTime(timeInSeconds: number): string {
  const time = clampToTimeRange(timeInSeconds)

  const hours = Math.floor(time / 3600)
  const minutes = Math.floor((time % 3600) / 60)
  const seconds = Math.floor(time % 60)

  const parts: Array<string> = [
    hours > 0 && `${hours}h`,
    minutes > 0 && `${minutes}m`,
    (seconds > 0 || (!hours && !minutes)) && `${seconds}s`,
  ].filter(Boolean) as Array<string>

  return parts.join(' ')
}

/** Time multipliers: [seconds, minutes, hours] */
const TIME_MULTIPLIERS = [1, 60, 3600] as const

/**
 * Parses time parts into total seconds.
 * @param parts - Array of time string parts (e.g., ['1', '30', '45'])
 * @returns Total seconds calculated from parts
 */
function parseTimeParts(parts: Array<string>): number {
  return parts.reverse().reduce((sum, part, i) => {
    const parsed = parseFloat(part)
    // Skip invalid parts (NaN, Infinity)
    if (!Number.isFinite(parsed)) return sum
    const multiplier = TIME_MULTIPLIERS[i] ?? 0
    return sum + parsed * multiplier
  }, 0)
}

/**
 * Parses a time string into seconds.
 * Supports formats: '1:20:15', '1:20:15.500', '20:15', '15', space-separated variants
 * Returns 0 for invalid inputs (null, undefined, NaN, Infinity, empty string).
 * @param time - Time string or number to parse
 * @returns Parsed time in seconds, clamped to valid range [0, MAX_SAFE_SECONDS]
 */
export function parseTimeString(
  time: string | number | null | undefined,
): number {
  if (time == null) return 0

  // Handle numeric input directly
  if (typeof time === 'number') {
    return clampToTimeRange(time)
  }

  const trimmed = time.trim()
  if (!trimmed) return 0

  const delimiter = trimmed.includes(':') ? ':' : ' '
  const parts = trimmed.split(delimiter).filter(Boolean)
  const result = parseTimeParts(parts)

  return clampToTimeRange(result)
}
