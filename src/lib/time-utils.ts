/**
 * Time conversion and formatting utilities.
 * Jellyfin uses .NET ticks (100-nanosecond intervals) for time values.
 * 1 tick = 100 nanoseconds = 0.0000001 seconds
 * 1 second = 10,000,000 ticks
 */

const TICKS_PER_SECOND = 10_000_000

/**
 * Converts .NET ticks to seconds.
 * @param ticks - Number of .NET ticks to convert
 * @returns The converted value in seconds
 */
export function ticksToSeconds(ticks: number | null | undefined): number {
  if (ticks == null || ticks === 0) {
    return 0
  }
  return ticks / TICKS_PER_SECOND
}

/**
 * Converts seconds to .NET ticks.
 * @param seconds - Number of seconds to convert
 * @returns The converted value in ticks
 */
export function secondsToTicks(seconds: number | null | undefined): number {
  if (seconds == null || seconds === 0) {
    return 0
  }
  return Math.round(seconds * TICKS_PER_SECOND)
}

/**
 * Formats seconds into a time string like '01:20:15.123' or '20:15.123'.
 * @param timeInSeconds - The seconds to convert
 * @returns Formatted time string (HH:MM:SS.mmm or MM:SS.mmm)
 */
export function formatTime(timeInSeconds: number): string {
  if (timeInSeconds < 0) {
    timeInSeconds = 0
  }

  const hours = Math.floor(timeInSeconds / 3600)
  const minutes = Math.floor((timeInSeconds % 3600) / 60)
  const seconds = Math.floor(timeInSeconds % 60)
  const milliseconds = Math.round((timeInSeconds % 1) * 1000)

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
 * @param timeInSeconds - The seconds to convert
 * @returns Human-readable time string
 */
export function formatReadableTime(timeInSeconds: number): string {
  if (timeInSeconds < 0) {
    timeInSeconds = 0
  }

  const hours = Math.floor(timeInSeconds / 3600)
  const minutes = Math.floor((timeInSeconds % 3600) / 60)
  const seconds = Math.floor(timeInSeconds % 60)

  const parts: Array<string> = []

  if (hours > 0) {
    parts.push(`${hours}h`)
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`)
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`)
  }

  return parts.join(' ')
}

/**
 * Parses a time string into seconds.
 * Supports formats: '1:20:15', '1:20:15.500', '20:15', '20:15.500', '15', '15.500'
 * Also supports space-separated: '1 20 15'
 * @param time - Time string to parse
 * @returns Time in seconds
 */
export function parseTimeString(time: string | number | undefined): number {
  if (time == null) {
    return 0
  }

  if (typeof time === 'number') {
    return time
  }

  const trimmed = time.trim()
  if (trimmed === '') {
    return 0
  }

  // Split by colon or space
  const parts = trimmed.includes(':')
    ? trimmed.split(':')
    : trimmed.split(' ').filter((p) => p !== '')

  if (parts.length === 0) {
    return 0
  }

  let totalSeconds = 0

  // Parse from right to left: seconds, minutes, hours
  const seconds = parts.pop()
  const minutes = parts.pop()
  const hours = parts.pop()

  if (seconds != null) {
    totalSeconds += parseFloat(seconds) || 0
  }
  if (minutes != null) {
    totalSeconds += (parseFloat(minutes) || 0) * 60
  }
  if (hours != null) {
    totalSeconds += (parseFloat(hours) || 0) * 3600
  }

  return totalSeconds
}

/**
 * Rounds a number to a specified number of decimal places.
 * @param value - The number to round
 * @param decimals - Number of decimal places (default: 3)
 * @returns Rounded number
 */
export function roundToDecimals(value: number, decimals: number = 3): number {
  const factor = Math.pow(10, decimals)
  return Math.round((value + Number.EPSILON) * factor) / factor
}
