import { describe, expect, it, beforeEach } from 'vitest'

import { applyDevMockServerLogin } from '@/lib/dev-mock-server-login'
import { useApiStore } from '@/stores/api-store'

describe('dev mock server login', () => {
  beforeEach(() => {
    localStorage.clear()
    useApiStore.setState({
      serverAddress: '',
      apiKey: undefined,
      serverVersion: '',
      validConnection: false,
      validAuth: false,
      authMethod: 'apiKey',
      userId: undefined,
      username: undefined,
    })
  })

  it('seeds mock server credentials only for the opt-in dev launcher', () => {
    expect(
      applyDevMockServerLogin({
        DEV: true,
        VITE_MOCK_SERVER_AUTO_LOGIN: 'true',
      }),
    ).toBe(true)

    expect(useApiStore.getState()).toMatchObject({
      serverAddress: 'http://localhost:8096',
      apiKey: 'mock-auth-value',
      authMethod: 'userPass',
      userId: 'fffffffffffffffffffffffffffffff0',
      username: 'demo',
      serverVersion: '10.10.7',
      validConnection: true,
      validAuth: true,
    })
  })

  it('uses launcher-provided mock server values', () => {
    expect(
      applyDevMockServerLogin({
        DEV: true,
        VITE_MOCK_SERVER_AUTO_LOGIN: 'true',
        VITE_MOCK_SERVER_ADDRESS: 'http://localhost:9000',
        VITE_MOCK_SERVER_AUTH_VALUE: 'custom-auth-value',
        VITE_MOCK_SERVER_VERSION: '10.11.0',
        VITE_MOCK_SERVER_USERNAME: 'custom-user',
        VITE_MOCK_SERVER_USER_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).toBe(true)

    expect(useApiStore.getState()).toMatchObject({
      serverAddress: 'http://localhost:9000',
      apiKey: 'custom-auth-value',
      userId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      username: 'custom-user',
      serverVersion: '10.11.0',
    })
  })

  it('does not overwrite existing non-mock credentials', () => {
    useApiStore.setState({
      serverAddress: 'https://jellyfin.example',
      apiKey: 'real-token',
      authMethod: 'apiKey',
      userId: 'real-user',
      username: 'real-user',
      validConnection: true,
      validAuth: true,
    })

    expect(
      applyDevMockServerLogin({
        DEV: true,
        VITE_MOCK_SERVER_AUTO_LOGIN: 'true',
      }),
    ).toBe(false)

    expect(useApiStore.getState()).toMatchObject({
      serverAddress: 'https://jellyfin.example',
      apiKey: 'real-token',
      authMethod: 'apiKey',
      userId: 'real-user',
      username: 'real-user',
      validConnection: true,
      validAuth: true,
    })
  })

  it('force-overwrites existing credentials for explicit mock resets', () => {
    useApiStore.setState({
      serverAddress: 'https://jellyfin.example',
      apiKey: 'real-token',
      authMethod: 'apiKey',
      userId: 'real-user',
      username: 'real-user',
      validConnection: true,
      validAuth: true,
    })

    expect(
      applyDevMockServerLogin({
        DEV: true,
        VITE_MOCK_SERVER_AUTO_LOGIN: 'force',
      }),
    ).toBe(true)

    expect(useApiStore.getState()).toMatchObject({
      serverAddress: 'http://localhost:8096',
      apiKey: 'mock-auth-value',
      authMethod: 'userPass',
      userId: 'fffffffffffffffffffffffffffffff0',
      username: 'demo',
      validConnection: true,
      validAuth: true,
    })
  })

  it('leaves credentials untouched outside the opt-in dev launcher', () => {
    useApiStore.setState({
      serverAddress: 'https://jellyfin.example',
      apiKey: 'real-token',
      validConnection: true,
      validAuth: true,
    })

    expect(
      applyDevMockServerLogin({
        DEV: true,
        VITE_MOCK_SERVER_AUTO_LOGIN: undefined,
      }),
    ).toBe(false)

    expect(useApiStore.getState()).toMatchObject({
      serverAddress: 'https://jellyfin.example',
      apiKey: 'real-token',
      validConnection: true,
      validAuth: true,
    })
  })
})
