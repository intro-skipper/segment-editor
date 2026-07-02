/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsSelect } from '@/components/settings/primitives/SettingsSelect'

const options = [
  { value: 'auto', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

describe('SettingsSelect', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the selected option label in the closed trigger, not the raw value', () => {
    render(
      <SettingsSelect
        value="auto"
        onValueChange={vi.fn()}
        options={options}
        aria-label="Theme"
      />,
    )

    const trigger = screen.getByRole('combobox', { name: 'Theme' })
    expect(trigger.textContent).toContain('System')
    expect(trigger.textContent).not.toContain('auto')
  })

  it('updates the trigger label when the value changes', () => {
    const { rerender } = render(
      <SettingsSelect
        value="dark"
        onValueChange={vi.fn()}
        options={options}
        aria-label="Theme"
      />,
    )

    expect(
      screen.getByRole('combobox', { name: 'Theme' }).textContent,
    ).toContain('Dark')

    rerender(
      <SettingsSelect
        value="light"
        onValueChange={vi.fn()}
        options={options}
        aria-label="Theme"
      />,
    )

    expect(
      screen.getByRole('combobox', { name: 'Theme' }).textContent,
    ).toContain('Light')
  })
})
