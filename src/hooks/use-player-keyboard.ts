/**
 * usePlayerKeyboard - Custom hook for player keyboard shortcuts.
 */

import { useEffect, useMemo } from 'react'
import { isEditableElement } from '@/lib/keyboard-utils'

export interface KeyboardHandlers {
  togglePlay: () => void
  cycleSkipTimeUp: () => void
  cycleSkipTimeDown: () => void
  skipBackward: () => void
  skipForward: () => void
  pushStartTimestamp: () => void
  pushEndTimestamp: () => void
  toggleMute: () => void
}

/** Key mappings: Space=Play, W/S=Skip time, A/D=Skip, E/F=Timestamps, M=Mute */
const KEY_MAP: Record<string, keyof KeyboardHandlers> = {
  ' ': 'togglePlay',
  w: 'cycleSkipTimeUp',
  s: 'cycleSkipTimeDown',
  a: 'skipBackward',
  d: 'skipForward',
  e: 'pushStartTimestamp',
  f: 'pushEndTimestamp',
  m: 'toggleMute',
}

export function usePlayerKeyboard(handlers: KeyboardHandlers): void {
  const handlerValues = useMemo(
    () => Object.values(handlers),
    [
      handlers.togglePlay,
      handlers.cycleSkipTimeUp,
      handlers.cycleSkipTimeDown,
      handlers.skipBackward,
      handlers.skipForward,
      handlers.pushStartTimestamp,
      handlers.pushEndTimestamp,
      handlers.toggleMute,
    ],
  )

  useEffect(() => {
    const controller = new AbortController()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) return

      const key = e.key.toLowerCase()
      if (key in KEY_MAP) {
        e.preventDefault()
        handlers[KEY_MAP[key]]()
      }
    }

    window.addEventListener('keydown', handleKeyDown, {
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [handlerValues, handlers])
}
