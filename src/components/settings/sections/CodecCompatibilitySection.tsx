/**
 * CodecCompatibilitySection Component
 *
 * Shows browser codec compatibility information for direct play.
 *
 * @module components/settings/sections/CodecCompatibilitySection
 */

import { useCallback, useEffect, useReducer } from 'react'
import { CheckCircle, Loader2, Monitor, XCircle } from 'lucide-react'

import { SettingsSection } from '../primitives'
import {
  DIRECT_PLAY_AUDIO_CODECS,
  DIRECT_PLAY_VIDEO_CODECS,
  clearCache,
  getDirectPlayContainers,
  isCodecSupported,
  isDirectPlayContainerSupported,
} from '@/services/video/compatibility'
import { Button } from '@/components/ui/button'

interface CodecSupport {
  codec: string
  supported: boolean
  loading: boolean
}

interface CodecListProps {
  title: string
  codecs: Array<CodecSupport>
}

interface CodecCompatibilityState {
  videoCodecs: Array<CodecSupport>
  audioCodecs: Array<CodecSupport>
  isRefreshing: boolean
  isExpanded: boolean
  hasLoaded: boolean
}

type CodecCompatibilityAction =
  | { type: 'EXPAND_SECTION' }
  | { type: 'PROBE_STARTED' }
  | {
      type: 'PROBE_SUCCEEDED'
      videoResults: Array<CodecSupport>
      audioResults: Array<CodecSupport>
    }
  | { type: 'PROBE_FAILED' }

const initialCodecCompatibilityState: CodecCompatibilityState = {
  videoCodecs: [],
  audioCodecs: [],
  isRefreshing: false,
  isExpanded: false,
  hasLoaded: false,
}

function setCodecListLoadingState(
  codecs: ReadonlyArray<CodecSupport>,
  loading: boolean,
): Array<CodecSupport> {
  return codecs.map((codec) => ({ ...codec, loading }))
}

function codecCompatibilityReducer(
  state: CodecCompatibilityState,
  action: CodecCompatibilityAction,
): CodecCompatibilityState {
  switch (action.type) {
    case 'EXPAND_SECTION':
      return {
        ...state,
        isExpanded: true,
      }
    case 'PROBE_STARTED':
      return {
        ...state,
        isRefreshing: true,
        videoCodecs:
          state.videoCodecs.length > 0
            ? setCodecListLoadingState(state.videoCodecs, true)
            : createLoadingCodecList(DIRECT_PLAY_VIDEO_CODECS),
        audioCodecs:
          state.audioCodecs.length > 0
            ? setCodecListLoadingState(state.audioCodecs, true)
            : createLoadingCodecList(DIRECT_PLAY_AUDIO_CODECS),
      }
    case 'PROBE_SUCCEEDED':
      return {
        ...state,
        videoCodecs: action.videoResults,
        audioCodecs: action.audioResults,
        isRefreshing: false,
        hasLoaded: true,
      }
    case 'PROBE_FAILED':
      return {
        ...state,
        videoCodecs: setCodecListLoadingState(state.videoCodecs, false),
        audioCodecs: setCodecListLoadingState(state.audioCodecs, false),
        isRefreshing: false,
      }
    default:
      return state
  }
}

function createLoadingCodecList(
  codecs: ReadonlyArray<string>,
): Array<CodecSupport> {
  return codecs.map((codec) => ({
    codec,
    supported: false,
    loading: true,
  }))
}

async function getCodecSupportResults() {
  const [videoResults, audioResults] = await Promise.all([
    Promise.all(
      DIRECT_PLAY_VIDEO_CODECS.map(async (codec) => {
        const supported = await isCodecSupported(codec, 'video')
        return { codec, supported, loading: false }
      }),
    ),
    Promise.all(
      DIRECT_PLAY_AUDIO_CODECS.map(async (codec) => {
        const supported = await isCodecSupported(codec, 'audio')
        return { codec, supported, loading: false }
      }),
    ),
  ])

  return { videoResults, audioResults }
}

function CodecList({ title, codecs }: CodecListProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <div className="grid grid-cols-2 gap-2">
        {codecs.map(({ codec, supported, loading }) => (
          <div
            key={codec}
            className="flex items-center gap-2 p-2 rounded-md bg-muted/30"
          >
            {loading ? (
              <div className="animate-spin" aria-hidden>
                <Loader2 className="size-4 text-muted-foreground" />
              </div>
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
}

/**
 * Settings section showing codec compatibility for direct play.
 */
export function CodecCompatibilitySection() {
  const [state, dispatch] = useReducer(
    codecCompatibilityReducer,
    initialCodecCompatibilityState,
  )
  const supportedContainers = getDirectPlayContainers()

  const runCodecProbe = useCallback(async (clearProbeCache: boolean) => {
    if (clearProbeCache) {
      clearCache()
    }

    dispatch({ type: 'PROBE_STARTED' })

    try {
      const { videoResults, audioResults } = await getCodecSupportResults()
      dispatch({ type: 'PROBE_SUCCEEDED', videoResults, audioResults })
    } catch {
      dispatch({ type: 'PROBE_FAILED' })
    }
  }, [])

  const handleRefresh = useCallback(() => {
    void runCodecProbe(true)
  }, [runCodecProbe])

  const handleExpand = useCallback(() => {
    dispatch({ type: 'EXPAND_SECTION' })
  }, [])

  useEffect(() => {
    if (!state.isExpanded || state.hasLoaded) return

    let cancelled = false

    const run = async () => {
      dispatch({ type: 'PROBE_STARTED' })

      try {
        const { videoResults, audioResults } = await getCodecSupportResults()
        if (!cancelled) {
          dispatch({ type: 'PROBE_SUCCEEDED', videoResults, audioResults })
        }
      } catch {
        if (!cancelled) {
          dispatch({ type: 'PROBE_FAILED' })
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [state.isExpanded, state.hasLoaded])

  return (
    <SettingsSection icon={Monitor} title="Direct Play Compatibility">
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground mb-3">
          Browser codec support for direct video playback
        </div>

        {!state.isExpanded ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpand}
            className="w-full"
          >
            Check Compatibility
          </Button>
        ) : (
          <>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">
                Supported Containers
              </h4>
              <div className="flex gap-2 flex-wrap">
                {supportedContainers.map((container) => (
                  <div
                    key={container}
                    className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30"
                  >
                    {isDirectPlayContainerSupported(container) ? (
                      <CheckCircle className="size-3 text-green-500" />
                    ) : (
                      <XCircle className="size-3 text-red-500" />
                    )}
                    <span className="text-xs font-mono uppercase">
                      {container}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <CodecList title="Video Codecs" codecs={state.videoCodecs} />
            <CodecList title="Audio Codecs" codecs={state.audioCodecs} />

            <div className="pt-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={state.isRefreshing}
                className="w-full"
              >
                {state.isRefreshing ? (
                  <>
                    <div className="animate-spin" aria-hidden>
                      <Loader2 className="size-4 mr-2" />
                    </div>
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
          </>
        )}
      </div>
    </SettingsSection>
  )
}
