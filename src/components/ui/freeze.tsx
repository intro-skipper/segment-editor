import * as React from 'react'

interface FreezeProps {
  frozen: boolean
  children: React.ReactNode
}

interface FreezeOnExitProps {
  transitionStatus?: string
  children: React.ReactNode
}

interface TransitionStatusState {
  transitionStatus?: string
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

function FreezeOnExit({ transitionStatus, children }: FreezeOnExitProps) {
  return <Freeze frozen={transitionStatus === 'ending'}>{children}</Freeze>
}

export function withFreezeOnExit(children: React.ReactNode) {
  return (
    popupProps: React.ComponentPropsWithRef<'div'>,
    state: TransitionStatusState,
  ) => (
    <div {...popupProps}>
      <FreezeOnExit transitionStatus={state.transitionStatus}>
        {children}
      </FreezeOnExit>
    </div>
  )
}
