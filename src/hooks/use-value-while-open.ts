import { useState } from 'react'

/**
 * `value` while `open`, then the last value it had while open, so a popup
 * keeps its content through its exit animation after the caller clears it.
 */
export function useValueWhileOpen<T>(open: boolean, value: T): T {
  const [shown, setShown] = useState(value)
  if (open && !Object.is(shown, value)) setShown(value)
  return open ? value : shown
}
