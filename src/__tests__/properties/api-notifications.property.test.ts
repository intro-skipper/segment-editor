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
  handleApiError,
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
   * Property: handleApiError displays appropriate error for status codes
   * For any HTTP error status code, handleApiError SHALL display
   * a negative notification with relevant error details.
   */
  it('handleApiError displays negative notification for error status codes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 599 }),
        fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
          nil: undefined,
        }),
        (status, serverMessage) => {
          vi.clearAllMocks()

          handleApiError(status, serverMessage)

          // Should always call toast.error for error status codes
          expect(toast.error).toHaveBeenCalledTimes(1)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: handleApiError provides specific messages for known status codes
   * For specific HTTP status codes (400, 401, 404, 500), handleApiError SHALL
   * display appropriate user-friendly messages.
   */
  it('handleApiError provides specific messages for known status codes', () => {
    const knownStatusCodes = [
      { status: 400, expectedMessage: 'Bad Request' },
      { status: 401, expectedMessage: 'Authentication failed' },
      { status: 404, expectedMessage: 'Not found' },
      { status: 500, expectedMessage: 'Server error' },
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...knownStatusCodes),
        fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
          nil: undefined,
        }),
        ({ status, expectedMessage }, serverMessage) => {
          vi.clearAllMocks()

          handleApiError(status, serverMessage)

          expect(toast.error).toHaveBeenCalledTimes(1)
          const [actualMessage] = (toast.error as ReturnType<typeof vi.fn>).mock
            .calls[0]
          expect(actualMessage).toBe(expectedMessage)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: handleApiError includes server message when provided
   * For any error status code with a server message, handleApiError SHALL
   * include the server message in the notification description.
   */
  it('handleApiError includes server message in description', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(400, 404, 500),
        fc.string({ minLength: 1, maxLength: 200 }),
        (status, serverMessage) => {
          vi.clearAllMocks()

          handleApiError(status, serverMessage)

          expect(toast.error).toHaveBeenCalledTimes(1)
          const [, options] = (toast.error as ReturnType<typeof vi.fn>).mock
            .calls[0]

          // For 400, server message is passed as description
          // For 404 and 500, server message is used if provided
          expect(options.description).toBe(serverMessage)

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
