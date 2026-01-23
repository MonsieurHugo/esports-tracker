'use client'

import { useState } from 'react'
import { useMatches } from '@/hooks/useProData'
import { MatchCard } from '@/components/pro/MatchCard'
import { cn } from '@/lib/utils'
import { useSearchParams } from 'next/navigation'

type StatusFilter = 'all' | 'live' | 'upcoming' | 'completed'

export default function MatchesPage() {
  const searchParams = useSearchParams()
  const initialStatus = (searchParams.get('status') as StatusFilter) || 'all'

  const [status, setStatus] = useState<StatusFilter>(initialStatus)
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useMatches({
    status: status === 'all' ? undefined : status,
    page,
    perPage: 20,
  })

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'live', label: 'Live' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'completed', label: 'Completed' },
  ]

  return (
    <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Matches
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Browse professional League of Legends matches
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        {statusOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => {
              setStatus(option.value)
              setPage(1)
            }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              status === option.value
                ? 'bg-[var(--accent)] text-black'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              option.value === 'live' && status !== 'live' && 'border border-red-500/30'
            )}
          >
            {option.value === 'live' && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block mr-1.5 animate-pulse" />
            )}
            {option.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 bg-[var(--bg-card)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--negative)]">{error.message}</p>
        </div>
      ) : data?.data && data.data.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.data.map((match) => (
              <MatchCard key={match.matchId} match={match} />
            ))}
          </div>

          {/* Pagination */}
          {data.meta.lastPage > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-[var(--text-muted)]">
                Page {page} of {data.meta.lastPage}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.meta.lastPage, p + 1))}
                disabled={page === data.meta.lastPage}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--text-muted)]">
            {status === 'live' ? 'No live matches at the moment' : 'No matches found'}
          </p>
        </div>
      )}
    </main>
  )
}
