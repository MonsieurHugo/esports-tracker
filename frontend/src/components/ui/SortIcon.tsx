import { memo } from 'react'

interface SortIconProps {
  direction: 'asc' | 'desc'
  size?: number
}

function SortIcon({ direction, size = 10 }: SortIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="currentColor"
      className={`transition-transform ${direction === 'asc' ? 'rotate-180' : ''}`}
    >
      <path d="M5 7L1 3h8L5 7z" />
    </svg>
  )
}

export default memo(SortIcon)
