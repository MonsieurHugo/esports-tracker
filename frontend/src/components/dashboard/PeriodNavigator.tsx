'use client'

interface PeriodNavigatorProps {
  label: string
  onPrevious: () => void
  onNext: () => void
  canGoNext: boolean
  canGoPrev?: boolean
}

export default function PeriodNavigator({
  label,
  onPrevious,
  onNext,
  canGoNext,
  canGoPrev = true,
}: PeriodNavigatorProps) {
  return (
    <div className="flex items-center gap-1 bg-(--bg-card) px-1.5 py-[3px] rounded-md border border-(--border) w-full">
      <button
        onClick={onPrevious}
        disabled={!canGoPrev}
        className={`
          w-6 h-6 border-none bg-transparent text-xs rounded-sm flex items-center justify-center transition-all duration-150
          ${
            canGoPrev
              ? 'text-(--text-muted) cursor-pointer hover:bg-(--bg-hover) hover:text-(--text-primary)'
              : 'text-(--text-muted) opacity-30 cursor-not-allowed'
          }
        `}
      >
        ←
      </button>
      <span className="text-[11px] font-medium text-(--text-primary) px-2 flex-1 text-center">
        {label}
      </span>
      <button
        onClick={onNext}
        disabled={!canGoNext}
        className={`
          w-6 h-6 border-none bg-transparent text-xs rounded flex items-center justify-center transition-all duration-150
          ${
            canGoNext
              ? 'text-(--text-muted) cursor-pointer hover:bg-(--bg-hover) hover:text-(--text-primary)'
              : 'text-(--text-muted) opacity-30 cursor-not-allowed'
          }
        `}
      >
        →
      </button>
    </div>
  )
}
