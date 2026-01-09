/**
 * Central export point for all Zustand stores.
 */

export {
  useApiStore,
  type ApiState,
  type ApiActions,
  type ApiStore,
} from './api-store'

/** Selector for checking if user is authenticated - use in query hooks */
export const selectValidAuth = (s: { validAuth: boolean }) => s.validAuth

export {
  useAppStore,
  getEffectiveLocale,
  type AppState,
  type AppActions,
  type AppStore,
  type Theme,
  type Locale,
  type ResolvedLocale,
} from './app-store'

export {
  useSessionStore,
  type SessionState,
  type SessionActions,
  type SessionStore,
} from './session-store'
