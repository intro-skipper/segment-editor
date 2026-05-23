import { describe, expect, it } from 'vitest'

import { createPlaySessionId } from '@/services/video/session'

describe('video session helpers', () => {
  it('creates explicit play session ids', () => {
    expect(createPlaySessionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
