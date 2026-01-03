import { toast } from 'sonner'

/** Notification types for the application */
export type NotificationType = 'positive' | 'negative' | 'info' | 'warning'

export interface NotificationOptions {
  type: NotificationType
  message: string
  description?: string
  duration?: number
}

/** Map notification types to sonner toast methods */
const toastMethods = {
  positive: toast.success,
  negative: toast.error,
  warning: toast.warning,
  info: toast.info,
} as const satisfies Record<NotificationType, typeof toast.success>

/**
 * Shows a notification toast.
 */
export const showNotification = ({
  type,
  message,
  description,
  duration = 4000,
}: NotificationOptions): void => {
  toastMethods[type](message, { description, duration })
}

/** Convenience wrappers */
export const showSuccess = (message: string, description?: string): void =>
  showNotification({ type: 'positive', message, description })

export const showError = (message: string, description?: string): void =>
  showNotification({ type: 'negative', message, description })

/** HTTP status code to error message mapping */
const HTTP_ERRORS: Record<number, { title: string; defaultMsg: string }> = {
  400: { title: 'Bad Request', defaultMsg: 'Invalid request' },
  401: {
    title: 'Authentication failed',
    defaultMsg: 'Please check your credentials',
  },
  403: { title: 'Forbidden', defaultMsg: 'You do not have permission' },
  404: {
    title: 'Not found',
    defaultMsg: 'The requested resource was not found',
  },
  500: {
    title: 'Server error',
    defaultMsg: 'An internal server error occurred',
  },
}

/**
 * Handles API errors and shows appropriate notifications.
 * @param status - HTTP status code
 * @param serverMessage - Optional server error message
 */
export const handleApiError = (
  status: number,
  serverMessage?: string,
): void => {
  const error = HTTP_ERRORS[status] ?? {
    title: `Error (${status})`,
    defaultMsg: 'An unexpected error occurred',
  }
  showError(error.title, serverMessage || error.defaultMsg)
}
