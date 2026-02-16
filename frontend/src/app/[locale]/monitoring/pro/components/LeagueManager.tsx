'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'

interface League {
  id: number
  externalId: string | null
  name: string
  shortName: string | null
  region: string | null
  tier: number | null
  isFollowed: boolean
}

interface LeagueManagerProps {
  onLeaguesChange?: () => void
}

const REGIONS = ['EMEA', 'Americas', 'Asia', 'Korea', 'China', 'Other']

export default function LeagueManager({ onLeaguesChange }: LeagueManagerProps) {
  const [leagues, setLeagues] = useState<League[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formShortName, setFormShortName] = useState('')
  const [formRegion, setFormRegion] = useState('')
  const [formTier, setFormTier] = useState(1)

  const fetchLeagues = useCallback(async () => {
    try {
      const data = await api.get<{ data: League[] }>('/pro/monitoring/leagues')
      setLeagues(data.data)
    } catch (error) {
      logError('Failed to fetch leagues', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeagues()
  }, [fetchLeagues])

  const resetForm = () => {
    setFormName('')
    setFormShortName('')
    setFormRegion('')
    setFormTier(1)
    setIsAdding(false)
    setEditingId(null)
  }

  const handleAdd = async () => {
    if (!formName.trim()) return

    try {
      await api.post('/pro/monitoring/leagues', {
        name: formName.trim(),
        shortName: formShortName.trim() || null,
        region: formRegion || null,
        tier: formTier,
      })
      resetForm()
      fetchLeagues()
      onLeaguesChange?.()
    } catch (error) {
      logError('Failed to create league', error)
    }
  }

  const handleUpdate = async (id: number) => {
    if (!formName.trim()) return

    try {
      await api.patch(`/pro/monitoring/leagues/${id}`, {
        name: formName.trim(),
        shortName: formShortName.trim() || null,
        region: formRegion || null,
        tier: formTier,
      })
      resetForm()
      fetchLeagues()
      onLeaguesChange?.()
    } catch (error) {
      logError('Failed to update league', error)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this league? Tournaments will be unassigned.')) return

    try {
      await api.delete(`/pro/monitoring/leagues/${id}`)
      fetchLeagues()
      onLeaguesChange?.()
    } catch (error) {
      logError('Failed to delete league', error)
    }
  }

  const startEdit = (league: League) => {
    setEditingId(league.id)
    setFormName(league.name)
    setFormShortName(league.shortName || '')
    setFormRegion(league.region || '')
    setFormTier(league.tier || 1)
    setIsAdding(false)
  }

  const startAdd = () => {
    resetForm()
    setIsAdding(true)
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
      <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="text-sm font-medium text-(--text-primary)">Leagues</h3>
        {!isAdding && !editingId && (
          <button
            onClick={startAdd}
            className="px-2 py-1 text-xs font-medium rounded bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)]"
          >
            + Add
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {(isAdding || editingId !== null) && (
        <div className="py-2 px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              type="text"
              placeholder="League Name *"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs text-(--text-primary) placeholder:text-(--text-muted)"
            />
            <input
              type="text"
              placeholder="Short (LEC)"
              value={formShortName}
              onChange={(e) => setFormShortName(e.target.value)}
              className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs text-(--text-primary) placeholder:text-(--text-muted)"
            />
            <select
              value={formRegion}
              onChange={(e) => setFormRegion(e.target.value)}
              className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
            >
              <option value="">Region</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={formTier}
              onChange={(e) => setFormTier(Number(e.target.value))}
              className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
            >
              <option value={1}>T1 Major</option>
              <option value={2}>T2 Regional</option>
              <option value={3}>T3 Minor</option>
            </select>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => (editingId ? handleUpdate(editingId) : handleAdd())}
              disabled={!formName.trim()}
              className="px-2 py-1 text-xs font-medium rounded bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {editingId ? 'Update' : 'Add'}
            </button>
            <button
              onClick={resetForm}
              className="px-2 py-1 text-xs rounded bg-[var(--bg-card)] text-(--text-secondary) hover:bg-[var(--bg-hover)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* League List */}
      <div className="divide-y divide-[var(--border)]">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="py-2 px-3">
              <Skeleton className="h-4 w-48" />
            </div>
          ))
        ) : leagues.length === 0 ? (
          <div className="py-6 text-center text-(--text-muted) text-sm">
            No leagues yet. Add your first league above.
          </div>
        ) : (
          leagues.map((league) => (
            <div
              key={league.id}
              className="py-2 px-3 flex items-center justify-between hover:bg-[var(--bg-hover)]"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-(--text-primary)">{league.name}</span>
                {league.shortName && (
                  <span className="text-xs px-1 py-0.5 rounded bg-[var(--bg-secondary)] text-(--text-muted)">
                    {league.shortName}
                  </span>
                )}
                {league.tier && (
                  <span className="text-xs px-1 py-0.5 rounded bg-[var(--bg-secondary)] text-(--text-muted)">
                    T{league.tier}
                  </span>
                )}
                {league.region && (
                  <span className="text-xs text-(--text-muted)">{league.region}</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => startEdit(league)}
                  className="px-1.5 py-0.5 text-xs rounded bg-[var(--bg-secondary)] text-(--text-secondary) hover:bg-[var(--bg-hover)]"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(league.id)}
                  className="px-1.5 py-0.5 text-xs rounded bg-[var(--bg-secondary)] text-[var(--negative)] hover:bg-[var(--bg-hover)]"
                >
                  Del
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
