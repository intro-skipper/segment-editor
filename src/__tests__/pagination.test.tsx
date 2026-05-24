// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination'

describe('Pagination', () => {
  it('forwards nav aria-label and link children/current state', () => {
    render(
      <Pagination aria-label="Results pages">
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="/page/2" isActive aria-label="Page 2">
              2
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    )

    expect(
      screen.getByRole('navigation', { name: 'Results pages' }),
    ).toBeTruthy()
    const currentPage = screen.getByRole('link', { name: 'Page 2' })
    expect(currentPage.textContent).toBe('2')
    expect(currentPage.getAttribute('aria-current')).toBe('page')
  })

  it('renders an accessible button when no href is provided', () => {
    const onClick = vi.fn()

    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink onClick={onClick} aria-label="Page 3">
              3
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    )

    const pageButton = screen.getByRole('button', { name: 'Page 3' })
    expect(pageButton.textContent).toBe('3')

    fireEvent.click(pageButton)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('keeps disabled no-href pagination controls inert', () => {
    const onClick = vi.fn()

    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink disabled onClick={onClick} aria-label="Previous page">
              Previous
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    )

    const previousButton = screen.getByRole('button', {
      name: 'Previous page',
    })
    expect(previousButton).toBeInstanceOf(HTMLButtonElement)
    expect((previousButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(previousButton)

    expect(onClick).not.toHaveBeenCalled()
  })
})
