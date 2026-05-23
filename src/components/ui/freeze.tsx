import * as React from 'react'

interface FreezeProps {
  frozen: boolean
  children: React.ReactNode
}

interface FreezeOnExitProps {
  transitionStatus?: string
  children: React.ReactNode
}

const NEVER: Promise<never> = new Promise(() => {})

function Suspend(): never {
  throw NEVER
}

export function Freeze({ frozen, children }: FreezeProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  React.useInsertionEffect(() => {
    if (!frozen || rootRef.current === null) return
    rootRef.current.style.display = ''
  }, [frozen])

  return (
    <React.Suspense>
      {frozen ? <Suspend /> : null}
      <div ref={rootRef}>{children}</div>
    </React.Suspense>
  )
}

export function FreezeOnExit({
  transitionStatus,
  children,
}: FreezeOnExitProps) {
  return <Freeze frozen={transitionStatus === 'ending'}>{children}</Freeze>
}
