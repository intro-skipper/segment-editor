/**
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useValueWhileOpen } from '@/hooks/use-value-while-open'

describe('useValueWhileOpen', () => {
  it('keeps the value it had while open once the popup closes', () => {
    const initialProps: { open: boolean; value?: string } = {
      open: true,
      value: 'Intro',
    }
    const { result, rerender } = renderHook(
      ({ open, value }) => useValueWhileOpen(open, value),
      { initialProps },
    )
    expect(result.current).toBe('Intro')

    rerender({ open: false, value: undefined })
    expect(result.current).toBe('Intro')

    rerender({ open: true, value: 'Outro' })
    expect(result.current).toBe('Outro')
  })
})
