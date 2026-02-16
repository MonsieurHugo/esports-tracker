'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminApi } from '../useAdminApi'
import type { AdminTeamFull, AdminOrganization } from '@/lib/types'
import { ApiError } from '@/lib/api'

interface LeagueOption {
  leagueId: number
  name: string
  shortName: string
}

interface Props {
  password: string
}

export default function TeamsTab({ password }: Props) {
  const api = useAdminApi(password)
  const [teams, setTeams] = useState<AdminTeamFull[]>([])
  const [orgs, setOrgs] = useState<AdminOrganization[]>([])
  const [leagues, setLeagues] = useState<LeagueOption[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState<AdminTeamFull | null>(null)
  const [form, setForm] = useState({
    currentName: '', shortName: '', slug: '', orgId: '', region: '', league: '', isActive: true,
  })
  const [saving, setSaving] = useState(false)

  // Fetch reference data on mount
  useEffect(() => {
    api.get<{ data: AdminOrganization[] }>('/organizations').then(r => setOrgs(r.data)).catch(() => {})
    api.get<{ data: LeagueOption[] }>('/leagues').then(r => setLeagues(r.data)).catch(() => {})
  }, [api])

  const fetchTeams = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: AdminTeamFull[] }>('/teams', {
        params: search ? { search } : undefined,
      })
      setTeams(res.data)
    } catch {
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [api, search])

  useEffect(() => {
    const timer = setTimeout(fetchTeams, 300)
    return () => clearTimeout(timer)
  }, [fetchTeams])

  const openAdd = () => {
    setEditingTeam(null)
    setForm({ currentName: '', shortName: '', slug: '', orgId: '', region: '', league: '', isActive: true })
    setShowModal(true)
  }

  const openEdit = (team: AdminTeamFull) => {
    setEditingTeam(team)
    setForm({
      currentName: team.currentName,
      shortName: team.shortName,
      slug: team.slug,
      orgId: team.orgId ? String(team.orgId) : '',
      region: team.region || '',
      league: team.league || '',
      isActive: team.isActive,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.currentName.trim() || !form.shortName.trim()) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        currentName: form.currentName.trim(),
        shortName: form.shortName.trim(),
        region: form.region.trim() || null,
        league: form.league.trim() || null,
        orgId: form.orgId ? Number(form.orgId) : null,
      }
      if (form.slug.trim()) payload.slug = form.slug.trim()

      if (editingTeam) {
        payload.isActive = form.isActive
        await api.patch(`/teams/${editingTeam.teamId}`, payload)
      } else {
        await api.post('/teams', payload)
      }
      setShowModal(false)
      fetchTeams()
    } catch {
      alert('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (team: AdminTeamFull) => {
    if (!confirm(`Supprimer l'equipe "${team.currentName}" ?`)) return
    try {
      await api.del(`/teams/${team.teamId}`)
      fetchTeams()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { error?: string } | undefined
        alert(body?.error || 'Cette equipe a des contrats actifs')
      } else {
        alert('Erreur lors de la suppression')
      }
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="flex-1 max-w-xs px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
        >
          + Ajouter
        </button>
      </div>

      {error && <p className="text-sm text-[var(--negative)] mb-4">{error}</p>}

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Nom</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Abreviation</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Organisation</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Region</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Ligue</th>
              <th className="text-center px-4 py-3 text-[var(--text-muted)] font-medium">Actif</th>
              <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">Chargement...</td></tr>
            ) : teams.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">Aucune equipe</td></tr>
            ) : (
              teams.map((team) => (
                <tr key={team.teamId} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{team.currentName}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{team.shortName}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{team.orgName || '-'}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{team.region || '-'}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{team.league || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${team.isActive ? 'bg-[var(--positive)]' : 'bg-[var(--negative)]'}`} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(team)} className="text-[var(--text-muted)] hover:text-[var(--accent)] text-xs mr-3">Modifier</button>
                    <button onClick={() => handleDelete(team)} className="text-[var(--text-muted)] hover:text-[var(--negative)] text-xs">Supprimer</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-md mx-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {editingTeam ? 'Modifier equipe' : 'Nouvelle equipe'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Nom *</label>
                <input value={form.currentName} onChange={(e) => setForm(f => ({ ...f, currentName: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" autoFocus />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Abreviation *</label>
                <input value={form.shortName} onChange={(e) => setForm(f => ({ ...f, shortName: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Organisation</label>
                <select value={form.orgId} onChange={(e) => setForm(f => ({ ...f, orgId: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]">
                  <option value="">Aucune</option>
                  {orgs.map(o => <option key={o.orgId} value={o.orgId}>{o.currentName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Region</label>
                <input value={form.region} onChange={(e) => setForm(f => ({ ...f, region: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Ligue</label>
                <select value={form.league} onChange={(e) => setForm(f => ({ ...f, league: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]">
                  <option value="">Aucune</option>
                  {leagues.map(l => <option key={l.leagueId} value={l.shortName}>{l.name} ({l.shortName})</option>)}
                </select>
              </div>
              {editingTeam && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isActive" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="rounded" />
                  <label htmlFor="isActive" className="text-sm text-[var(--text-secondary)]">Equipe active</label>
                </div>
              )}
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Slug (auto-genere si vide)</label>
                <input value={form.slug} onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.currentName.trim() || !form.shortName.trim()}
                className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                {saving ? 'Sauvegarde...' : editingTeam ? 'Modifier' : 'Creer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
