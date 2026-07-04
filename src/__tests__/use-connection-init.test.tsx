/**
 * @vitest-environment jsdom
 */

import { StrictMode } from 'react'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useConnectionInit,
  useConnectionValidationStore,
  usePluginMode,
} from '@/hooks/use-connection-init'
import { useApiStore } from '@/stores/api-store'

const testConnectionWithCredentials = vi.fn()

vi.mock('@/services/jellyfin', () => ({
  getPluginCredentials: () => null,
  isPluginMode: () => false,
  testConnectionWithCredentials: (...args: Array<unknown>): Promise<unknown> =>
    testConnectionWithCredentials(...args) as never,
}))

describe('useConnectionInit (standalone)', () => {
  beforeEach(() => {
    useConnectionValidationStore.setState({ status: 'idle' })
    useApiStore.setState({
      serverAddress: 'http://localhost:8096',
      apiKey: 'test-key',
      validConnection: false,
      validAuth: false,
      serverVersion: '',
    })
    testConnectionWithCredentials.mockReset()
    testConnectionWithCredentials.mockResolvedValue({
      valid: true,
      authenticated: true,
      serverVersion: '10.10.7',
    })
  })

  afterEach(() => {
    cleanup()
    useApiStore.setState({
      serverAddress: '',
      apiKey: undefined,
      validConnection: false,
      validAuth: false,
      serverVersion: '',
    })
  })

  it('completes validation under StrictMode double-mount instead of wedging on the aborted first attempt', async () => {
    const { result } = renderHook(() => useConnectionInit(), {
      wrapper: StrictMode,
    })

    await waitFor(() => {
      expect(result.current.hasValidated).toBe(true)
    })

    expect(useApiStore.getState().validAuth).toBe(true)
    expect(testConnectionWithCredentials).toHaveBeenCalled()
  })

  it('reports a completed failed validation so the wizard can take over', async () => {
    testConnectionWithCredentials.mockResolvedValue({
      valid: false,
      authenticated: false,
      serverVersion: '',
    })

    const { result } = renderHook(() => useConnectionInit(), {
      wrapper: StrictMode,
    })

    await waitFor(() => {
      expect(result.current.hasValidated).toBe(true)
    })

    expect(useApiStore.getState().validAuth).toBe(false)
    expect(result.current.showWizard).toBe(true)
  })

  it('exposes a completed failed validation through usePluginMode', async () => {
    testConnectionWithCredentials.mockResolvedValue({
      valid: false,
      authenticated: false,
      serverVersion: '',
    })

    const { result } = renderHook(
      () => ({
        init: useConnectionInit(),
        mode: usePluginMode(),
      }),
      { wrapper: StrictMode },
    )

    await waitFor(() => {
      expect(result.current.init.hasValidated).toBe(true)
    })

    expect(result.current.mode.hasCredentials).toBe(true)
    expect(result.current.mode.isConnected).toBe(false)
    expect(result.current.mode.isValidating).toBe(false)
    expect(result.current.mode.hasValidated).toBe(true)
  })
})
