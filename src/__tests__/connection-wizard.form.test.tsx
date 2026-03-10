/**
 * @vitest-environment jsdom
 */

import * as React from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecommendedServerInfoScore } from '@jellyfin/sdk/lib/models/recommended-server-info'

import { ConnectionWizard } from '@/components/connection/ConnectionWizard'
import '@/i18n/config'

const discoverServersMock = vi.hoisted(() => vi.fn())
const authenticateMock = vi.hoisted(() => vi.fn())
const findBestServerMock = vi.hoisted(() => vi.fn())
const storeAuthResultMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/jellyfin', () => ({
  authenticate: authenticateMock,
  discoverServers: discoverServersMock,
  findBestServer: findBestServerMock,
  getScoreDisplay: () => ({ label: 'Great', variant: 'success' as const }),
  storeAuthResult: storeAuthResultMock,
}))

interface HarnessProps {
  onComplete?: () => void
}

function ConnectionWizardHarness({ onComplete }: HarnessProps) {
  const [open, setOpen] = React.useState(true)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen wizard
      </button>
      <ConnectionWizard
        open={open}
        onOpenChange={setOpen}
        onComplete={onComplete}
      />
    </>
  )
}

function createServer(
  address: string,
  score: RecommendedServerInfoScore = RecommendedServerInfoScore.GREAT,
) {
  return {
    address,
    issues: [],
    responseTime: 100,
    score,
    systemInfo: {
      ServerName: address,
      Version: '10.9.0',
    },
  }
}

function getInput(label: string): HTMLInputElement {
  const element = screen.getByLabelText(label)
  if (!(element instanceof HTMLInputElement)) {
    throw new TypeError(`Expected input for label: ${label}`)
  }
  return element
}

describe('ConnectionWizard TanStack Form migration', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    authenticateMock.mockReset()
    discoverServersMock.mockReset()
    findBestServerMock.mockReset()
    storeAuthResultMock.mockReset()
    findBestServerMock.mockImplementation(
      (servers: Array<ReturnType<typeof createServer>>) => servers[0] ?? null,
    )
  })

  it('blocks empty discovery submit and preserves the typed draft', async () => {
    render(<ConnectionWizardHarness />)

    const addressInput = screen.getByLabelText('Server Address')
    fireEvent.change(addressInput, { target: { value: '   ' } })
    fireEvent.keyDown(addressInput, { key: 'Enter' })

    await screen.findByText('Please enter a server address')

    expect(discoverServersMock).not.toHaveBeenCalled()
    expect((addressInput as HTMLInputElement).value).toBe('   ')
  })

  it('preserves the entered address and selected server when navigating back', async () => {
    const alpha = createServer('https://alpha.local')
    const beta = createServer(
      'https://beta.local',
      RecommendedServerInfoScore.GOOD,
    )
    discoverServersMock.mockResolvedValue({
      error: undefined,
      servers: [alpha, beta],
    })

    render(<ConnectionWizardHarness />)

    const addressInput = screen.getByLabelText('Server Address')
    fireEvent.change(addressInput, { target: { value: 'demo.local' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find Server' }))

    await screen.findByRole('heading', { name: 'Select Server' })

    const betaButton = screen.getByRole('button', {
      name: /https:\/\/beta\.local/i,
    })
    fireEvent.click(betaButton)
    expect(betaButton.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText('Connecting to')
    expect(screen.getByText(beta.address)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('heading', { name: 'Select Server' })
    expect(
      screen
        .getByRole('button', { name: /https:\/\/beta\.local/i })
        .getAttribute('aria-selected'),
    ).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => {
      expect(getInput('Server Address').value).toBe('demo.local')
    })
  })

  it('preserves hidden auth drafts and submits only the active auth method', async () => {
    const server = createServer('https://demo.local')
    discoverServersMock.mockResolvedValue({
      error: undefined,
      servers: [server],
    })
    authenticateMock.mockResolvedValue({
      success: true,
      token: 'demo-token',
      userId: 'user-1',
    })

    render(<ConnectionWizardHarness />)

    fireEvent.change(screen.getByLabelText('Server Address'), {
      target: { value: 'demo.local' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find Server' }))
    await screen.findByRole('heading', { name: 'Select Server' })

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText('Connecting to')

    fireEvent.click(screen.getByRole('button', { name: 'Username' }))
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'demo-user' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'demo-pass' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'API Key' }))
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'demo-api-key' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Username' }))
    expect(getInput('Username').value).toBe('demo-user')
    expect(getInput('Password').value).toBe('demo-pass')

    fireEvent.click(screen.getByRole('button', { name: 'API Key' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await waitFor(() => {
      expect(authenticateMock).toHaveBeenCalledWith(
        server.address,
        { apiKey: 'demo-api-key', method: 'apiKey' },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })
    await screen.findByText('Connected!')
  })

  it('clears auth request errors when the active field changes', async () => {
    const server = createServer('https://demo.local')
    discoverServersMock.mockResolvedValue({
      error: undefined,
      servers: [server],
    })
    authenticateMock.mockResolvedValue({
      error: 'Invalid API key',
      success: false,
    })

    render(<ConnectionWizardHarness />)

    fireEvent.change(screen.getByLabelText('Server Address'), {
      target: { value: 'demo.local' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find Server' }))
    await screen.findByRole('heading', { name: 'Select Server' })

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText('Connecting to')

    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'bad-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await screen.findByText('Invalid API key')

    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'better-key' },
    })

    await waitFor(() => {
      expect(screen.queryByText('Invalid API key')).toBeNull()
    })
  })

  it('waits until submit before showing auth field validation', async () => {
    const server = createServer('https://demo.local')
    discoverServersMock.mockResolvedValue({
      error: undefined,
      servers: [server],
    })

    render(<ConnectionWizardHarness />)

    fireEvent.change(screen.getByLabelText('Server Address'), {
      target: { value: 'demo.local' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find Server' }))
    await screen.findByRole('heading', { name: 'Select Server' })

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText('Connecting to')

    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: '   ' },
    })

    expect(screen.queryByText('API key is required')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await screen.findByText('API key is required')
    expect(authenticateMock).not.toHaveBeenCalled()
  })

  it('aborts discovery and resets form state when the wizard closes', async () => {
    let capturedSignal: AbortSignal | undefined
    discoverServersMock.mockImplementation(
      (_address: string, options?: { signal?: AbortSignal }) => {
        capturedSignal = options?.signal
        return new Promise(() => {})
      },
    )

    render(<ConnectionWizardHarness />)

    fireEvent.change(screen.getByLabelText('Server Address'), {
      target: { value: 'demo.local' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find Server' }))

    await waitFor(() => {
      expect(discoverServersMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))

    await waitFor(() => {
      expect(capturedSignal?.aborted).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reopen wizard' }))

    await waitFor(() => {
      expect(getInput('Server Address').value).toBe('')
    })
  })
})
