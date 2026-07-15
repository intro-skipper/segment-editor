/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useInView } from '@/hooks/use-in-view'

function Probe({ rootMargin }: { rootMargin?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin })
  return <div ref={ref}>{inView ? 'visible' : 'hidden'}</div>
}

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void

class MockIntersectionObserver {
  static instances: Array<MockIntersectionObserver> = []
  callback: ObserverCallback
  options?: IntersectionObserverInit
  observed: Array<Element> = []
  disconnected = false

  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    MockIntersectionObserver.instances.push(this)
  }

  observe(element: Element) {
    this.observed.push(element)
  }

  disconnect() {
    this.disconnected = true
  }

  unobserve() {}
}

const installMockObserver = () => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
}

describe('useInView', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    MockIntersectionObserver.instances = []
  })

  it('falls back to visible when IntersectionObserver is unavailable', () => {
    // jsdom has no IntersectionObserver by default
    render(<Probe />)

    expect(screen.getByText('visible')).toBeTruthy()
  })

  it('stays hidden until the element intersects, then latches', () => {
    installMockObserver()
    render(<Probe rootMargin="600px 0px" />)

    const probe = screen.getByText('hidden')

    const observer = MockIntersectionObserver.instances[0]
    expect(observer.options?.rootMargin).toBe('600px 0px')
    expect(observer.observed).toContain(probe)

    act(() => {
      observer.callback([{ isIntersecting: false }])
    })
    expect(probe.textContent).toBe('hidden')

    act(() => {
      observer.callback([{ isIntersecting: true }])
    })
    expect(probe.textContent).toBe('visible')
    expect(observer.disconnected).toBe(true)

    // Latch: no further observation once visible
    expect(MockIntersectionObserver.instances).toHaveLength(1)
  })
})
