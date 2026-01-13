'use client'

import type { ItemsPerPageOption } from '@/stores/dashboardStore'

interface PaginationProps {
  currentPage: number
  totalItems: number
  itemsPerPage: ItemsPerPageOption
  onPageChange: (page: number) => void
  onItemsPerPageChange: (count: ItemsPerPageOption) => void
}

const ITEMS_PER_PAGE_OPTIONS: ItemsPerPageOption[] = [10, 20, 50]

export default function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: PaginationProps) {
  const lastPage = Math.ceil(totalItems / itemsPerPage)
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div className="flex justify-between items-center px-3 py-2 border-t border-(--border)">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-(--text-muted)">
          {startItem} - {endItem} sur {totalItems}
        </span>
        <div className="flex items-center gap-1">
          {ITEMS_PER_PAGE_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => onItemsPerPageChange(option)}
              className={`
                px-1.5 py-0.5 text-[10px] rounded transition-all duration-150
                ${
                  itemsPerPage === option
                    ? 'bg-(--accent) text-white'
                    : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-hover)'
                }
              `}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={`
            w-7 h-7 border border-(--border) bg-(--bg-secondary) text-(--text-secondary) text-xs rounded flex items-center justify-center transition-all duration-150
            ${
              currentPage <= 1
                ? 'opacity-30 cursor-not-allowed'
                : 'cursor-pointer hover:bg-(--bg-hover) hover:border-(--text-muted) hover:text-(--text-primary)'
            }
          `}
        >
          ←
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= lastPage}
          className={`
            w-7 h-7 border border-(--border) bg-(--bg-secondary) text-(--text-secondary) text-xs rounded flex items-center justify-center transition-all duration-150
            ${
              currentPage >= lastPage
                ? 'opacity-30 cursor-not-allowed'
                : 'cursor-pointer hover:bg-(--bg-hover) hover:border-(--text-muted) hover:text-(--text-primary)'
            }
          `}
        >
          →
        </button>
      </div>
    </div>
  )
}
