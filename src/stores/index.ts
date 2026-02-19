/**
 * Central export point for all Zustand stores.
 */

export { useApiStore } from './api-store'

/** Selector for checking if user is authenticated - use in query hooks */
export const selectValidAuth = (s: { validAuth: boolean }) => s.validAuth
