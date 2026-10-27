import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BaseItemDto } from '@/types/jellyfin'
import {
  PlaybackEngine,
  jellyfinPlaybackBackend,
} from '@/services/video/playback-engine'
import { loadHlsJs } from '@/services/video/hls-controller'
import { useAppStore } from '@/stores/app-store'
import { showNotification } from '@/lib/notifications'

/**
 * Owns the editor's playback engine and plays `item` (narrowed to one media
 * source) on whichever `<video>` connects to it through the returned videoRef.
 */
export function usePlaybackSession({ item }: { item: BaseItemDto }) {
  'use memo'

  const { t } = useTranslation()
  const jellyfinPlaybackSyncEnabled = useAppStore(
    (s) => s.jellyfinPlaybackSyncEnabled,
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const [engine] = useState(
    () => new PlaybackEngine(jellyfinPlaybackBackend, loadHlsJs, videoRef),
  )

  useLayoutEffect(() => {
    engine.setHost({
      t,
      onSwitchedToTranscode: () => {
        showNotification({
          type: 'info',
          message: t('player.notification.switchedToTranscode'),
          duration: 3000,
        })
      },
    })
  }, [engine, t])

  useEffect(() => {
    engine.load(item)
  }, [engine, item])

  useEffect(() => {
    engine.setSyncEnabled(jellyfinPlaybackSyncEnabled)
  }, [engine, jellyfinPlaybackSyncEnabled])

  return { engine, videoRef }
}
