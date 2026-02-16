'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminApi } from '../useAdminApi'
import type { AdminOrganization } from '@/lib/types'

interface Props {
  password: string
}

export default function OrganizationsTab({ password }: Props) {
  const api = useAdminApi(password)
  const [orgs, setOrgs] = useState<AdminOrganization[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingOrg, setEditingOrg] = useState<AdminOrganization | null>(null)
  const [form, setForm] = useState({ currentName: '', currentShortName: '', slug: '', country: '', logoUrl: '' })
  const [saving, setSaving] = useState(false)

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: AdminOrganization[] }>('/organizations', {
        params: search ? { search } : undefined,
      })
      setOrgs(res.data)
    } catch {
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [api, search])

  useEffect(() => {
    const timer = setTimeout(fetchOrgs, 300)
    return () => clearTimeout(timer)
  }, [fetchOrgs])

  const openAdd = () => {
    setEditingOrg(null)
    setForm({ currentName: '', currentShortName: '', slug: '', country: '', logoUrl: '' })
    setShowModal(true)
  }

  const openEdit = (org: AdminOrganization) => {
    setEditingOrg(org)
    setForm({
      currentName: org.currentName,
      currentShortName: org.currentShortName || '',
      slug: org.slug,
      country: org.country || '',
      logoUrl: org.logoUrl || '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.currentName.trim()) return
    setSaving(true)
    try {
      const payload: Record<string, string | null> = {
        currentName: form.currentName.trim(),
        currentShortName: form.currentShortName.trim() || null,
        country: form.country.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
      }
      if (form.slug.trim()) payload.slug = form.slug.trim()

      if (editingOrg) {
        await api.patch(`/organizations/${editingOrg.orgId}`, payload)
      } else {
        await api.post('/organizations', payload)
      }
      setShowModal(false)
      fetchOrgs()
    } catch {
      alert('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (org: AdminOrganization) => {
    if (!confirm(`Supprimer l'organisation "${org.currentName}" ?`)) return
    try {
      await api.del(`/organizations/${org.orgId}`)
      fetchOrgs()
    } catch {
      alert('Erreur lors de la suppression')
    }
  }

  return (
    <div>
      {/* Header with search + add button */}
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

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Nom</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Abreviation</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Pays</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Slug</th>
              <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">Chargement...</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">Aucune organisation</td></tr>
            ) : (
              orgs.map((org) => (
                <tr key={org.orgId} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{org.currentName}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{org.currentShortName || '-'}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{org.country || '-'}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">{org.slug}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(org)} className="text-[var(--text-muted)] hover:text-[var(--accent)] text-xs mr-3">Modifier</button>
                    <button onClick={() => handleDelete(org)} className="text-[var(--text-muted)] hover:text-[var(--negative)] text-xs">Supprimer</button>
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
                {editingOrg ? 'Modifier organisation' : 'Nouvelle organisation'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Nom *</label>
                <input
                  value={form.currentName}
                  onChange={(e) => setForm(f => ({ ...f, currentName: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Abreviation</label>
                <input
                  value={form.currentShortName}
                  onChange={(e) => setForm(f => ({ ...f, currentShortName: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Pays</label>
                <input
                  value={form.country}
                  onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">URL Logo</label>
                <input
                  value={form.logoUrl}
                  onChange={(e) => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Slug (auto-genere si vide)</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.currentName.trim()}
                className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                {saving ? 'Sauvegarde...' : editingOrg ? 'Modifier' : 'Creer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
