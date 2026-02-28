import { PLAYER_CONFIG } from './constants'

/** Sentinel value in PLAYER_CONFIG.SKIP_TIMES representing "1 frame". */
const FRAME_SKIP_SENTINEL = 0

function isValidSkipTimeIndex(index: number): boolean {
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < PLAYER_CONFIG.SKIP_TIMES.length
  )
}

export function isFrameSkipSeconds(seconds: number): boolean {
  return seconds === FRAME_SKIP_SENTINEL
}

function resolveSkipStepSeconds(
  skipSeconds: number,
  frameStepSeconds: number,
): number {
  return isFrameSkipSeconds(skipSeconds) ? frameStepSeconds : skipSeconds
}

export function getSkipStepSeconds(
  skipTimeIndex: number,
  frameStepSeconds: number,
): number {
  const skipSeconds = isValidSkipTimeIndex(skipTimeIndex)
    ? PLAYER_CONFIG.SKIP_TIMES[skipTimeIndex]
    : PLAYER_CONFIG.SKIP_TIMES[PLAYER_CONFIG.DEFAULT_SKIP_TIME_INDEX]

  return resolveSkipStepSeconds(skipSeconds, frameStepSeconds)
}

export function formatSkipDurationLabel(skipSeconds: number): string {
  return isFrameSkipSeconds(skipSeconds) ? '1f' : `${skipSeconds}s`
}
