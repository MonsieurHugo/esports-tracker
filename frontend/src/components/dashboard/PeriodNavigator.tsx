'use client'

interface PeriodNavigatorProps {
  label: string
  onPrevious: () => void
  onNext: () => void
  canGoNext: boolean
}

export default function PeriodNavigator({
  label,
  onPrevious,
  onNext,
  canGoNext,
}: PeriodNavigatorProps) {
  return (
    <div className="flex items-center gap-1 bg-[var(--bg-card)] px-1.5 py-[3px] rounded-md border border-[var(--border)]">
      <button
        onClick={onPrevious}
        className="w-6 h-6 border-none bg-transparent text-[var(--text-muted)] text-xs rounded cursor-pointer flex items-center justify-center hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-all duration-150"
      >
        ←
      </button>
      <span className="text-[11px] font-medium text-[var(--text-primary)] px-2 min-w-[130px] text-center">
        {label}
      </span>
      <button
        onClick={onNext}
        disabled={!canGoNext}
        className={`
          w-6 h-6 border-none bg-transparent text-xs rounded flex items-center justify-center transition-all duration-150
          ${
            canGoNext
              ? 'text-[var(--text-muted)] cursor-pointer hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
          }
        `}
      >
        →
      </button>
    </div>
  )
}
