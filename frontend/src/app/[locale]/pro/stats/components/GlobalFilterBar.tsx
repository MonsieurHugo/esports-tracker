'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import MultiSelectDropdown from './MultiSelectDropdown'
import type { ProStatsFilters } from '../hooks/useProStatsFilters'
import { TIER_LABELS } from '../hooks/useProStatsFilters'

const ROLE_DISPLAY: { apiRole: string; icon: string; label: string }[] = [
  { apiRole: 'Top', icon: 'TOP', label: 'TOP' },
  { apiRole: 'Jungle', icon: 'JGL', label: 'JGL' },
  { apiRole: 'Mid', icon: 'MID', label: 'MID' },
  { apiRole: 'ADC', icon: 'ADC', label: 'ADC' },
  { apiRole: 'Support', icon: 'SUP', label: 'SUP' },
]

export default function GlobalFilterBar({ filters }: { filters: ProStatsFilters }) {
  const {
    selectedYears,
    selectedLeagueIds,
    selectedTournamentIds,
    selectedTeamIds,
    selectedPlayerIds,
    role,
    selectedTier,
    selectedPhases,
    setSelectedYears,
    setSelectedLeagueIds,
    setSelectedTournamentIds,
    setSelectedTeamIds,
    setSelectedPlayerIds,
    setRole,
    setSelectedTier,
    setSelectedPhases,
    availableOptions,
    filterMapLoading,
    resetFilters,
  } = filters

  const yearItems = useMemo(
    () => availableOptions.years.map((y) => ({ id: y, label: String(y) })),
    [availableOptions.years]
  )

  const phaseItems = useMemo(
    () => availableOptions.phases.map((p) => ({ id: p, label: p })),
    [availableOptions.phases]
  )

  return (
    <div className="flex gap-2 flex-wrap items-center mb-6">
      <MultiSelectDropdown
        label="Annees"
        items={yearItems}
        selected={selectedYears}
        onChange={setSelectedYears}
        getId={(i) => i.id}
        getLabel={(i) => i.label}
        isLoading={filterMapLoading}
      />
      <MultiSelectDropdown
        label="Ligues"
        items={availableOptions.leagues}
        selected={selectedLeagueIds}
        onChange={setSelectedLeagueIds}
        getId={(i) => i.leagueId}
        getLabel={(i) => i.shortName || i.name}
        isLoading={filterMapLoading}
      />
      <MultiSelectDropdown
        label="Tournois"
        items={availableOptions.tournaments}
        selected={selectedTournamentIds}
        onChange={setSelectedTournamentIds}
        getId={(i) => i.tournamentId}
        getLabel={(i) => i.name}
        searchable
        isLoading={filterMapLoading}
      />
      <MultiSelectDropdown
        label="Equipes"
        items={availableOptions.teams}
        selected={selectedTeamIds}
        onChange={setSelectedTeamIds}
        getId={(i) => i.teamId}
        getLabel={(i) => i.shortName}
        searchable
        isLoading={filterMapLoading}
      />
      <MultiSelectDropdown
        label="Joueurs"
        items={availableOptions.players}
        selected={selectedPlayerIds}
        onChange={setSelectedPlayerIds}
        getId={(i) => i.playerId}
        getLabel={(i) => i.name}
        searchable
        isLoading={filterMapLoading}
      />
      <MultiSelectDropdown
        label="Phase"
        items={phaseItems}
        selected={selectedPhases}
        onChange={setSelectedPhases}
        getId={(i) => i.id}
        getLabel={(i) => i.label}
        isLoading={filterMapLoading}
      />

      {/* Compact role icon filter */}
      <div className="flex items-center gap-1.5 px-2 py-[6px] bg-(--bg-card) border border-(--border) rounded-md">
        <button
          onClick={() => setRole(null)}
          className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
            role === null
              ? 'bg-(--accent) text-white'
              : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--bg-hover)'
          }`}
        >
          ALL
        </button>
        <div className="w-px h-5 bg-(--border)" />
        {ROLE_DISPLAY.map((r) => {
          const isActive = role === r.apiRole
          return (
            <button
              key={r.apiRole}
              onClick={() => setRole(r.apiRole)}
              className={`w-6 h-6 p-0.5 rounded transition-all ${
                isActive
                  ? 'bg-(--accent)/20 ring-1 ring-(--accent)'
                  : 'opacity-40 hover:opacity-70 hover:bg-(--bg-hover)'
              }`}
              title={r.label}
              style={{ filter: isActive ? 'none' : 'grayscale(100%)' }}
            >
              <Image
                src={`/images/roles/${r.icon}.png`}
                alt={r.label}
                width={20}
                height={20}
                className="w-full h-full object-contain"
              />
            </button>
          )
        })}
      </div>

      {/* Tier filter */}
      <div className="flex items-center gap-1.5 px-2 py-[6px] bg-(--bg-card) border border-(--border) rounded-md">
        <button
          onClick={() => setSelectedTier(null)}
          className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
            selectedTier === null
              ? 'bg-(--accent) text-white'
              : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--bg-hover)'
          }`}
        >
          ALL
        </button>
        <div className="w-px h-5 bg-(--border)" />
        {availableOptions.tiers.map((t) => (
          <button
            key={t}
            onClick={() => setSelectedTier(t)}
            className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
              selectedTier === t
                ? 'bg-(--accent) text-white'
                : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--bg-hover)'
            }`}
          >
            {TIER_LABELS[t] ?? `T${t}`}
          </button>
        ))}
      </div>

      {/* Reset all filters */}
      <button
        onClick={resetFilters}
        className="px-3 py-2 rounded-lg text-xs font-medium text-(--text-muted) hover:text-(--negative) bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--negative)]/40 transition-colors"
      >
        Reinitialiser
      </button>
    </div>
  )
}
