/**
 * The items API's failure contract: a missing server or an aborted call
 * rejects with a typed AppError instead of resolving as an empty library.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { getCollections, getSeasons } from '@/services/items/api'
import { useApiStore } from '@/stores/api-store'
import { ErrorCodes, isAbortError } from '@/lib/unified-error'

const SERIES_ID = '6872cc2e33a9909b7b2d07ab03abcb03'

afterEach(() => {
  useApiStore.setState({ serverAddress: '', apiKey: undefined })
})

describe('items API', () => {
  it('rejects with API_UNAVAILABLE instead of an empty list when no server is configured', async () => {
    useApiStore.setState({ serverAddress: '', apiKey: undefined })

    await expect(getCollections()).rejects.toMatchObject({
      code: ErrorCodes.API_UNAVAILABLE,
    })
  })

  it('rejects a call aborted before it starts as a cancellation', async () => {
    useApiStore.setState({
      serverAddress: 'http://localhost:8096',
      apiKey: 'key',
    })

    const error: unknown = await getSeasons(SERIES_ID, {
      signal: AbortSignal.abort(),
    }).catch((e: unknown) => e)

    expect(error).toMatchObject({ code: ErrorCodes.CANCELLED })
    expect(isAbortError(error)).toBe(true)
  })

  it('rejects a call aborted in flight as a cancellation', async () => {
    useApiStore.setState({
      serverAddress: 'http://localhost:8096',
      apiKey: 'key',
    })
    const controller = new AbortController()

    const pending = getSeasons(SERIES_ID, { signal: controller.signal })
    controller.abort()
    const error: unknown = await pending.catch((e: unknown) => e)

    expect(error).toMatchObject({ code: ErrorCodes.CANCELLED })
    expect(isAbortError(error)).toBe(true)
  })
})
