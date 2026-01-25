/**
 * CodecCompatibilitySection Component
 *
 * Shows browser codec compatibility information for direct play.
 *
 * @module components/settings/sections/CodecCompatibilitySection
 */

import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Loader2, Monitor, XCircle } from 'lucide-react'

import { SettingsSection } from '../primitives'
import {
  DIRECT_PLAY_AUDIO_CODECS,
  DIRECT_PLAY_CONTAINERS,
  DIRECT_PLAY_VIDEO_CODECS,
  clearCache,
  isCodecSupported,
} from '@/services/video/compatibility'
import { Button } from '@/components/ui/button'

interface CodecSupport {
  codec: string
  supported: boolean
  loading: boolean
}

/**
 * Settings section showing codec compatibility for direct play.
 */
export function CodecCompatibilitySection() {
  const [videoCodecs, setVideoCodecs] = useState<Array<CodecSupport>>([])
  const [audioCodecs, setAudioCodecs] = useState<Array<CodecSupport>>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasInitializedRef = useRef(false)

  const checkCodecSupport = async () => {
    // Initialize with loading state
    const videoCodecList = DIRECT_PLAY_VIDEO_CODECS.map((codec) => ({
      codec,
      supported: false,
      loading: true,
    }))
    const audioCodecList = DIRECT_PLAY_AUDIO_CODECS.map((codec) => ({
      codec,
      supported: false,
      loading: true,
    }))

    setVideoCodecs(videoCodecList)
    setAudioCodecs(audioCodecList)

    // Check video codecs
    const videoResults = await Promise.all(
      DIRECT_PLAY_VIDEO_CODECS.map(async (codec) => {
        const supported = await isCodecSupported(codec, 'video')
        return { codec, supported, loading: false }
      }),
    )

    // Check audio codecs
    const audioResults = await Promise.all(
      DIRECT_PLAY_AUDIO_CODECS.map(async (codec) => {
        const supported = await isCodecSupported(codec, 'audio')
        return { codec, supported, loading: false }
      }),
    )

    setVideoCodecs(videoResults)
    setAudioCodecs(audioResults)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    clearCache()
    await checkCodecSupport()
    setIsRefreshing(false)
  }

  // Initialize codec check on mount - async operation requires effect
  /* eslint-disable react-you-might-not-need-an-effect/no-initialize-state */
  useEffect(() => {
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true
    checkCodecSupport()
  }, [])
  /* eslint-enable react-you-might-not-need-an-effect/no-initialize-state */

  const CodecList = ({
    title,
    codecs,
  }: {
    title: string
    codecs: Array<CodecSupport>
  }) => (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <div className="grid grid-cols-2 gap-2">
        {codecs.map(({ codec, supported, loading }) => (
          <div
            key={codec}
            className="flex items-center gap-2 p-2 rounded-md bg-muted/30"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : supported ? (
              <CheckCircle className="size-4 text-green-500" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <span className="text-sm font-mono uppercase">{codec}</span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <SettingsSection icon={Monitor} title="Direct Play Compatibility">
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground mb-3">
          Browser codec support for direct video playback
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">
            Supported Containers
          </h4>
          <div className="flex gap-2 flex-wrap">
            {DIRECT_PLAY_CONTAINERS.map((container) => (
              <div
                key={container}
                className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30"
              >
                <CheckCircle className="size-3 text-green-500" />
                <span className="text-xs font-mono uppercase">{container}</span>
              </div>
            ))}
          </div>
        </div>

        <CodecList title="Video Codecs" codecs={videoCodecs} />
        <CodecList title="Audio Codecs" codecs={audioCodecs} />

        <div className="pt-2 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full"
          >
            {isRefreshing ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              'Refresh Compatibility'
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <CheckCircle className="size-3 inline text-green-500 mr-1" />
            Green: Supported for direct play
          </p>
          <p>
            <XCircle className="size-3 inline text-red-500 mr-1" />
            Red: Requires transcoding (HLS)
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}
