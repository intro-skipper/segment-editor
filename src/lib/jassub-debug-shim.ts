/**
 * Debug shim for JASSUB.
 * JASSUB's dist is missing the debug.js file, so we provide a minimal implementation.
 * This is only used for performance metrics and can be safely stubbed.
 */

export interface SubtitleCallbackMetadata {
  fps: number
  processingDuration: number
  droppedFrames: number
  presentedFrames: number
  mistimedFrames: number
  presentationTime: DOMHighResTimeStamp
  expectedDisplayTime: DOMHighResTimeStamp
  width: number
  height: number
  mediaTime: number
  frameDelay: DOMHighResTimeStamp
}

export class Debug {
  fps = () => 0
  processingDuration = () => 0
  droppedFrames = 0
  presentedFrames = 0
  mistimedFrames = 0

  _drop() {
    ++this.droppedFrames
  }

  _startTime = 0
  _startFrame() {
    this._startTime = performance.now()
  }

  onsubtitleFrameCallback?: (
    now: DOMHighResTimeStamp,
    metadata: SubtitleCallbackMetadata,
  ) => void

  _endFrame(meta: VideoFrameCallbackMetadata) {
    ++this.presentedFrames
    const now = performance.now()
    const frameDelay = Math.max(0, meta.expectedDisplayTime - now)
    if (frameDelay) ++this.mistimedFrames

    this.onsubtitleFrameCallback?.(now, {
      fps: 0,
      processingDuration: 0,
      droppedFrames: this.droppedFrames,
      presentedFrames: this.presentedFrames,
      mistimedFrames: this.mistimedFrames,
      presentationTime: now,
      expectedDisplayTime: meta.expectedDisplayTime,
      frameDelay,
      width: meta.width,
      height: meta.height,
      mediaTime: meta.mediaTime,
    })
  }
}
