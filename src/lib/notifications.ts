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
