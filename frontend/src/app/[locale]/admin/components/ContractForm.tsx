'use client'

import { PLAYER_ROLES } from '@/lib/types'
import type { AdminTeam } from '@/lib/types'

interface ContractFormData {
  teamId: string
  role: string
  isStarter: boolean
}

interface ContractFormProps {
  value: ContractFormData
  onChange: (value: ContractFormData) => void
  teams: AdminTeam[]
  disabled?: boolean
}

export default function ContractForm({ value, onChange, teams, disabled }: ContractFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">Equipe</label>
        <select
          value={value.teamId}
          onChange={(e) => onChange({ ...value, teamId: e.target.value })}
          disabled={disabled}
          className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
        >
          <option value="">Selectionnez une equipe</option>
          {teams.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.currentName} ({t.shortName})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">Role</label>
        <select
          value={value.role}
          onChange={(e) => onChange({ ...value, role: e.target.value })}
          disabled={disabled}
          className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
        >
          <option value="">Aucun</option>
          {PLAYER_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isStarter"
          checked={value.isStarter}
          onChange={(e) => onChange({ ...value, isStarter: e.target.checked })}
          disabled={disabled}
          className="rounded"
        />
        <label htmlFor="isStarter" className="text-sm text-[var(--text-secondary)]">Titulaire</label>
      </div>
    </div>
  )
}
