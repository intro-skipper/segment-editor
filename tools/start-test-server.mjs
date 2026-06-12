import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const pnpmCommand = isWindows ? 'cmd.exe' : 'pnpm'
const pnpmArgs = isWindows ? ['/d', '/s', '/c', 'pnpm', 'dev'] : ['dev']
const mockServerPort = process.env.MOCK_SERVER_PORT ?? '8096'
const mockServerAddress =
  process.env.MOCK_SERVER_ADDRESS ?? `http://localhost:${mockServerPort}`
const mockAccessToken =
  process.env.MOCK_SERVER_ACCESS_TOKEN ?? 'mock-access-token'
const mockServerVersion = process.env.MOCK_SERVER_VERSION ?? '10.10.7'
const mockUsername = process.env.MOCK_SERVER_USERNAME ?? 'demo'
const mockUserId =
  process.env.MOCK_SERVER_USER_ID ?? 'fffffffffffffffffffffffffffffff0'
const mockAutoLogin = process.env.VITE_MOCK_SERVER_AUTO_LOGIN ?? 'true'
const mockServerEnv = {
  MOCK_SERVER_PORT: mockServerPort,
  MOCK_SERVER_ADDRESS: mockServerAddress,
  MOCK_SERVER_ACCESS_TOKEN: mockAccessToken,
  MOCK_SERVER_VERSION: mockServerVersion,
  MOCK_SERVER_USERNAME: mockUsername,
  MOCK_SERVER_USER_ID: mockUserId,
}
const viteMockServerEnv = {
  VITE_MOCK_SERVER_AUTO_LOGIN: mockAutoLogin,
  VITE_MOCK_SERVER_ADDRESS: mockServerAddress,
  VITE_MOCK_SERVER_ACCESS_TOKEN: mockAccessToken,
  VITE_MOCK_SERVER_VERSION: mockServerVersion,
  VITE_MOCK_SERVER_USERNAME: mockUsername,
  VITE_MOCK_SERVER_USER_ID: mockUserId,
}
const children = new Set()
const buffers = new Map()
let stopping = false
let exitCode = 0

function writePrefixed(name, stream, chunk) {
  const text = `${buffers.get(stream) ?? ''}${chunk}`
  const lines = text.split(/\r?\n/)
  buffers.set(stream, lines.pop() ?? '')

  for (const line of lines) {
    if (line) process.stdout.write(`[${name}] ${line}\n`)
  }
}

function flushPrefixed(name, stream) {
  const buffered = buffers.get(stream)
  if (buffered) process.stdout.write(`[${name}] ${buffered}\n`)
  buffers.delete(stream)
}

function start(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    detached: !isWindows,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  children.add(child)

  child.stdout.on('data', (chunk) => writePrefixed(name, child.stdout, chunk))
  child.stderr.on('data', (chunk) => writePrefixed(name, child.stderr, chunk))

  child.on('error', (error) => {
    process.stderr.write(`[${name}] failed to start: ${error.message}\n`)
    stopAll(1)
  })

  child.on('exit', (code, signal) => {
    flushPrefixed(name, child.stdout)
    flushPrefixed(name, child.stderr)
    children.delete(child)

    if (!stopping) {
      const status = signal ? `signal ${signal}` : `code ${code ?? 1}`
      process.stderr.write(`[${name}] exited with ${status}; stopping all processes\n`)
      stopAll(code ?? 1)
      return
    }

    if (children.size === 0) process.exit(exitCode)
  })

  return child
}

function killChild(child) {
  if (!child.pid) return

  if (isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    })
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

function stopAll(code) {
  if (stopping) return
  stopping = true
  exitCode = code

  for (const child of children) killChild(child)

  if (children.size === 0) process.exit(exitCode)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
process.on('uncaughtException', (error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  stopAll(1)
})

start('mock', process.execPath, ['tools/server.mjs'], mockServerEnv)
start('app', pnpmCommand, pnpmArgs, viteMockServerEnv)
