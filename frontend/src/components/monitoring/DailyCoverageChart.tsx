'use client'

import { memo, useEffect, useState, useMemo } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
  ReferenceLine,
  Cell,
} from 'recharts'
import api from '@/lib/api'

interface DailyCoverageData {
  date: string
  accounts_with_data: number
  expected_accounts: number
}

interface DailyCoverageResponse {
  total_accounts: number
  data: DailyCoverageData[]
}

function DailyCoverageChart() {
  const [data, setData] = useState<DailyCoverageResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [days, setDays] = useState(14)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const res = await api.get<DailyCoverageResponse>('/worker/daily-coverage', {
          params: { days },
        })
        setData(res)
      } catch (error) {
        console.error('Failed to fetch daily coverage:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [days])

  const chartData = useMemo(() => {
    if (!data?.data) return []
    return data.data.map((d) => {
      const expected = d.expected_accounts
      // If expected is 0 or very low (before tracking started), use accounts_with_data as reference
      const effectiveExpected = expected > 0 ? expected : d.accounts_with_data
      const rawCoverage = effectiveExpected > 0
        ? Math.round((d.accounts_with_data / effectiveExpected) * 100)
        : 0
      // Cap coverage at 100% for display (old data might exceed 100%)
      const coverage = Math.min(rawCoverage, 100)
      return {
        label: new Date(d.date).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'short',
        }),
        accounts: d.accounts_with_data,
        expected: expected,
        coverage: coverage,
        isPerfect: coverage === 100 && expected > 0 && d.accounts_with_data === expected,
        isLegacy: expected === 0 || rawCoverage > 100, // Data before comprehensive tracking
      }
    })
  }, [data])

  const avgCoverage = useMemo(() => {
    // Only count non-legacy days for average
    const validDays = chartData.filter(d => !d.isLegacy)
    if (!validDays.length) return 0
    const total = validDays.reduce((acc, d) => acc + d.coverage, 0)
    return Math.round(total / validDays.length)
  }, [chartData])

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Couverture Daily Stats</h3>
          {data && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {data.total_accounts} comptes actifs
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {avgCoverage > 0 && (
            <span className={`text-xs font-medium ${
              avgCoverage === 100 ? 'text-blue-500' :
              avgCoverage >= 90 ? 'text-green-500' :
              avgCoverage >= 70 ? 'text-yellow-500' : 'text-red-500'
            }`}>
              Moy: {avgCoverage}%
            </span>
          )}
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2 py-1 text-[10px] rounded transition-colors ${
                  days === d
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
                }`}
              >
                {d}j
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 h-[200px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            Chargement...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            Aucune donnee disponible
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
                allowDecimals={false}
                domain={[0, data?.total_accounts || 'auto']}
                tickCount={5}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string, props: { payload?: { expected?: number; coverage?: number; isLegacy?: boolean } }) => {
                  if (name === 'accounts') {
                    const expected = props.payload?.expected || 0
                    const coverage = props.payload?.coverage || 0
                    const isLegacy = props.payload?.isLegacy
                    if (isLegacy) {
                      return [`${value} comptes (ancien tracking)`, 'Comptes']
                    }
                    return [`${value}/${expected} (${coverage}%)`, 'Comptes']
                  }
                  return [value, name]
                }}
              />
              {data?.total_accounts && (
                <ReferenceLine
                  y={data.total_accounts}
                  stroke="var(--text-muted)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
              )}
              <Bar dataKey="accounts" name="accounts" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.isLegacy ? '#6b7280' : // Gray for legacy data
                      entry.isPerfect ? '#3b82f6' :
                      entry.coverage >= 90 ? '#22c55e' :
                      entry.coverage >= 70 ? '#eab308' : '#ef4444'
                    }
                    fillOpacity={entry.isLegacy ? 0.5 : entry.isPerfect ? 1 : 0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 pb-3 flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-blue-500" />
          <span>100%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-green-500" />
          <span>90-99%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-yellow-500" />
          <span>70-89%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-red-500" />
          <span>&lt;70%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-gray-500 opacity-50" />
          <span>Ancien</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <div className="w-4 border-t border-dashed border-[var(--text-muted)]" />
          <span>Total comptes</span>
        </div>
      </div>
    </div>
  )
}

export default memo(DailyCoverageChart)
