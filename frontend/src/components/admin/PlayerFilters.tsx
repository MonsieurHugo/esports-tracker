'use client'

import type { AdminTeam } from '@/lib/types'

interface PlayerFiltersProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  selectedTeamId: number | null
  onTeamChange: (teamId: number | null) => void
  teams: AdminTeam[]
}

export function PlayerFilters({
  searchQuery,
  onSearchChange,
  selectedTeamId,
  onTeamChange,
  teams,
}: PlayerFiltersProps) {
  return (
    <div className="flex gap-3 mb-5">
      <input
        type="text"
        placeholder="Rechercher par pseudo, nom..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="flex-1 bg-(--bg-card) border border-(--border) rounded-md px-3 py-2 text-sm focus:outline-none focus:border-(--accent)"
      />

      <select
        value={selectedTeamId ?? ''}
        onChange={(e) => onTeamChange(e.target.value ? Number(e.target.value) : null)}
        className="bg-(--bg-card) border border-(--border) rounded-md px-3 py-2 text-sm min-w-[200px]"
      >
        <option value="">Toutes les équipes</option>
        {teams.map((team) => (
          <option key={team.teamId} value={team.teamId}>
            {team.currentName} {team.region && `(${team.region})`}
          </option>
        ))}
      </select>
    </div>
  )
}
