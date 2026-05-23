import * as React from 'react'

import { FreezeOnExit } from './freeze'

interface TransitionStatusState {
  transitionStatus?: string
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
