// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DetailRouteErrorComponent } from '@/routes/-detail-route-error-component'

vi.mock('@/components/ui/route-error-fallback', () => ({
  RouteErrorFallback: ({ message }: { message?: string }) => (
    <div role="alert">{message ?? 'Generic fallback'}</div>
  ),
}))

afterEach(cleanup)

describe('DetailRouteErrorComponent', () => {
  it('preserves the message for Error instances', () => {
    render(
      <DetailRouteErrorComponent
        error={new Error('Unable to load item')}
        reset={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent).toBe('Unable to load item')
  })

  it.each([null, undefined, 'failure', 0, false, {}, { message: 123 }])(
    'uses the generic fallback for the non-Error value %j',
    (error) => {
      render(<DetailRouteErrorComponent error={error} reset={vi.fn()} />)

      expect(screen.getByRole('alert').textContent).toBe('Generic fallback')
    },
  )
})
