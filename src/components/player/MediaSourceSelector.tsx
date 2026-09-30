import { Check, Layers3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SelectableMediaSource } from '@/lib/media-source-utils'
import { getMediaSourceLabel } from '@/lib/media-source-utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export interface MediaSourceSelectorProps {
  sources: SelectableMediaSource[]
  value: string
  onValueChange: (value: string) => void
  portalContainer?: React.RefObject<HTMLElement | null>
}

/** Selects which of Jellyfin's alternate files is used by the editor player. */
export function MediaSourceSelector({
  sources,
  value,
  onValueChange,
  portalContainer,
}: MediaSourceSelectorProps) {
  const { t } = useTranslation()

  if (sources.length < 2) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="player"
            size="icon-xl"
            aria-label={t('accessibility.player.videoVersion', 'Video version')}
          />
        }
      >
        <Layers3 strokeWidth={2.5} aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="min-w-60 max-w-80"
        container={portalContainer}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <Layers3 className="size-4" aria-hidden="true" />
            {t('editor.videoVersion', 'Video version')}
          </DropdownMenuLabel>

          {sources.map((source, index) => {
            const isActive = source.Id.toLowerCase() === value.toLowerCase()

            return (
              <DropdownMenuItem
                key={source.Id}
                onClick={() => onValueChange(source.Id)}
                className="justify-between"
                aria-current={isActive || undefined}
              >
                <span className="truncate">
                  {getMediaSourceLabel(source, index)}
                </span>
                {isActive && (
                  <Check
                    className="size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
