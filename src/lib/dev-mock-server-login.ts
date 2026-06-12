import { useApiStore } from '@/stores/api-store'
import type { AuthMethod } from '@/stores/api-store'

const DEFAULT_MOCK_SERVER_ADDRESS = 'http://localhost:8096'
const DEFAULT_MOCK_ACCESS_TOKEN = 'mock-access-token'
const DEFAULT_MOCK_SERVER_VERSION = '10.10.7'
const DEFAULT_MOCK_USERNAME = 'demo'
const DEFAULT_MOCK_USER_ID = 'fffffffffffffffffffffffffffffff0'
const MOCK_AUTH_METHOD: AuthMethod = 'userPass'
interface MockServerLoginConfig {
  readonly serverAddress: string
  readonly accessToken: string
  readonly serverVersion: string
  readonly username: string
  readonly userId: string
}


interface DevMockServerEnv {
  readonly DEV?: boolean
  readonly VITE_MOCK_SERVER_AUTO_LOGIN?: string
  readonly VITE_MOCK_SERVER_ADDRESS?: string
  readonly VITE_MOCK_SERVER_ACCESS_TOKEN?: string
  readonly VITE_MOCK_SERVER_VERSION?: string
  readonly VITE_MOCK_SERVER_USERNAME?: string
  readonly VITE_MOCK_SERVER_USER_ID?: string
}

function getMockServerLoginConfig(env: DevMockServerEnv): MockServerLoginConfig {
  return {
    serverAddress:
      env.VITE_MOCK_SERVER_ADDRESS ?? DEFAULT_MOCK_SERVER_ADDRESS,
    accessToken:
      env.VITE_MOCK_SERVER_ACCESS_TOKEN ?? DEFAULT_MOCK_ACCESS_TOKEN,
    serverVersion:
      env.VITE_MOCK_SERVER_VERSION ?? DEFAULT_MOCK_SERVER_VERSION,
    username: env.VITE_MOCK_SERVER_USERNAME ?? DEFAULT_MOCK_USERNAME,
    userId: env.VITE_MOCK_SERVER_USER_ID ?? DEFAULT_MOCK_USER_ID,
  }
}

function hasExistingNonMockLogin(config: MockServerLoginConfig): boolean {
  const state = useApiStore.getState()
  if (!state.serverAddress && !state.apiKey && !state.userId) return false

  return (
    state.serverAddress !== config.serverAddress &&
    state.apiKey !== config.accessToken &&
    state.userId !== config.userId
  )
}

export function applyDevMockServerLogin(
  env: DevMockServerEnv = import.meta.env,
): boolean {
  if (
    env.DEV !== true ||
    (env.VITE_MOCK_SERVER_AUTO_LOGIN !== 'true' &&
      env.VITE_MOCK_SERVER_AUTO_LOGIN !== 'force')
  ) {
    return false
  }

  const config = getMockServerLoginConfig(env)
  if (
    env.VITE_MOCK_SERVER_AUTO_LOGIN !== 'force' &&
    hasExistingNonMockLogin(config)
  ) {
    return false
  }
  useApiStore.setState({
    serverAddress: config.serverAddress,
    apiKey: config.accessToken,
    authMethod: MOCK_AUTH_METHOD,
    userId: config.userId,
    username: config.username,
    serverVersion: config.serverVersion,
    validConnection: true,
    validAuth: true,
  })

  return true
}
