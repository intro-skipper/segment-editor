/**
 * usePlayerKeyboard - Custom hook for player keyboard shortcuts.
 */

import { useEffect, useEffectEvent } from 'react'
import { isEditableElement } from '@/lib/keyboard-utils'

interface KeyboardHandlers {
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
  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (isEditableElement(e.target)) return

    const key = e.key.toLowerCase()
    if (key in KEY_MAP) {
      e.preventDefault()
      handlers[KEY_MAP[key]]()
    }
  })

  useEffect(() => {
    const controller = new AbortController()

    window.addEventListener('keydown', handleKeyDown, {
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [])
}
