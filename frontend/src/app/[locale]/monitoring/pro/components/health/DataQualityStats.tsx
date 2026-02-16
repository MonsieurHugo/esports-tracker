'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'

interface DataQuality {
  totalGames: number
  coverage: {
    stats: { count: number; percent: number }
    draft: { count: number; percent: number }
    events: { count: number; percent: number }
    timing: { count: number; percent: number }
    objectives: { count: number; percent: number }
  }
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-full bg-[var(--bg-secondary)] rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  )
}

function CoverageCard({
  label,
  count,
  percent,
  total,
}: {
  label: string
  count: number
  percent: number
  total: number
}) {
  const getColor = (p: number) => {
    if (p >= 90) return 'bg-green-500'
    if (p >= 70) return 'bg-[var(--accent)]'
    if (p >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-(--text-secondary)">{label}</span>
        <span className="font-mono text-lg font-bold text-(--text-primary)">
          {percent}%
        </span>
      </div>
      <ProgressBar percent={percent} color={getColor(percent)} />
      <div className="mt-2 text-xs text-(--text-muted)">
        {count.toLocaleString()} / {total.toLocaleString()} games
      </div>
    </div>
  )
}

export default function DataQualityStats() {
  const [data, setData] = useState<DataQuality | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const response = await api.get<DataQuality>('/pro/monitoring/data-quality')
      setData(response)
    } catch (error) {
      logError('Failed to fetch data quality', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center text-(--text-muted)">
        Failed to load data quality metrics
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Data Coverage */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-(--text-primary)">Data Coverage</h3>
          <span className="text-xs text-(--text-muted)">
            Total: {data.totalGames.toLocaleString()} games
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <CoverageCard
            label="Player Stats"
            count={data.coverage.stats.count}
            percent={data.coverage.stats.percent}
            total={data.totalGames}
          />
          <CoverageCard
            label="Draft Data"
            count={data.coverage.draft.count}
            percent={data.coverage.draft.percent}
            total={data.totalGames}
          />
          <CoverageCard
            label="Game Events"
            count={data.coverage.events.count}
            percent={data.coverage.events.percent}
            total={data.totalGames}
          />
          <CoverageCard
            label="Timing Data"
            count={data.coverage.timing.count}
            percent={data.coverage.timing.percent}
            total={data.totalGames}
          />
          <CoverageCard
            label="Objectives"
            count={data.coverage.objectives.count}
            percent={data.coverage.objectives.percent}
            total={data.totalGames}
          />
        </div>
      </div>

      {/* Data Quality Summary */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <h3 className="text-sm font-medium text-(--text-primary) mb-4">
          Quality Summary
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Complete Games */}
          <div className="bg-[var(--bg-secondary)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-(--text-secondary)">Complete Data</span>
            </div>
            <p className="text-xs text-(--text-muted)">
              Games with stats, draft, and events: {' '}
              <span className="font-mono text-(--text-primary)">
                {Math.min(
                  data.coverage.stats.count,
                  data.coverage.draft.count,
                  data.coverage.events.count
                ).toLocaleString()}
              </span>
            </p>
          </div>

          {/* Partial Games */}
          <div className="bg-[var(--bg-secondary)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-sm text-(--text-secondary)">Partial Data</span>
            </div>
            <p className="text-xs text-(--text-muted)">
              Games with stats only: {' '}
              <span className="font-mono text-(--text-primary)">
                {Math.max(0, data.coverage.stats.count - data.coverage.events.count).toLocaleString()}
              </span>
            </p>
          </div>

          {/* Missing Data */}
          <div className="bg-[var(--bg-secondary)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-sm text-(--text-secondary)">Missing Data</span>
            </div>
            <p className="text-xs text-(--text-muted)">
              Games without stats: {' '}
              <span className="font-mono text-(--text-primary)">
                {Math.max(0, data.totalGames - data.coverage.stats.count).toLocaleString()}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
