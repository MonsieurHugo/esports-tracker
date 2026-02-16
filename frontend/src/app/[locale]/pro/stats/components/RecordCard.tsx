'use client'

interface RecordEntry {
  label: string
  value: string
  detail?: string
}

interface RecordCardProps {
  title: string
  entries: RecordEntry[]
}

export default function RecordCard({ title, entries }: RecordCardProps) {
  if (entries.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <h3 className="text-sm font-medium text-(--text-primary) mb-3">{title}</h3>
        <p className="text-xs text-(--text-muted)">Pas de donnees</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
      <h3 className="text-sm font-medium text-(--text-primary) mb-3">{title}</h3>
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div
            key={index}
            className={`flex items-center gap-3 ${index === 0 ? 'pb-2 border-b border-[var(--border)]' : ''}`}
          >
            <span
              className={`font-mono text-xs w-5 text-right ${
                index === 0 ? 'text-[var(--accent)] font-bold' : 'text-(--text-muted)'
              }`}
            >
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-mono text-sm ${
                    index === 0 ? 'text-[var(--accent)] font-bold' : 'text-(--text-primary)'
                  }`}
                >
                  {entry.value}
                </span>
                <span className="text-xs text-(--text-secondary) truncate">
                  {entry.label}
                </span>
              </div>
              {entry.detail && (
                <span className="text-[10px] text-(--text-muted) block truncate">
                  {entry.detail}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
