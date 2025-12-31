import { toast } from 'sonner'

/**
 * Notification types for the application.
 * Maps to sonner toast types.
 */
export type NotificationType = 'positive' | 'negative' | 'info' | 'warning'

/**
 * Options for showing a notification.
 */
export interface NotificationOptions {
  /** The type of notification */
  type: NotificationType
  /** The message to display */
  message: string
  /** Optional description for additional context */
  description?: string
  /** Duration in milliseconds (default: 4000) */
  duration?: number
}

/**
 * Shows a notification toast.
 * Maps application notification types to sonner toast methods.
 *
 * @param options - The notification options
 *
 * @example
 * // Success notification
 * showNotification({ type: 'positive', message: 'Segment saved successfully' })
 *
 * @example
 * // Error notification with description
 * showNotification({
 *   type: 'negative',
 *   message: 'Failed to save segment',
 *   description: 'Server returned 404'
 * })
 */
export function showNotification(options: NotificationOptions): void {
  const { type, message, description, duration = 4000 } = options

  const toastOptions = {
    description,
    duration,
  }

  switch (type) {
    case 'positive':
      toast.success(message, toastOptions)
      break
    case 'negative':
      toast.error(message, toastOptions)
      break
    case 'warning':
      toast.warning(message, toastOptions)
      break
    case 'info':
    default:
      toast.info(message, toastOptions)
      break
  }
}

/**
 * Shows a positive/success notification.
 * Convenience wrapper for showNotification with type 'positive'.
 *
 * @param message - The success message
 * @param description - Optional additional context
 */
export function showSuccess(message: string, description?: string): void {
  showNotification({ type: 'positive', message, description })
}

/**
 * Shows a negative/error notification.
 * Convenience wrapper for showNotification with type 'negative'.
 *
 * @param message - The error message
 * @param description - Optional error details
 */
export function showError(message: string, description?: string): void {
  showNotification({ type: 'negative', message, description })
}

/**
 * Shows an info notification.
 * Convenience wrapper for showNotification with type 'info'.
 *
 * @param message - The info message
 * @param description - Optional additional context
 */
export function showInfo(message: string, description?: string): void {
  showNotification({ type: 'info', message, description })
}

/**
 * Shows a warning notification.
 * Convenience wrapper for showNotification with type 'warning'.
 *
 * @param message - The warning message
 * @param description - Optional additional context
 */
export function showWarning(message: string, description?: string): void {
  showNotification({ type: 'warning', message, description })
}

/**
 * Handles API errors and shows appropriate notifications.
 * Maps HTTP status codes to user-friendly messages.
 *
 * @param status - HTTP status code
 * @param serverMessage - Optional message from the server
 *
 * Requirements: 12.2, 12.3, 12.4
 */
export function handleApiError(status: number, serverMessage?: string): void {
  switch (status) {
    case 400:
      showError('Bad Request', serverMessage)
      break
    case 401:
      showError('Authentication failed', 'Please check your credentials')
      break
    case 404:
      showError(
        'Not found',
        serverMessage || 'The requested resource was not found',
      )
      break
    case 500:
      showError(
        'Server error',
        serverMessage || 'An internal server error occurred',
      )
      break
    default:
      showError(
        `Error (${status})`,
        serverMessage || 'An unexpected error occurred',
      )
  }
}
