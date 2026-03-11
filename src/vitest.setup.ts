import { vi } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => {
      store[key] = value
    },
    removeItem: (key: string): void => {
      delete store[key]
    },
    clear: (): void => {
      store = {}
    },
    get length(): number {
      return Object.keys(store).length
    },
    key: (index: number): string | null => {
      const keys = Object.keys(store)
      return keys[index] ?? null
    },
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => {
      store[key] = value
    },
    removeItem: (key: string): void => {
      delete store[key]
    },
    clear: (): void => {
      store = {}
    },
    get length(): number {
      return Object.keys(store).length
    },
    key: (index: number): string | null => {
      const keys = Object.keys(store)
      return keys[index] ?? null
    },
  }
})()

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
})

// Mock window.matchMedia
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock window.resizeTo
Object.defineProperty(globalThis, 'resizeTo', {
  writable: true,
  value: vi.fn(),
})

// Mock navigator
Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'node.js',
    language: 'en-US',
    languages: ['en-US', 'en'],
  },
  writable: true,
})

// Mock crypto.randomUUID - generates proper UUID v4 format
let uuidCounter = 0
function generateMockUUID(): string {
  uuidCounter++
  const hex = '0123456789abcdef'
  // Generate random hex digits
  const randomHex = () => hex[Math.floor(Math.random() * 16)]
  // Generate variant bits (8, 9, a, or b)
  const variantHex = () => ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]

  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // - Position 14 (index 14) is '4' (version)
  // - Position 19 (index 19) is variant (8, 9, a, or b)
  const part1 = Array(8).fill(0).map(() => randomHex()).join('')
  const part2 = Array(4).fill(0).map(() => randomHex()).join('')
  const part3 = '4' + Array(3).fill(0).map(() => randomHex()).join('')
  const part4 = variantHex() + Array(3).fill(0).map(() => randomHex()).join('')
  const part5 = Array(12).fill(0).map(() => randomHex()).join('')

  return `${part1}-${part2}-${part3}-${part4}-${part5}`
}

Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: vi.fn(() => generateMockUUID()),
    getRandomValues: <T extends Uint8Array>(arr: T): T => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256) as unknown as T[number]
      }
      return arr
    },
  },
  writable: true,
})
