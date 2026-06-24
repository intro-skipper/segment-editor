/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { scheduleIdleTask } from '@/lib/idle-task'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('scheduleIdleTask', () => {
  it('uses requestIdleCallback when available', () => {
    const task = vi.fn()
    const requestIdleCallback = vi.fn(() => 42)
    const cancelIdleCallback = vi.fn()

    vi.stubGlobal('requestIdleCallback', requestIdleCallback)
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallback)

    const cancel = scheduleIdleTask(task, {
      timeout: 180,
      fallbackDelay: 100,
    })

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 180,
    })

    cancel()
    cancel()

    expect(cancelIdleCallback).toHaveBeenCalledOnce()
    expect(cancelIdleCallback).toHaveBeenCalledWith(42)
  })

  it('falls back to a timer when requestIdleCallback is unavailable', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    const task = vi.fn()

    scheduleIdleTask(task, {
      timeout: 180,
      fallbackDelay: 100,
    })

    vi.advanceTimersByTime(99)
    expect(task).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(task).toHaveBeenCalledOnce()
  })

  it('prevents a cancelled task from running without a native cancel API', () => {
    let scheduledTask: (() => void) | undefined
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: () => void) => {
        scheduledTask = callback
        return 7
      }),
    )
    vi.stubGlobal('cancelIdleCallback', undefined)
    const task = vi.fn()

    const cancel = scheduleIdleTask(task, {
      timeout: 180,
      fallbackDelay: 100,
    })

    cancel()
    scheduledTask?.()

    expect(task).not.toHaveBeenCalled()
  })
})
