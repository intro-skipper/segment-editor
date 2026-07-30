import { vi } from 'vitest'
import type * as CompatibilityModule from '@/services/video/compatibility'

type CompatibilityImportOriginal = () => Promise<typeof CompatibilityModule>

/**
 * Factories for `vi.mock('@/services/video/compatibility', ...)`.
 *
 * jsdom has no MediaCapabilities and canPlayType() returns '', which would
 * make every codec look undecodable. These rebuild `isAudioTrackDecodable`
 * so the native-switch paths stay testable.
 */

/** Resolves decodability from the real static allowlist alone. */
export async function mockCompatibilityFromAllowlist(
  importOriginal: CompatibilityImportOriginal,
): Promise<typeof CompatibilityModule> {
  const original = await importOriginal()
  return {
    ...original,
    isAudioTrackDecodable: vi.fn(async (track: { codec: string }) =>
      original.isAudioTrackDirectPlayable(track.codec),
    ),
  }
}

/**
 * Keeps the real static allowlist as the first gate (aac passes, dts is
 * rejected) and routes the second gate through a controllable
 * `isCodecSupported` mock, mirroring the real helper's two-gate composition
 * so tests control only the decoder answer. Configure the probe via
 * `vi.mocked(isCodecSupported)` after importing it from the mocked module.
 */
export async function mockCompatibilityWithProbe(
  importOriginal: CompatibilityImportOriginal,
): Promise<typeof CompatibilityModule> {
  const original = await importOriginal()
  const isCodecSupportedMock = vi.fn<typeof original.isCodecSupported>(() =>
    Promise.resolve(true),
  )
  return {
    ...original,
    isCodecSupported: isCodecSupportedMock,
    isAudioTrackDecodable: vi.fn(
      async (track: { codec: string; channels?: number }) =>
        original.isAudioTrackDirectPlayable(track.codec) &&
        (await isCodecSupportedMock(track.codec, 'audio', {
          channels: track.channels,
        })),
    ),
  }
}
