/**
 * SelectStep Component
 *
 * Second step of the connection wizard - server selection.
 * Displays discovered servers with quality scores and keyboard navigation.
 *
 * @module components/connection/steps/SelectStep
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  AlertTriangle,
  Check,
  Loader2,
  Server,
  Shield,
  ShieldAlert,
  ShieldOff,
} from 'lucide-react'
import { RecommendedServerInfoScore } from '@jellyfin/sdk/lib/models/recommended-server-info'
import { useTranslation } from 'react-i18next'

import { WizardActions } from '../WizardActions'
import type { RecommendedServerInfo } from '@jellyfin/sdk/lib/models/recommended-server-info'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { getScoreDisplay } from '@/services/jellyfin'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectStepProps {
  servers: Array<RecommendedServerInfo>
  selectedServer: RecommendedServerInfo | null
  isLoading: boolean
  error: string | null
  onSelect: (server: RecommendedServerInfo) => void
  onBack: () => void
  onContinue: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getScoreIcon(score: RecommendedServerInfoScore) {
  switch (score) {
    case RecommendedServerInfoScore.GREAT:
    case RecommendedServerInfoScore.GOOD:
      return Shield
    case RecommendedServerInfoScore.OK:
      return ShieldAlert
    default:
      return ShieldOff
  }
}

function getBadgeVariant(
  variant: 'success' | 'warning' | 'error',
): 'default' | 'secondary' | 'destructive' {
  return variant === 'success'
    ? 'default'
    : variant === 'warning'
      ? 'secondary'
      : 'destructive'
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Item
// ─────────────────────────────────────────────────────────────────────────────

interface ServerItemProps {
  server: RecommendedServerInfo
  isSelected: boolean
  onSelect: () => void
  index: number
}

function ServerItem({ server, isSelected, onSelect, index }: ServerItemProps) {
  const scoreDisplay = useMemo(
    () => getScoreDisplay(server.score),
    [server.score],
  )
  const ScoreIcon = useMemo(() => getScoreIcon(server.score), [server.score])

  const serverName = server.systemInfo?.ServerName ?? 'Jellyfin Server'
  const serverVersion = server.systemInfo?.Version ?? 'Unknown version'
  const isHttps = server.address.toLowerCase().startsWith('https://')

  return (
    <button
      type="button"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      aria-selected={isSelected}
      aria-label={`${serverName} at ${server.address}, ${scoreDisplay.label} connection quality`}
      className={cn(
        'w-full text-left p-4 rounded-xl transition-all duration-200',
        'border-2 border-transparent',
        'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && 'border-primary bg-primary/5',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both',
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'size-10 rounded-lg flex items-center justify-center shrink-0',
            isSelected ? 'bg-primary/15' : 'bg-muted',
          )}
        >
          <Server
            className={cn(
              'size-5',
              isSelected ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-hidden
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{serverName}</span>
            {isSelected && (
              <Check className="size-4 text-primary shrink-0" aria-hidden />
            )}
          </div>

          <div className="text-sm text-muted-foreground truncate mb-2">
            {server.address}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={getBadgeVariant(scoreDisplay.variant)}>
              <ScoreIcon className="size-3" aria-hidden />
              {scoreDisplay.label}
            </Badge>
            <Badge variant="outline">v{serverVersion}</Badge>
            {isHttps && (
              <Badge
                variant="outline"
                className="text-green-600 dark:text-green-400"
              >
                HTTPS
              </Badge>
            )}
            {server.responseTime > 0 && (
              <span className="text-xs text-muted-foreground">
                {server.responseTime}ms
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Server List
// ─────────────────────────────────────────────────────────────────────────────

interface ServerListProps {
  servers: Array<RecommendedServerInfo>
  selectedServer: RecommendedServerInfo | null
  onSelect: (server: RecommendedServerInfo) => void
  isLoading: boolean
  error: string | null
}

function ServerList({
  servers,
  selectedServer,
  onSelect,
  isLoading,
  error,
}: ServerListProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (servers.length > 0 && !isLoading) {
      listRef.current?.querySelector('button')?.focus()
    }
  }, [servers.length, isLoading])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!listRef.current) return

    const buttons = Array.from(listRef.current.querySelectorAll('button'))
    const currentIndex = buttons.findIndex(
      (btn) => btn === document.activeElement,
    )

    let nextIndex = currentIndex
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        nextIndex = Math.min(currentIndex + 1, buttons.length - 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        nextIndex = Math.max(currentIndex - 1, 0)
        break
      case 'Home':
        e.preventDefault()
        nextIndex = 0
        break
      case 'End':
        e.preventDefault()
        nextIndex = buttons.length - 1
        break
      default:
        return
    }
    buttons[nextIndex]?.focus()
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-8 animate-spin mb-3" aria-hidden />
        <p>Discovering servers...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShieldOff className="size-8 text-destructive mb-3" aria-hidden />
        <p className="text-destructive font-medium mb-1">Discovery Failed</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Server className="size-8 text-muted-foreground mb-3" aria-hidden />
        <p className="font-medium mb-1">No Servers Found</p>
        <p className="text-sm text-muted-foreground">
          Check the server address and try again.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Discovered servers"
      onKeyDown={handleKeyDown}
      className="space-y-2"
    >
      {servers.map((server, index) => (
        <ServerItem
          key={server.address}
          server={server}
          isSelected={selectedServer?.address === server.address}
          onSelect={() => onSelect(server)}
          index={index}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function SelectStep({
  servers,
  selectedServer,
  isLoading,
  error,
  onSelect,
  onBack,
  onContinue,
}: SelectStepProps) {
  const { t } = useTranslation()
  const serverCountText =
    servers.length === 1 ? 'Found 1 server' : `Found ${servers.length} servers`

  // Check if the app is served over HTTPS and selected server uses HTTP (Mixed Content)
  // This causes issues in Firefox, so we show a warning
  const isMixedContent =
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    selectedServer &&
    !selectedServer.address.toLowerCase().startsWith('https://')

  return (
    <div className="space-y-6">
      {/* Inline header */}
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-1">Select Server</h2>
        <p className="text-sm text-muted-foreground">{serverCountText}</p>
      </div>

      <ServerList
        servers={servers}
        selectedServer={selectedServer}
        onSelect={onSelect}
        isLoading={isLoading}
        error={error}
      />

      {/* HTTP Warning for Firefox users - only when app is served over HTTPS */}
      {isMixedContent && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10"
          role="alert"
        >
          <AlertTriangle className="size-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">
              {t('login.http_warning.title')}
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              {t('login.http_warning.message')}
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
              {t('login.http_warning.browser_recommendation')}
            </p>
          </div>
        </div>
      )}

      <WizardActions
        onBack={onBack}
        onContinue={onContinue}
        isLoading={isLoading}
        continueDisabled={!selectedServer}
      />
    </div>
  )
}
