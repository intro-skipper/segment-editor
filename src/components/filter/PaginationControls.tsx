import { useTranslation } from 'react-i18next'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { cn } from '@/lib/utils'

function buildMiddlePages(
  current: number,
  total: number,
): Array<number | 'ellipsis'> {
  const pages: Array<number | 'ellipsis'> = []
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  if (current > 3) pages.push('ellipsis')
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('ellipsis')

  return pages
}

function getPageNumbers(
  current: number,
  total: number,
): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: Array<number | 'ellipsis'> = [1]
  pages.push(...buildMiddlePages(current, total))
  pages.push(total)

  return pages
}

interface PaginationControlsProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationControlsProps) {
  const { t } = useTranslation()
  if (totalPages <= 1) return null
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <div className="mt-10">
      <Pagination>
        <PaginationContent className="gap-2">
          <PaginationItem>
            <PaginationPrevious
              onClick={
                currentPage === 1
                  ? undefined
                  : () => onPageChange(Math.max(1, currentPage - 1))
              }
              aria-disabled={currentPage === 1}
              tabIndex={currentPage === 1 ? -1 : undefined}
              aria-label={t('accessibility.pagination.previous')}
              className={cn(
                'rounded-full',
                currentPage === 1
                  ? 'pointer-events-none opacity-50'
                  : 'cursor-pointer',
              )}
            />
          </PaginationItem>

          {pageNumbers.map((pageNum, idx) =>
            pageNum === 'ellipsis' ? (
              <PaginationItem
                key={`ellipsis-${String(pageNumbers[idx - 1] ?? 'start')}-${String(pageNumbers[idx + 1] ?? 'end')}`}
              >
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={pageNum}>
                <PaginationLink
                  onClick={
                    currentPage === pageNum
                      ? undefined
                      : () => onPageChange(pageNum)
                  }
                  isActive={currentPage === pageNum}
                  aria-label={t('accessibility.pagination.page', {
                    page: pageNum,
                  })}
                  aria-current={currentPage === pageNum ? 'page' : undefined}
                  className={cn(
                    'rounded-full',
                    currentPage !== pageNum && 'cursor-pointer',
                    currentPage === pageNum &&
                      'bg-primary text-primary-foreground',
                  )}
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationNext
              onClick={
                currentPage === totalPages
                  ? undefined
                  : () => onPageChange(Math.min(totalPages, currentPage + 1))
              }
              aria-disabled={currentPage === totalPages}
              tabIndex={currentPage === totalPages ? -1 : undefined}
              aria-label={t('accessibility.pagination.next')}
              className={cn(
                'rounded-full',
                currentPage === totalPages
                  ? 'pointer-events-none opacity-50'
                  : 'cursor-pointer',
              )}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
