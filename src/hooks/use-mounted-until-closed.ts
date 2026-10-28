import { useState } from 'react'

/**
 * Whether to render a dialog that mounts only when opened: true from opening
 * until its exit animation ends. Pass the callback to the dialog's
 * onOpenChangeComplete.
 */
export function useMountedUntilClosed(open: boolean) {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  const onOpenChangeComplete = (isOpen: boolean) => {
    if (!isOpen) setMounted(false)
  }
  return [open || mounted, onOpenChangeComplete] as const
}
