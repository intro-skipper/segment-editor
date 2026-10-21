import { useEffect, useReducer } from 'react'
import type { Dispatch } from 'react'
import { CheckCircle, Loader, Monitor, XCircle } from 'lucide-react'

import { SettingsSection } from '../primitives/SettingsSection'
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

async function runCodecProbe(
  dispatch: Dispatch<CodecCompatibilityAction>,
  clearProbeCache: boolean,
) {
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
}

function CodecList({ title, codecs }: CodecListProps) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <div className="grid grid-cols-2 gap-2">
        {codecs.map(({ codec, supported, loading }) => (
          <div
            key={codec}
            className="flex items-center gap-2 p-2 rounded-md bg-muted/30"
          >
            {loading ? (
              <Loader className="size-4 text-muted-foreground" aria-hidden />
            ) : supported ? (
              <CheckCircle className="size-4 text-success" />
            ) : (
              <XCircle className="size-4 text-destructive" />
            )}
            <span className="text-sm font-mono uppercase">{codec}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CodecCompatibilitySection() {
  const [state, dispatch] = useReducer(
    codecCompatibilityReducer,
    initialCodecCompatibilityState,
  )
  const supportedContainers = getDirectPlayContainers()

  const handleRefresh = () => {
    void runCodecProbe(dispatch, true)
  }

  const handleExpand = () => {
    dispatch({ type: 'EXPAND_SECTION' })
  }

  useEffect(() => {
    if (!state.isExpanded || state.hasLoaded) return
    void runCodecProbe(dispatch, false)
  }, [state.isExpanded, state.hasLoaded])

  return (
    <SettingsSection icon={Monitor} title="Direct play compatibility">
      <div className="flex flex-col gap-4">
        <div className="text-xs text-muted-foreground">
          Browser codec support for direct video playback
        </div>

        {!state.isExpanded ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpand}
            className="w-full"
          >
            Check compatibility
          </Button>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium text-foreground">
                Supported containers
              </h4>
              <div className="flex gap-2 flex-wrap">
                {supportedContainers.map((container) => (
                  <div
                    key={container}
                    className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30"
                  >
                    {isDirectPlayContainerSupported(container) ? (
                      <CheckCircle className="size-3 text-success" />
                    ) : (
                      <XCircle className="size-3 text-destructive" />
                    )}
                    <span className="text-xs font-mono uppercase">
                      {container}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <CodecList title="Video codecs" codecs={state.videoCodecs} />
            <CodecList title="Audio codecs" codecs={state.audioCodecs} />

            <div className="pbs-2 border-bs border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={state.isRefreshing}
                className="w-full"
              >
                {state.isRefreshing ? (
                  <>
                    <Loader className="size-4" aria-hidden />
                    Checking…
                  </>
                ) : (
                  'Refresh compatibility'
                )}
              </Button>
            </div>

            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <p>
                <CheckCircle className="size-3 inline text-success me-1" />
                Green: Supported for direct play
              </p>
              <p>
                <XCircle className="size-3 inline text-destructive me-1" />
                Red: Requires transcoding (HLS)
              </p>
            </div>
          </>
        )}
      </div>
    </SettingsSection>
  )
}
