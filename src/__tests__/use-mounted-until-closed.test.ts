/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useMountedUntilClosed } from '@/hooks/use-mounted-until-closed'

describe('useMountedUntilClosed', () => {
  it('stays mounted after closing until the exit animation completes', () => {
    const { result, rerender } = renderHook(
      ({ open }) => useMountedUntilClosed(open),
      { initialProps: { open: false } },
    )
    expect(result.current[0]).toBe(false)

    rerender({ open: true })
    expect(result.current[0]).toBe(true)

    rerender({ open: false })
    expect(result.current[0]).toBe(true)

    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
  })
})
