'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
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

function RankCell({ rank }: { rank: number }) {
  return (
    <span className={`font-mono font-bold text-[11px] w-6 text-center ${getRankTextClass(rank)}`}>
      {rank}
    </span>
  )
}

function shortenTournamentName(name: string): string {
  const splits: Record<string, string> = {
    spring: 'Spr',
    summer: 'Sum',
    winter: 'Win',
    fall: 'Fall',
    playoffs: 'PO',
  }
  let s = name.replace(/\bseason\b/gi, '').replace(/\s{2,}/g, ' ').trim()
  s = s.replace(/\b(20\d{2})\b/, (_, y) => `'${y.slice(2)}`)
  for (const [full, short] of Object.entries(splits)) {
    s = s.replace(new RegExp(`\\b${full}\\b`, 'i'), short)
  }
  return s.trim()
}

function TournamentCell({ name, className }: { name: string; className?: string }) {
  const short = shortenTournamentName(name)
  return (
    <td className={className} title={name}>
      {short}
    </td>
  )
}

function DetailRow({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <tr className="bg-[var(--bg-card)]">
      <td colSpan={colSpan} className="py-1.5 px-4 pl-10">
        <div className="flex items-center gap-3 text-[11px] text-(--text-muted)">
          {children}
        </div>
      </td>
    </tr>
  )
}

