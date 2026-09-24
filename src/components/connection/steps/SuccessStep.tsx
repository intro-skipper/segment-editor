/**
 * SuccessStep Component
 *
 * Final step of the connection wizard - success confirmation.
 *
 * @module components/connection/steps/SuccessStep
 */

import { CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { RecommendedServerInfo } from '@/types/jellyfin'
import { IconDisc } from '@/components/ui/icon-disc'

interface SuccessStepProps {
  selectedServer: RecommendedServerInfo | null
  onComplete: () => void
}

export function SuccessStep({ selectedServer, onComplete }: SuccessStepProps) {
  return (
    <div className="space-y-6">
      {/* Inline header with success icon */}
      <div className="text-center">
        <IconDisc tone="success" className="mx-auto mb-4">
          <CheckCircle />
        </IconDisc>
        <h2 className="text-lg font-semibold mb-1">Connected!</h2>
        <p className="text-sm text-muted-foreground">
          Successfully connected to your Jellyfin server
        </p>
      </div>

      {selectedServer && (
        <div className="p-3 rounded-xl bg-muted/60 text-left">
          <p className="font-medium">
            {selectedServer.systemInfo?.ServerName ?? 'Jellyfin Server'}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {selectedServer.address}
          </p>
          {selectedServer.systemInfo?.Version && (
            <p className="text-xs text-muted-foreground mt-1">
              Version {selectedServer.systemInfo.Version}
            </p>
          )}
        </div>
      )}

      <Button onClick={onComplete} className="w-full">
        Get Started
      </Button>
    </div>
  )
}
