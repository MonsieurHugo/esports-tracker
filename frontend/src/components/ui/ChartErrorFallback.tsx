'use client'

interface Props {
  error: Error
  onRetry: () => void
  chartName?: string
}

export function ChartErrorFallback({ error, onRetry, chartName = 'Chart' }: Props) {
  return (
    <div className="h-[300px] flex flex-col items-center justify-center p-8 bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
      <p className="text-[var(--negative)] mb-2">Failed to load {chartName}</p>
      <p className="text-[var(--text-muted)] text-sm mb-4 text-center max-w-[300px]">
        Impossible de charger les données. Vérifiez votre connexion et réessayez.
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-[var(--accent)] text-black font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
      >
        Retry
      </button>
    </div>
  )
}
