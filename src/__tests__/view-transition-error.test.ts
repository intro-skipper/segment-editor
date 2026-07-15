import { describe, expect, it, vi } from 'vitest'

import {
  createViewTransitionAbortHandler,
  installViewTransitionAbortHandler,
  isViewTransitionAbortError,
} from '@/lib/view-transition-error'

function createRejectionEvent(reason: unknown): PromiseRejectionEvent {
  return {
    reason,
    preventDefault: vi.fn(),
  } as unknown as PromiseRejectionEvent
}

describe('isViewTransitionAbortError', () => {
  it('matches the WebKit view transition abort rejection', () => {
    expect(
      isViewTransitionAbortError(
        new DOMException(
          'Old view transition aborted by new view transition.',
          'AbortError',
        ),
      ),
    ).toBe(true)
  })

  it('matches the Chromium skipped transition rejection', () => {
    expect(
      isViewTransitionAbortError(
        new DOMException('Transition was skipped', 'AbortError'),
      ),
    ).toBe(true)
  })

  it('keeps Chromium invalid-state transition failures visible', () => {
    // Chromium uses this generic rejection for real authoring defects such
    // as duplicate view-transition-name values — it must not be suppressed.
    expect(
      isViewTransitionAbortError(
        new DOMException(
          'Transition was aborted because of invalid state',
          'InvalidStateError',
        ),
      ),
    ).toBe(false)
  })

  it('ignores unrelated abort errors such as cancelled fetches', () => {
    expect(
      isViewTransitionAbortError(
        new DOMException('The operation was aborted.', 'AbortError'),
      ),
    ).toBe(false)
  })

  it('ignores non-DOMException reasons', () => {
    expect(
      isViewTransitionAbortError(new Error('Transition was skipped')),
    ).toBe(false)
    expect(isViewTransitionAbortError('Transition was skipped')).toBe(false)
    expect(isViewTransitionAbortError(undefined)).toBe(false)
  })
})

describe('createViewTransitionAbortHandler', () => {
  it('prevents default handling for view transition aborts', () => {
    const handler = createViewTransitionAbortHandler()
    const event = createRejectionEvent(
      new DOMException(
        'Old view transition aborted by new view transition.',
        'AbortError',
      ),
    )

    handler(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('leaves other rejections untouched', () => {
    const handler = createViewTransitionAbortHandler()
    const event = createRejectionEvent(new Error('network down'))

    handler(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

describe('installViewTransitionAbortHandler', () => {
  it('registers and removes the unhandledrejection listener', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      'window',
    )
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener, removeEventListener },
    })

    try {
      const uninstall = installViewTransitionAbortHandler()

      expect(addEventListener).toHaveBeenCalledTimes(1)
      expect(addEventListener).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function),
      )

      const registeredHandler = addEventListener.mock.calls[0][1]

      uninstall()

      expect(removeEventListener).toHaveBeenCalledTimes(1)
      expect(removeEventListener).toHaveBeenCalledWith(
        'unhandledrejection',
        registeredHandler,
      )
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow)
      } else {
        delete (globalThis as { window?: unknown }).window
      }
    }
  })
})
