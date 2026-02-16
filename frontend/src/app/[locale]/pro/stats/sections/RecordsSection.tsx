'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import TeamLogo from '@/components/ui/TeamLogo'
import type { ProRecords, ProPlayerRecord, ProTeamRecord, ProBoRecord, ProStreakRecord, ProTournamentKillsRecord } from '@/lib/types'
import { getChampionName, getChampionIconUrl } from '@/lib/champions'
import { getRoleImagePath, getRankTextClass } from '@/lib/utils'
import type { ProStatsFilters } from '../hooks/useProStatsFilters'

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function isRecent(dateStr: string | null | undefined, days = 7): boolean {
  if (!dateStr) return false
  const diff = Date.now() - new Date(dateStr).getTime()
  return diff >= 0 && diff <= days * 86_400_000
}

function NewBadge() {
  return (
    <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-[var(--lol)]/15 text-[var(--lol)] leading-none">
      new
    </span>
  )
}

function RankCell({ rank }: { rank: number }) {
  return (
    <span className={`font-mono font-bold text-[11px] w-6 text-center ${getRankTextClass(rank)}`}>
      {rank}
    </span>
  )
}

function PlayerTable({ title, records, formatValue }: {
  title: string
  records: ProPlayerRecord[]
  formatValue: (r: ProPlayerRecord) => string
}) {
  const { isOpen, toggle } = useTableCollapse(title)
  if (records.length === 0) return null
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableHeader title={title} isOpen={isOpen} onToggle={toggle} />
      {isOpen && (
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
                  <th className="py-2 px-2 w-8"></th>
                  <th className="py-2 w-8"></th>
                  <th className="py-2 hidden sm:table-cell w-7"></th>
                  <th className="py-2 hidden sm:table-cell">Champ</th>
                  <th className="py-2">Joueur</th>
                  <th className="py-2 text-right pr-3">Valeur</th>
                  <th className="py-2 hidden md:table-cell w-8 text-center">vs</th>
                  <th className="py-2 hidden lg:table-cell">Tournoi</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const recent = isRecent(r.gameDate)
                  return (
                  <tr
                    key={i}
                    className={`border-b border-[var(--border)]/30 transition-colors hover:bg-[var(--bg-hover)] ${
                      i === 0 ? 'bg-[var(--accent)]/5' : recent ? 'bg-[var(--lol)]/5' : ''
                    } ${recent ? 'border-l-2 border-l-[var(--lol)]' : ''}`}
                  >
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <RankCell rank={i + 1} />
                        {r.win != null && (
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${r.win ? 'bg-[var(--positive)]' : 'bg-[var(--negative)]'}`} />
                        )}
                        {recent && <NewBadge />}
                      </div>
                    </td>
                    <td className="py-2">
                      {r.teamName ? (
                        <TeamLogo slug={r.teamName.toLowerCase()} shortName={r.teamName} size={20} />
                      ) : <span className="text-(--text-muted)">—</span>}
                    </td>
                    <td className="py-2 hidden sm:table-cell">
                      {r.role ? (
                        <Image
                          src={getRoleImagePath(r.role)}
                          alt={r.role}
                          width={16}
                          height={16}
                          className="w-4 h-4 object-contain opacity-60"
                        />
                      ) : null}
                    </td>
                    <td className="py-2 hidden sm:table-cell">
                      {r.championId != null ? (
                        <Image
                          src={getChampionIconUrl(r.championId)}
                          alt={getChampionName(r.championId)}
                          width={22}
                          height={22}
                          className="w-[22px] h-[22px] rounded"
                          unoptimized
                        />
                      ) : <span className="text-(--text-muted)">—</span>}
                    </td>
                    <td className={`py-2 text-xs font-medium ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                      {r.playerName}
                    </td>
                    <td className={`py-2 text-right pr-3 font-mono font-bold text-xs ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                      {formatValue(r)}
                    </td>
                    <td className="py-2 hidden md:table-cell text-center">
                      {r.opponentName ? (
                        <TeamLogo slug={r.opponentName.toLowerCase()} shortName={r.opponentName} size={18} />
                      ) : <span className="text-(--text-muted)">—</span>}
                    </td>
                    <td className="py-2 hidden lg:table-cell text-(--text-muted) text-[11px] truncate max-w-[140px]">{r.tournamentName}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      )}
    </div>
  )
}

function TeamTable({ title, records }: {
  title: string
  records: ProTeamRecord[]
}) {
  const { isOpen, toggle } = useTableCollapse(title)
  if (records.length === 0) return null
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableHeader title={title} isOpen={isOpen} onToggle={toggle} />
      {isOpen && (
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
                  <th className="py-2 px-2 w-8"></th>
                  <th className="py-2">Duree</th>
                  <th className="py-2">Vainqueur</th>
                  <th className="py-2">Perdant</th>
                  <th className="py-2 hidden md:table-cell">Tournoi</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const recent = isRecent(r.gameDate)
                  return (
                  <tr
                    key={i}
                    className={`border-b border-[var(--border)]/30 transition-colors hover:bg-[var(--bg-hover)] ${
                      i === 0 ? 'bg-[var(--accent)]/5' : recent ? 'bg-[var(--lol)]/5' : ''
                    } ${recent ? 'border-l-2 border-l-[var(--lol)]' : ''}`}
                  >
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <RankCell rank={i + 1} />
                        {recent && <NewBadge />}
                      </div>
                    </td>
                    <td className={`py-2 font-mono font-bold text-xs ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                      {fmt(r.value)}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        {r.winnerName && <TeamLogo slug={r.winnerName.toLowerCase()} shortName={r.winnerName} size={20} />}
                        <span className="text-xs font-medium text-(--text-primary)">{r.winnerName || '—'}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        {r.loserName && <TeamLogo slug={r.loserName.toLowerCase()} shortName={r.loserName} size={20} />}
                        <span className="text-xs text-(--text-secondary)">{r.loserName || '—'}</span>
                      </div>
                    </td>
                    <td className="py-2 hidden md:table-cell text-(--text-muted) text-[11px] truncate max-w-[140px]">{r.tournamentName}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      )}
    </div>
  )
}

function BoTable({ title, records }: {
  title: string
  records: ProBoRecord[]
}) {
  const { isOpen, toggle } = useTableCollapse(title)
  if (records.length === 0) return null
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableHeader title={title} isOpen={isOpen} onToggle={toggle} />
      {isOpen && (
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
                  <th className="py-2 px-2 w-8"></th>
                  <th className="py-2">Duree</th>
                  <th className="py-2">Equipes</th>
                  <th className="py-2 hidden sm:table-cell">Games</th>
                  <th className="py-2 hidden md:table-cell">Tournoi</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const recent = isRecent(r.gameDate)
                  return (
                  <tr
                    key={i}
                    className={`border-b border-[var(--border)]/30 transition-colors hover:bg-[var(--bg-hover)] ${
                      i === 0 ? 'bg-[var(--accent)]/5' : recent ? 'bg-[var(--lol)]/5' : ''
                    } ${recent ? 'border-l-2 border-l-[var(--lol)]' : ''}`}
                  >
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <RankCell rank={i + 1} />
                        {recent && <NewBadge />}
                      </div>
                    </td>
                    <td className={`py-2 font-mono font-bold text-xs ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                      {fmt(r.value)}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {r.team1Name && <TeamLogo slug={r.team1Name.toLowerCase()} shortName={r.team1Name} size={20} />}
                          <span className="text-xs font-medium text-(--text-primary) hidden sm:inline">{r.team1Name}</span>
                        </div>
                        <span className="text-[10px] text-(--text-muted) font-medium">vs</span>
                        <div className="flex items-center gap-1">
                          {r.team2Name && <TeamLogo slug={r.team2Name.toLowerCase()} shortName={r.team2Name} size={20} />}
                          <span className="text-xs font-medium text-(--text-primary) hidden sm:inline">{r.team2Name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 hidden sm:table-cell text-(--text-secondary) text-xs font-mono">{r.gamesPlayed}</td>
                    <td className="py-2 hidden md:table-cell text-(--text-muted) text-[11px] truncate max-w-[140px]">{r.tournamentName}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      )}
    </div>
  )
}

function StreakTable({ title, records, unit }: {
  title: string
  records: ProStreakRecord[]
  unit: string
}) {
  const { isOpen, toggle } = useTableCollapse(title)
  if (records.length === 0) return null
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableHeader title={title} isOpen={isOpen} onToggle={toggle} />
      {isOpen && (
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
                  <th className="py-2 px-2 w-8"></th>
                  <th className="py-2">Serie</th>
                  <th className="py-2">Equipe</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const recent = isRecent(r.streakEnd)
                  return (
                  <tr
                    key={i}
                    className={`border-b border-[var(--border)]/30 transition-colors hover:bg-[var(--bg-hover)] ${
                      i === 0 ? 'bg-[var(--accent)]/5' : recent ? 'bg-[var(--lol)]/5' : ''
                    } ${recent ? 'border-l-2 border-l-[var(--lol)]' : ''}`}
                  >
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <RankCell rank={i + 1} />
                        {recent && <NewBadge />}
                      </div>
                    </td>
                    <td className={`py-2 font-mono font-bold text-xs ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                      {r.value} <span className="text-(--text-muted) font-normal">{unit}</span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        {r.teamName && <TeamLogo slug={r.teamName.toLowerCase()} shortName={r.teamName} size={20} />}
                        <span className="text-xs font-medium text-(--text-primary)">{r.teamName}</span>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      )}
    </div>
  )
}

function TournamentKillsTable({ title, records }: {
  title: string
  records: ProTournamentKillsRecord[]
}) {
  const { isOpen, toggle } = useTableCollapse(title)
  if (records.length === 0) return null
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableHeader title={title} isOpen={isOpen} onToggle={toggle} />
      {isOpen && (
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
                  <th className="py-2 px-2 w-8"></th>
                  <th className="py-2">Tournoi</th>
                  <th className="py-2 text-right pr-3">Avg Kills/Game</th>
                  <th className="py-2 text-right pr-3 hidden sm:table-cell">Games</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[var(--border)]/30 transition-colors hover:bg-[var(--bg-hover)] ${
                      i === 0 ? 'bg-[var(--accent)]/5' : ''
                    }`}
                  >
                    <td className="py-2 px-2">
                      <RankCell rank={i + 1} />
                    </td>
                    <td className={`py-2 text-xs font-medium ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                      {r.tournamentName}
                    </td>
                    <td className={`py-2 text-right pr-3 font-mono font-bold text-xs ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                      {r.avgKillsPerGame.toFixed(1)}
                    </td>
                    <td className="py-2 text-right pr-3 hidden sm:table-cell text-(--text-muted) font-mono text-xs">
                      {r.totalGames}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      )}
    </div>
  )
}

const TABLES_STORAGE_KEY = 'records-tables-state'

function useTableCollapse(title: string) {
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TABLES_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed[title] === false) setIsOpen(false)
      }
    } catch { /* ignore */ }
  }, [title])

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev
      try {
        const raw = localStorage.getItem(TABLES_STORAGE_KEY)
        const state = raw ? JSON.parse(raw) : {}
        state[title] = next
        localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(state))
      } catch { /* ignore */ }
      return next
    })
  }, [title])

  return { isOpen, toggle }
}

function TableHeader({ title, isOpen, onToggle }: {
  title: string
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center justify-between w-full px-4 py-2.5 bg-[var(--bg-card)] cursor-pointer group ${isOpen ? 'border-b border-[var(--border)]' : ''}`}
    >
      <h3 className="text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">{title}</h3>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        className={`text-(--text-muted) group-hover:text-(--text-secondary) transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
      >
        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

const STORAGE_KEY = 'records-sections-state'
const DEFAULT_SECTIONS: Record<string, boolean> = {
  players: true,
  teams: true,
  streaks: true,
  tournaments: true,
}

function loadSections(): Record<string, boolean> {
  if (typeof window === 'undefined') return DEFAULT_SECTIONS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_SECTIONS, ...parsed }
    }
  } catch { /* ignore */ }
  return DEFAULT_SECTIONS
}

function SectionHeader({ id, label, count, isOpen, onToggle }: {
  id: string
  label: string
  count: number
  isOpen: boolean
  onToggle: (id: string) => void
}) {
  return (
    <button
      onClick={() => onToggle(id)}
      className="flex items-center gap-3 w-full cursor-pointer mb-5 group"
    >
      <div className="w-1 h-6 rounded-full bg-[var(--accent)]" />
      <h2 className="text-base font-bold text-(--text-primary)">{label}</h2>
      <span className="text-(--text-muted) text-xs">({count})</span>
      <div className="flex-1 h-px bg-[var(--border)]" />
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className={`text-(--text-muted) group-hover:text-(--text-secondary) transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
      >
        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export default function RecordsSection({ filters }: { filters: ProStatsFilters }) {
  const [records, setRecords] = useState<ProRecords | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(DEFAULT_SECTIONS)

  useEffect(() => {
    setOpenSections(loadSections())
  }, [])

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  // Stable refs for debounced fetch
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const buildParams = filters.buildParams

  useEffect(() => {
    let controller: AbortController | undefined

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const ctrl = new AbortController()
      controller = ctrl

      const run = async () => {
        try {
          setIsLoading(true)
          const params = buildParams()
          const data = await api.get<ProRecords>('/pro/stats/records', {
            params,
            signal: ctrl.signal,
          })
          if (!ctrl.signal.aborted) setRecords(data)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return
          logError('Failed to fetch records', error)
        } finally {
          if (!ctrl?.signal.aborted) setIsLoading(false)
        }
      }
      run()
    }, 300)

    return () => {
      clearTimeout(debounceRef.current)
      controller?.abort()
    }
  }, [buildParams])

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    )
  }

  if (!records) {
    return (
      <div className="text-center py-12 text-(--text-muted)">
        Impossible de charger les records
      </div>
    )
  }

  const { playerRecords, teamRecords, streakRecords, tournamentRecords } = records

  return (
    <div className="space-y-10">

      {/* Player Records */}
      <section>
        <SectionHeader id="players" label="Records Joueurs" count={9} isOpen={openSections.players} onToggle={toggleSection} />
        {openSections.players && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <PlayerTable title="Most Kills" records={playerRecords.mostKills} formatValue={(r) => String(r.value)} />
            <PlayerTable title="Most Assists" records={playerRecords.mostAssists} formatValue={(r) => String(r.value)} />
            <PlayerTable title="Best KDA" records={playerRecords.bestKda} formatValue={(r) => `${r.value} (${r.kills}/${r.deaths}/${r.assists})`} />
            <PlayerTable title="Highest CS/min" records={playerRecords.highestCsPerMin} formatValue={(r) => `${r.value}/min`} />
            <PlayerTable title="Highest DPM" records={playerRecords.highestDpm} formatValue={(r) => r.value.toLocaleString()} />
            <PlayerTable title="Most Damage" records={playerRecords.mostDamage} formatValue={(r) => r.value.toLocaleString()} />
            <PlayerTable title="Penta Kills" records={playerRecords.mostPentaKills} formatValue={(r) => String(r.value)} />
            <PlayerTable title="Fastest Quest" records={playerRecords.fastestQuest} formatValue={(r) => fmt(r.value)} />
            <PlayerTable title="Slowest Quest" records={playerRecords.slowestQuest} formatValue={(r) => fmt(r.value)} />
          </div>
        )}
      </section>

      {/* Team Records */}
      <section>
        <SectionHeader id="teams" label="Records Equipes" count={6} isOpen={openSections.teams} onToggle={toggleSection} />
        {openSections.teams && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <TeamTable title="Victoire la plus rapide" records={teamRecords.fastestWin} />
            <TeamTable title="Game la plus longue" records={teamRecords.longestGame} />
            <BoTable title="BO3 le plus rapide" records={teamRecords.fastestBo3} />
            <BoTable title="BO3 le plus long" records={teamRecords.slowestBo3} />
            <BoTable title="BO5 le plus rapide" records={teamRecords.fastestBo5} />
            <BoTable title="BO5 le plus long" records={teamRecords.slowestBo5} />
          </div>
        )}
      </section>

      {/* Streak Records */}
      <section>
        <SectionHeader id="streaks" label="Records Series" count={4} isOpen={openSections.streaks} onToggle={toggleSection} />
        {openSections.streaks && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <StreakTable title="Plus longue serie de victoires (games)" records={streakRecords.longestGameWinStreak} unit="games" />
            <StreakTable title="Plus longue serie de defaites (games)" records={streakRecords.longestGameLossStreak} unit="games" />
            <StreakTable title="Plus longue serie de victoires (matchs)" records={streakRecords.longestMatchWinStreak} unit="matchs" />
            <StreakTable title="Plus longue serie de defaites (matchs)" records={streakRecords.longestMatchLossStreak} unit="matchs" />
          </div>
        )}
      </section>

      {/* Tournament Records */}
      <section>
        <SectionHeader id="tournaments" label="Stats par Tournoi" count={1} isOpen={openSections.tournaments} onToggle={toggleSection} />
        {openSections.tournaments && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <TournamentKillsTable title="Moyenne de kills par game" records={tournamentRecords.avgKillsPerGame} />
          </div>
        )}
      </section>
    </div>
  )
}
