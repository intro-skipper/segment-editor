/**
 * Feature: API Operation Notifications
 * For any successful API operation, a positive notification SHALL be displayed.
 * For any failed API operation, a negative notification SHALL be displayed
 * with relevant error details.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { toast } from 'sonner'
import type { NotificationType } from '@/lib/notifications'
import {
  showError,
  showNotification,
  showSuccess,
} from '@/lib/notifications'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

describe('API Operation Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property: Positive notifications trigger toast.success
   * For any message and optional description, showNotification with type 'positive'
   * SHALL call toast.success with the correct parameters.
   */
  it('positive notifications trigger toast.success', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.option(fc.string({ minLength: 1, maxLength: 500 }), {
          nil: undefined,
        }),
        fc.integer({ min: 1000, max: 10000 }),
        (message, description, duration) => {
          vi.clearAllMocks()

          showNotification({
            type: 'positive',
            message,
            description,
            duration,
          })

          expect(toast.success).toHaveBeenCalledTimes(1)
          expect(toast.success).toHaveBeenCalledWith(message, {
            description,
            duration,
          })

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Negative notifications trigger toast.error
   * For any message and optional description, showNotification with type 'negative'
   * SHALL call toast.error with the correct parameters.
   */
  it('negative notifications trigger toast.error', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.option(fc.string({ minLength: 1, maxLength: 500 }), {
          nil: undefined,
        }),
        (message, description) => {
          vi.clearAllMocks()

          showNotification({
            type: 'negative',
            message,
            description,
          })

          expect(toast.error).toHaveBeenCalledTimes(1)
          expect(toast.error).toHaveBeenCalledWith(message, {
            description,
            duration: 4000, // default duration
          })

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: showSuccess convenience function works correctly
   * For any message and optional description, showSuccess SHALL
   * trigger a positive notification via toast.success.
   */
  it('showSuccess triggers toast.success', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.option(fc.string({ minLength: 1, maxLength: 500 }), {
          nil: undefined,
        }),
        (message, description) => {
          vi.clearAllMocks()

          showSuccess(message, description)

          expect(toast.success).toHaveBeenCalledTimes(1)
          expect(toast.success).toHaveBeenCalledWith(message, {
            description,
            duration: 4000,
          })

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: showError convenience function works correctly
   * For any message and optional description, showError SHALL
   * trigger a negative notification via toast.error.
   */
  it('showError triggers toast.error', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.option(fc.string({ minLength: 1, maxLength: 500 }), {
          nil: undefined,
        }),
        (message, description) => {
          vi.clearAllMocks()

          showError(message, description)

          expect(toast.error).toHaveBeenCalledTimes(1)
          expect(toast.error).toHaveBeenCalledWith(message, {
            description,
            duration: 4000,
          })

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Notification type mapping is consistent
   * For any notification type, showNotification SHALL call the
   * corresponding toast method.
   */
  it('notification type mapping is consistent', () => {
    const typeMapping: Array<{
      type: NotificationType
      toastMethod: keyof typeof toast
    }> = [
      { type: 'positive', toastMethod: 'success' },
      { type: 'negative', toastMethod: 'error' },
      { type: 'warning', toastMethod: 'warning' },
      { type: 'info', toastMethod: 'info' },
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...typeMapping),
        fc.string({ minLength: 1, maxLength: 200 }),
        ({ type, toastMethod }, message) => {
          vi.clearAllMocks()

          showNotification({ type, message })

          expect(toast[toastMethod]).toHaveBeenCalledTimes(1)
          expect(toast[toastMethod]).toHaveBeenCalledWith(message, {
            description: undefined,
            duration: 4000,
          })

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Default duration is applied when not specified
   * For any notification without explicit duration, the default
   * duration of 4000ms SHALL be applied.
   */
  it('applies default duration when not specified', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<NotificationType>(
          'positive',
          'negative',
          'info',
          'warning',
        ),
        fc.string({ minLength: 1, maxLength: 200 }),
        (type, message) => {
          vi.clearAllMocks()

          showNotification({ type, message })

          const toastMethod =
            type === 'positive'
              ? 'success'
              : type === 'negative'
                ? 'error'
                : type
          const [, options] = (toast[toastMethod] as ReturnType<typeof vi.fn>)
            .mock.calls[0]

          expect(options.duration).toBe(4000)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })
})
