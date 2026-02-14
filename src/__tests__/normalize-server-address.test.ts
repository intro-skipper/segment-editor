/**
 * Tests for normalizeServerAddress function
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { normalizeServerAddress } from '@/services/jellyfin/security'

describe('normalizeServerAddress', () => {
  it('should extract origin from full URL with path', () => {
    expect(normalizeServerAddress('https://jellyfin.example.com/web/#/home')).toBe(
      'https://jellyfin.example.com',
    )
  })

  it('should extract origin from URL with port', () => {
    expect(normalizeServerAddress('https://jellyfin.example.com:8096/web/#/home')).toBe(
      'https://jellyfin.example.com:8096',
    )
  })

  it('should handle URL with query parameters', () => {
    expect(normalizeServerAddress('https://example.com/path?query=value')).toBe(
      'https://example.com',
    )
  })

  it('should handle URL with fragment', () => {
    expect(normalizeServerAddress('https://example.com/#/settings')).toBe(
      'https://example.com',
    )
  })

  it('should return trimmed address for URLs without scheme', () => {
    expect(normalizeServerAddress('jellyfin.example.com')).toBe('jellyfin.example.com')
  })

  it('should return trimmed address for hostname with port', () => {
    expect(normalizeServerAddress('jellyfin.example.com:8096')).toBe(
      'jellyfin.example.com:8096',
    )
  })

  it('should handle http scheme', () => {
    expect(normalizeServerAddress('http://example.com/some/path')).toBe(
      'http://example.com',
    )
  })

  it('should handle empty string', () => {
    expect(normalizeServerAddress('')).toBe('')
  })

  it('should handle whitespace', () => {
    expect(normalizeServerAddress('  https://example.com/path  ')).toBe(
      'https://example.com',
    )
  })

  it('should handle localhost URLs', () => {
    expect(normalizeServerAddress('http://localhost:8096/web')).toBe(
      'http://localhost:8096',
    )
  })

  it('should handle IP address URLs', () => {
    expect(normalizeServerAddress('https://192.168.1.100:8920/jellyfin')).toBe(
      'https://192.168.1.100:8920',
    )
  })

  it('should preserve original if URL parsing fails', () => {
    // Invalid URL that still has a scheme - URL constructor might throw or handle differently
    const result = normalizeServerAddress('https://')
    // The URL constructor will throw for 'https://' alone, so we get back the trimmed input
    expect(result).toBe('https://')
  })
})
