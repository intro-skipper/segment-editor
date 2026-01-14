/**
 * EntryStep Component
 *
 * First step of the connection wizard - server address entry.
 *
 * @module components/connection/steps/EntryStep
 */

import { useCallback, useEffect, useRef } from 'react'
import { Loader2, Search, Server } from 'lucide-react'

import { WizardError } from '../WizardError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface EntryStepProps {
  address: string
  error: string | null
  isLoading: boolean
  onAddressChange: (address: string) => void
  onDiscover: () => void
  onRetry?: () => void
}

export function EntryStep({
  address,
  error,
  isLoading,
  onAddressChange,
  onDiscover,
  onRetry,
}: EntryStepProps) {
  const addressInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => addressInputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        e.preventDefault()
        onDiscover()
      }
    },
    [isLoading, onDiscover],
  )

  return (
    <div className="space-y-6">
      {/* Inline header with icon */}
      <div className="text-center">
        <div className="size-12 rounded-xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
          <Server className="size-6 text-primary" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold mb-1">Connect to Jellyfin</h2>
        <p className="text-sm text-muted-foreground">
          Enter your server address to get started
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="server-address">Server Address</Label>
        <Input
          ref={addressInputRef}
          id="server-address"
          type="text"
          inputMode="url"
          placeholder="jellyfin.example.com"
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          aria-invalid={!!error}
          aria-describedby={error ? 'address-error' : 'address-hint'}
        />
        <p id="address-hint" className="text-xs text-muted-foreground">
          Enter hostname or IP address. Protocol and port are auto-detected.
        </p>
      </div>

      {error && (
        <WizardError
          message={error}
          onRetry={address.trim() ? onRetry : undefined}
          isRetrying={isLoading}
        />
      )}

      <Button
        onClick={onDiscover}
        disabled={isLoading || !address.trim()}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Discovering...
          </>
        ) : (
          <>
            <Search className="size-4" aria-hidden />
            Find Server
          </>
        )}
      </Button>
    </div>
  )
}
