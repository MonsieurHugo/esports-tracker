'use client'

import { useState } from 'react'

interface Props {
  playerId: number
  playerName: string
  onSave: (data: { gameName: string; tagLine: string; region: string; isPrimary: boolean }) => Promise<void>
  onClose: () => void
}

export default function AddAccountModal({ playerId, playerName, onSave, onClose }: Props) {
  const [gameName, setGameName] = useState('')
  const [tagLine, setTagLine] = useState('')
  const [region, setRegion] = useState('EUW')
  const [isPrimary, setIsPrimary] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!gameName.trim() || !tagLine.trim()) return
    setSaving(true)
    try {
      await onSave({ gameName: gameName.trim(), tagLine: tagLine.trim(), region, isPrimary })
      onClose()
    } catch {
      alert('Erreur lors de l\'ajout du compte')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Ajouter un compte</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Joueur : <span className="font-medium text-[var(--text-primary)]">{playerName}</span>
          </p>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Game Name *</label>
            <input
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="ex: Faker"
              className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Tag Line *</label>
            <input
              value={tagLine}
              onChange={(e) => setTagLine(e.target.value)}
              placeholder="ex: EUW"
              className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Region</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="EUW">EUW</option>
              <option value="EUNE">EUNE</option>
              <option value="NA">NA</option>
              <option value="KR">KR</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPrimary"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="isPrimary" className="text-sm text-[var(--text-secondary)]">Compte principal</label>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !gameName.trim() || !tagLine.trim()}
            className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {saving ? 'Ajout...' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}