function PlayerTable({ title, records, formatValue }: {
  title: string
  records: ProPlayerRecord[]
  formatValue: (r: ProPlayerRecord) => string
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  if (!records || records.length === 0) return null
  const colCount = 5
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} />
      <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
              <th className="py-1.5 px-2 w-6"></th>
              <th className="py-1.5" colSpan={2}>Joueur</th>
              <th className="py-1.5 text-right">Val.</th>
              <th className="py-1.5 text-right pr-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => {
              const recent = isRecent(r.gameDate)
              const isExpanded = expandedIndex === i
              return (
              <React.Fragment key={i}>
              <tr
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className={`border-b border-[var(--border)]/30 transition-colors hover:bg-[var(--bg-hover)] cursor-pointer ${
                  i === 0 ? 'bg-[var(--accent)]/5' : recent ? 'bg-[var(--lol)]/5' : ''
                } ${r.win != null ? `border-l-2 ${r.win ? 'border-l-[var(--positive)]/50' : 'border-l-[var(--negative)]/50'}` : ''}`}
              >
                <td className="py-1.5 px-2">
                  <RankCell rank={i + 1} />
                </td>
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    {r.teamName && <TeamLogo slug={r.teamName.toLowerCase()} shortName={r.teamName} size={16} />}
                    {r.role && (
                      <Image
                        src={getRoleImagePath(r.role)}
                        alt={r.role}
                        width={14}
                        height={14}
                        className="w-3.5 h-3.5 object-contain opacity-50"
                      />
                    )}
                    {r.championId != null ? (
                      <Image
                        src={getChampionIconUrl(r.championId)}
                        alt={getChampionName(r.championId)}
                        width={20}
                        height={20}
                        className="w-5 h-5 rounded"
                        unoptimized
                      />
                    ) : null}
                  </div>
                </td>
                <td className={`py-1.5 text-xs font-medium ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                  {r.playerName}
                </td>
                <td className={`py-1.5 text-right font-mono font-bold text-xs ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                  {formatValue(r)}
                </td>
                <td className="py-1.5 text-right pr-3 text-[10px] text-(--text-muted)">
                  {r.gameDate ? new Date(r.gameDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''}
                </td>
              </tr>
              {isExpanded && (
                <DetailRow colSpan={colCount}>
                  {r.opponentName && (
                    <span className="flex items-center gap-1">
                      vs <TeamLogo slug={r.opponentName.toLowerCase()} shortName={r.opponentName} size={16} />
                      <span>{r.opponentName}</span>
                    </span>
                  )}
                  {r.duration != null && (
                    <>
                      <span className="text-(--text-muted)/50">·</span>
                      <span className="font-mono">{fmt(r.duration)}</span>
                    </>
                  )}
                  <span className="text-(--text-muted)/50">·</span>
                  <span>{r.tournamentName}</span>
                </DetailRow>
              )}
              </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeamTable({ title, records, formatValue, valueLabel }: {
  title: string
  records: ProTeamRecord[]
  formatValue?: (r: ProTeamRecord) => string
  valueLabel?: string
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  if (!records || records.length === 0) return null
  const colCount = 4
  const renderValue = formatValue ?? ((r: ProTeamRecord) => fmt(r.value))
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} />
      <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
              <th className="py-2 px-2 w-8"></th>
              <th className="py-2">{valueLabel ?? 'Duree'}</th>
              <th className="py-2">Vainqueur</th>
              <th className="py-2">Perdant</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => {
              const recent = isRecent(r.gameDate)
              const isExpanded = expandedIndex === i
              return (
              <React.Fragment key={i}>
              <tr
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className={`border-b border-[var(--border)]/30 transition-colors hover:bg-[var(--bg-hover)] cursor-pointer ${
                  i === 0 ? 'bg-[var(--accent)]/5' : recent ? 'bg-[var(--lol)]/5' : ''
                } ${recent ? 'border-l-2 border-l-[var(--lol)]' : r.win != null ? `border-l-2 ${r.win ? 'border-l-[var(--positive)]/50' : 'border-l-[var(--negative)]/50'}` : ''}`}
              >
                <td className="py-2 px-2">
                  <RankCell rank={i + 1} />
                </td>
                <td className={`py-2 ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                  <span className="font-mono font-bold text-xs">{renderValue(r)}</span>
                  {r.gameDate && <span className="text-[10px] text-(--text-muted) ml-1">{new Date(r.gameDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>}
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
              </tr>
              {isExpanded && (
                <DetailRow colSpan={colCount}>
                  <span>{r.tournamentName}</span>
                </DetailRow>
              )}
              </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BoTable({ title, records }: {
  title: string
  records: ProBoRecord[]
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  if (!records || records.length === 0) return null
  const colCount = 4
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} />
      <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
              <th className="py-2 px-2 w-8"></th>
              <th className="py-2">Duree</th>
              <th className="py-2">Equipes</th>
              <th className="py-2 hidden sm:table-cell">Games</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => {
              const recent = isRecent(r.gameDate)
              const isExpanded = expandedIndex === i
              return (
              <React.Fragment key={i}>
              <tr
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className={`border-b border-[var(--border)]/30 transition-colors hover:bg-[var(--bg-hover)] cursor-pointer ${
                  i === 0 ? 'bg-[var(--accent)]/5' : recent ? 'bg-[var(--lol)]/5' : ''
                } ${recent ? 'border-l-2 border-l-[var(--lol)]' : ''}`}
              >
                <td className="py-2 px-2">
                  <RankCell rank={i + 1} />
                </td>
                <td className={`py-2 ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                  <span className="font-mono font-bold text-xs">{fmt(r.value)}</span>
                  {r.gameDate && <span className="text-[10px] text-(--text-muted) ml-1">{new Date(r.gameDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>}
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
              </tr>
              {isExpanded && (
                <DetailRow colSpan={colCount}>
                  <span>{r.tournamentName}</span>
                </DetailRow>
              )}
              </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StreakTable({ title, records, unit }: {
  title: string
  records: ProStreakRecord[]
  unit: string
}) {
  if (!records || records.length === 0) return null
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} />
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
                  <RankCell rank={i + 1} />
                </td>
                <td className={`py-2 ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                  <span className="font-mono font-bold text-xs">{r.value} <span className="text-(--text-muted) font-normal">{unit}</span></span>
                  {r.streakEnd && <span className="text-[10px] text-(--text-muted) ml-1">{new Date(r.streakEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>}
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
    </div>
  )
}

function TournamentKillsTable({ title, records }: {
  title: string
  records: ProTournamentKillsRecord[]
}) {
  if (!records || records.length === 0) return null
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} />
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
                <TournamentCell name={r.tournamentName} className={`py-2 text-xs font-medium ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`} />
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
    </div>
  )
}

function TableTitle({ title }: { title: string }) {
  return (
    <div className="px-4 py-2.5 bg-[var(--bg-card)] border-b border-[var(--border)]">
      <h3 className="text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">{title}</h3>
    </div>
  )
}

type RecordSubTab = 'players' | 'teams' | 'series'

const SUB_TABS: { key: RecordSubTab; label: string }[] = [
  { key: 'players', label: 'Joueurs' },
  { key: 'teams', label: 'Equipes' },
  { key: 'series', label: 'Series' },
]

const SUB_TAB_STORAGE_KEY = 'records-sub-tab'

export default function RecordsSection({ filters }: { filters: ProStatsFilters }) {
  const [records, setRecords] = useState<ProRecords | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [subTab, setSubTab] = useState<RecordSubTab>('players')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SUB_TAB_STORAGE_KEY) as RecordSubTab | null
      if (saved && SUB_TABS.some((t) => t.key === saved)) setSubTab(saved)
    } catch { /* ignore */ }
  }, [])

  const handleSubTab = useCallback((tab: RecordSubTab) => {
    setSubTab(tab)
    try { localStorage.setItem(SUB_TAB_STORAGE_KEY, tab) } catch { /* ignore */ }
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
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] w-fit">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleSubTab(tab.key)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              subTab === tab.key
                ? 'bg-[var(--accent)] text-black'
                : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-[var(--bg-hover)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Player Records */}
      {subTab === 'players' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <PlayerTable title="Best KDA" records={playerRecords.bestKda} formatValue={(r) => `${r.value} (${r.kills}/${r.deaths}/${r.assists})`} />
          <PlayerTable title="Most Kills" records={playerRecords.mostKills} formatValue={(r) => String(r.value)} />
          <PlayerTable title="Most Deaths" records={playerRecords.mostDeaths} formatValue={(r) => String(r.value)} />
          <PlayerTable title="Most Assists" records={playerRecords.mostAssists} formatValue={(r) => String(r.value)} />
          <PlayerTable title="K+A (0 Deaths)" records={playerRecords.mostKillsAssistsZeroDeaths} formatValue={(r) => `${r.value} (${r.kills}/${r.assists})`} />
          <PlayerTable title="Most K+A" records={playerRecords.mostKillsAssists} formatValue={(r) => `${r.value} (${r.kills}/${r.assists})`} />
          <PlayerTable title="Highest DPM" records={playerRecords.highestDpm} formatValue={(r) => r.value.toLocaleString()} />
          <PlayerTable title="Highest DMG%" records={playerRecords.highestDamageShare} formatValue={(r) => `${r.value}%`} />
          <PlayerTable title="Highest CS/min" records={playerRecords.highestCsPerMin} formatValue={(r) => `${r.value}/min`} />
          <PlayerTable title="Fastest Quest" records={playerRecords.fastestQuest} formatValue={(r) => fmt(r.value)} />
          <PlayerTable title="Slowest Quest" records={playerRecords.slowestQuest} formatValue={(r) => fmt(r.value)} />
          <PlayerTable title="Gold Diff @15 (Best)" records={playerRecords.highestGoldDiffAt15} formatValue={(r) => `+${r.value.toLocaleString()}`} />
          <PlayerTable title="Gold Diff @15 (Worst)" records={playerRecords.lowestGoldDiffAt15} formatValue={(r) => `${r.value.toLocaleString()}`} />
          <PlayerTable title="CS Diff @15 (Best)" records={playerRecords.highestCsDiffAt15} formatValue={(r) => `+${r.value}`} />
          <PlayerTable title="XP Diff @15 (Best)" records={playerRecords.highestXpDiffAt15} formatValue={(r) => `+${r.value.toLocaleString()}`} />
          <PlayerTable title="Gold Diff End (Best)" records={playerRecords.highestGoldDiffEnd} formatValue={(r) => `+${r.value.toLocaleString()}`} />
          <PlayerTable title="CS Diff End (Best)" records={playerRecords.highestCsDiffEnd} formatValue={(r) => `+${r.value}`} />
        </div>
      )}

      {/* Team Records */}
      {subTab === 'teams' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <TeamTable title="Victoire la plus rapide" records={teamRecords.fastestWin} />
          <TeamTable title="Game la plus longue" records={teamRecords.longestGame} />
          <TeamTable title="First Blood le plus rapide" records={teamRecords.fastestFirstBlood} />
          <TeamTable title="First Blood le plus lent" records={teamRecords.slowestFirstBlood} />
          <BoTable title="BO3 le plus rapide" records={teamRecords.fastestBo3} />
          <BoTable title="BO3 le plus long" records={teamRecords.slowestBo3} />
          <BoTable title="BO5 le plus rapide" records={teamRecords.fastestBo5} />
          <BoTable title="BO5 le plus long" records={teamRecords.slowestBo5} />
          <TeamTable title="Plus de kills (equipe)" records={teamRecords.mostTeamKills} valueLabel="Kills" formatValue={(r) => String(r.value)} />
          <TeamTable title="Plus de kills (game)" records={teamRecords.mostGameKills} valueLabel="Kills" formatValue={(r) => String(r.value)} />
          <TeamTable title="First Tower le plus rapide" records={teamRecords.fastestFirstTower} />
          <TeamTable title="First Dragon le plus rapide" records={teamRecords.fastestFirstDragon} />
          <TeamTable title="First Herald le plus rapide" records={teamRecords.fastestFirstHerald} />
          <TeamTable title="First Baron le plus rapide" records={teamRecords.fastestFirstBaron} />
          <TeamTable title="Plus de dragons (game)" records={teamRecords.mostDragons} valueLabel="Dragons" formatValue={(r) => String(r.value)} />
          <TeamTable title="Plus d'Elder Dragons" records={teamRecords.mostElderDragons} valueLabel="Elders" formatValue={(r) => String(r.value)} />
          <TeamTable title="Plus de Barons" records={teamRecords.mostBarons} valueLabel="Barons" formatValue={(r) => String(r.value)} />
          <TournamentKillsTable title="Moyenne de kills par game" records={tournamentRecords.avgKillsPerGame} />
        </div>
      )}

      {/* Streak Records */}
      {subTab === 'series' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StreakTable title="Plus longue serie de victoires (games)" records={streakRecords.longestGameWinStreak} unit="games" />
          <StreakTable title="Plus longue serie de defaites (games)" records={streakRecords.longestGameLossStreak} unit="games" />
          <StreakTable title="Plus longue serie de victoires (matchs)" records={streakRecords.longestMatchWinStreak} unit="matchs" />
          <StreakTable title="Plus longue serie de defaites (matchs)" records={streakRecords.longestMatchLossStreak} unit="matchs" />
        </div>
      )}
    </div>
  )
}
