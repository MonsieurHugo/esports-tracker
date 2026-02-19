'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import TeamLogo from '@/components/ui/TeamLogo'
import { SocialCardModal } from '@/components/social-card/SocialCardModal'
import type { SocialCardData, RecordCardType, FilterSummary } from '@/components/social-card/types'
import type { ProRecords, ProPlayerRecord, ProQuestGapRecord, ProTeamRecord, ProBoRecord, ProStreakRecord, ProTournamentKillsRecord, ProTournamentPlayerRecord } from '@/lib/types'
import { getChampionName, getChampionIconUrlDDragon } from '@/lib/champions'
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

function PlayerTable({ title, records, formatValue, onExport }: {
  title: string
  records: ProPlayerRecord[]
  formatValue: (r: ProPlayerRecord) => string
  onExport?: () => void
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  if (!records || records.length === 0) return null
  const colCount = 5
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} onExport={onExport} />
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
                    {r.teamName && <TeamLogo slug={r.teamName.toLowerCase()} shortName={r.teamName} name={r.teamFullName} size={16} />}
                    {r.role && (
                      <Image
                        src={getRoleImagePath(r.role)}
                        alt={r.role}
                        width={14}
                        height={14}
                        className="w-3.5 h-3.5 object-contain opacity-50"
                      />
                    )}
                    {r.championId != null && r.championId !== 0 ? (
                      <Image
                        src={getChampionIconUrlDDragon(r.championId)}
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
                  {r.gameNumber != null && (
                    <>
                      <span className="text-(--text-muted)/50">·</span>
                      <span className="font-mono">G{r.gameNumber}</span>
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

function QuestGapTable({ title, records }: {
  title: string
  records: ProQuestGapRecord[]
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
              <th className="py-1.5 px-2 w-6"></th>
              <th className="py-1.5">Ecart</th>
              <th className="py-1.5">Rapide</th>
              <th className="py-1.5">Lent</th>
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
                }`}
              >
                <td className="py-1.5 px-2">
                  <RankCell rank={i + 1} />
                </td>
                <td className={`py-1.5 font-mono font-bold text-xs ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                  {fmt(r.gap)}
                </td>
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    {r.fastTeamName && <TeamLogo slug={r.fastTeamName.toLowerCase()} shortName={r.fastTeamName} name={r.fastTeamFullName} size={16} />}
                    {r.fastChampionId != null && r.fastChampionId !== 0 && (
                      <Image
                        src={getChampionIconUrlDDragon(r.fastChampionId)}
                        alt={getChampionName(r.fastChampionId)}
                        width={20}
                        height={20}
                        className="w-5 h-5 rounded"
                        unoptimized
                      />
                    )}
                    <span className="text-xs text-(--text-primary)">{r.fastPlayerName}</span>
                    <span className="text-[10px] text-(--text-muted) font-mono">{fmt(r.fastQuestTime)}</span>
                  </div>
                </td>
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    {r.slowTeamName && <TeamLogo slug={r.slowTeamName.toLowerCase()} shortName={r.slowTeamName} name={r.slowTeamFullName} size={16} />}
                    {r.slowChampionId != null && r.slowChampionId !== 0 && (
                      <Image
                        src={getChampionIconUrlDDragon(r.slowChampionId)}
                        alt={getChampionName(r.slowChampionId)}
                        width={20}
                        height={20}
                        className="w-5 h-5 rounded"
                        unoptimized
                      />
                    )}
                    <span className="text-xs text-(--text-primary)">{r.slowPlayerName}</span>
                    <span className="text-[10px] text-(--text-muted) font-mono">{fmt(r.slowQuestTime)}</span>
                  </div>
                </td>
              </tr>
              {isExpanded && (
                <DetailRow colSpan={colCount}>
                  {r.gameNumber != null && (
                    <>
                      <span className="font-mono">G{r.gameNumber}</span>
                      <span className="text-(--text-muted)/50">·</span>
                    </>
                  )}
                  <span>{r.tournamentName}</span>
                  {r.gameDate && (
                    <>
                      <span className="text-(--text-muted)/50">·</span>
                      <span>{new Date(r.gameDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                    </>
                  )}
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

function TeamTable({ title, records, formatValue, valueLabel, winnerLabel, loserLabel, onExport }: {
  title: string
  records: ProTeamRecord[]
  formatValue?: (r: ProTeamRecord) => string
  valueLabel?: string
  winnerLabel?: string
  loserLabel?: string
  onExport?: () => void
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  if (!records || records.length === 0) return null
  const colCount = 4
  const renderValue = formatValue ?? ((r: ProTeamRecord) => fmt(r.value))
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} onExport={onExport} />
      <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
              <th className="py-2 px-2 w-8"></th>
              <th className="py-2">{valueLabel ?? 'Duree'}</th>
              <th className="py-2">{winnerLabel ?? 'Vainqueur'}</th>
              <th className="py-2">{loserLabel ?? 'Perdant'}</th>
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
                } ${r.win != null ? `border-l-2 ${r.win ? 'border-l-[var(--positive)]/50' : 'border-l-[var(--negative)]/50'}` : recent ? 'border-l-2 border-l-[var(--lol)]' : ''}`}
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
                    {r.winnerName && <TeamLogo slug={r.winnerName.toLowerCase()} shortName={r.winnerName} name={r.winnerFullName} size={20} />}
                    <span className="text-xs font-medium text-(--text-primary)">{r.winnerName || '—'}</span>
                  </div>
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1.5">
                    {r.loserName && <TeamLogo slug={r.loserName.toLowerCase()} shortName={r.loserName} name={r.loserFullName} size={20} />}
                    <span className="text-xs text-(--text-secondary)">{r.loserName || '—'}</span>
                  </div>
                </td>
              </tr>
              {isExpanded && (
                <DetailRow colSpan={colCount}>
                  {r.gameNumber != null && (
                    <>
                      <span className="font-mono">G{r.gameNumber}</span>
                      <span className="text-(--text-muted)/50">·</span>
                    </>
                  )}
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

function BoTable({ title, records, onExport }: {
  title: string
  records: ProBoRecord[]
  onExport?: () => void
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  if (!records || records.length === 0) return null
  const colCount = 4
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} onExport={onExport} />
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
                      {r.team1Name && <TeamLogo slug={r.team1Name.toLowerCase()} shortName={r.team1Name} name={r.team1FullName} size={20} />}
                      <span className="text-xs font-medium text-(--text-primary) hidden sm:inline">{r.team1Name}</span>
                    </div>
                    <span className="text-[10px] text-(--text-muted) font-medium">vs</span>
                    <div className="flex items-center gap-1">
                      {r.team2Name && <TeamLogo slug={r.team2Name.toLowerCase()} shortName={r.team2Name} name={r.team2FullName} size={20} />}
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

function StreakTable({ title, records, unit, onExport }: {
  title: string
  records: ProStreakRecord[]
  unit: string
  onExport?: () => void
}) {
  if (!records || records.length === 0) return null
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} onExport={onExport} />
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

function TournamentKillsTable({ title, records, onExport }: {
  title: string
  records: ProTournamentKillsRecord[]
  onExport?: () => void
}) {
  if (!records || records.length === 0) return null
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} onExport={onExport} />
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

function TournamentPlayerTable({ title, records, formatValue, valueLabel, onExport }: {
  title: string
  records: ProTournamentPlayerRecord[]
  formatValue: (r: ProTournamentPlayerRecord) => string
  valueLabel?: string
  onExport?: () => void
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  if (!records || records.length === 0) return null
  const colCount = 5
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] overflow-hidden">
      <TableTitle title={title} onExport={onExport} />
      <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-[10px] text-(--text-muted) uppercase tracking-wider bg-[var(--bg-card)] border-b border-[var(--border)]">
              <th className="py-1.5 px-2 w-6"></th>
              <th className="py-1.5" colSpan={2}>Joueur</th>
              <th className="py-1.5 text-right">{valueLabel ?? 'Val.'}</th>
              <th className="py-1.5 text-right pr-3">GP</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => {
              const isExpanded = expandedIndex === i
              return (
              <React.Fragment key={i}>
              <tr
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className={`border-b border-[var(--border)]/30 transition-colors hover:bg-[var(--bg-hover)] cursor-pointer ${
                  i === 0 ? 'bg-[var(--accent)]/5' : ''
                }`}
              >
                <td className="py-1.5 px-2">
                  <RankCell rank={i + 1} />
                </td>
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    {r.teamName && <TeamLogo slug={r.teamName.toLowerCase()} shortName={r.teamName} name={r.teamFullName} size={16} />}
                    {r.role && (
                      <Image
                        src={getRoleImagePath(r.role)}
                        alt={r.role}
                        width={14}
                        height={14}
                        className="w-3.5 h-3.5 object-contain opacity-50"
                      />
                    )}
                  </div>
                </td>
                <td className={`py-1.5 text-xs font-medium ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                  <div className="flex flex-col">
                    <span>{r.playerName}</span>
                    <span className="text-[10px] text-(--text-muted) font-normal" title={r.tournamentName}>
                      {r.leagueShortName ? `${r.leagueShortName} · ` : ''}{shortenTournamentName(r.tournamentName)}
                    </span>
                  </div>
                </td>
                <td className={`py-1.5 text-right font-mono font-bold text-xs ${i === 0 ? 'text-[var(--accent)]' : 'text-(--text-primary)'}`}>
                  {formatValue(r)}
                </td>
                <td className="py-1.5 text-right pr-3 font-mono text-xs text-(--text-muted)">
                  {r.gamesPlayed}
                </td>
              </tr>
              {isExpanded && (
                <DetailRow colSpan={colCount}>
                  {r.gamesWon != null && (
                    <span className="font-mono">
                      {r.gamesWon}W {r.gamesPlayed - r.gamesWon}L
                    </span>
                  )}
                  {r.winRate != null && (
                    <>
                      <span className="text-(--text-muted)/50">·</span>
                      <span className={`font-mono ${r.winRate >= 50 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                        {r.winRate.toFixed(1)}%
                      </span>
                    </>
                  )}
                  {r.kills != null && r.deaths != null && r.assists != null && (
                    <>
                      <span className="text-(--text-muted)/50">·</span>
                      <span className="font-mono">{r.kills}/{r.deaths}/{r.assists}</span>
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

function CollapsibleCategory({ title, defaultOpen = false, children }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-3 w-full group cursor-pointer mb-3"
      >
        <svg
          className={`w-4 h-4 text-(--text-muted) transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="text-xs font-semibold text-(--text-secondary) uppercase tracking-wider whitespace-nowrap">
          {title}
        </span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </button>
      {isOpen && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {children}
        </div>
      )}
    </div>
  )
}

function TableTitle({ title, onExport }: { title: string; onExport?: () => void }) {
  return (
    <div className="px-4 py-2.5 bg-[var(--bg-card)] border-b border-[var(--border)] flex items-center justify-between">
      <h3 className="text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">{title}</h3>
      {onExport && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onExport()
          }}
          className="p-1 rounded hover:bg-[var(--bg-hover)] text-(--text-muted) hover:text-(--text-primary) transition-colors"
          title="Export social card"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      )}
    </div>
  )
}

type RecordSubTab = 'players' | 'teams' | 'series' | 'tournament'

const SUB_TABS: { key: RecordSubTab; label: string }[] = [
  { key: 'players', label: 'Joueurs' },
  { key: 'tournament', label: 'Joueurs (Tournoi)' },
  { key: 'teams', label: 'Equipes' },
  { key: 'series', label: 'Series' },
]

const SUB_TAB_STORAGE_KEY = 'records-sub-tab'

function buildFilterSummary(filters: ProStatsFilters): FilterSummary {
  const leagues: string[] = []
  if (filters.selectedLeagueIds.size > 0) {
    for (const opt of filters.availableOptions.leagues) {
      if (filters.selectedLeagueIds.has(opt.leagueId)) {
        leagues.push(opt.shortName || opt.name)
      }
    }
  }
  const teams: string[] = []
  if (filters.selectedTeamIds.size > 0) {
    for (const opt of filters.availableOptions.teams) {
      if (filters.selectedTeamIds.has(opt.teamId)) {
        teams.push(opt.shortName)
      }
    }
  }
  return {
    leagues,
    years: [...filters.selectedYears],
    role: filters.role,
    teams,
  }
}

export default function RecordsSection({ filters }: { filters: ProStatsFilters }) {
  const [records, setRecords] = useState<ProRecords | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [subTab, setSubTab] = useState<RecordSubTab>('players')
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const [socialCardData, setSocialCardData] = useState<SocialCardData | null>(null)

  const openSocialCard = useCallback((
    title: string,
    cardType: RecordCardType,
    recordsArr: SocialCardData['records'],
    formatValue: SocialCardData['formatValue'],
    extra?: SocialCardData['extra']
  ) => {
    setSocialCardData({
      title,
      cardType,
      records: recordsArr,
      formatValue,
      filters: buildFilterSummary(filters),
      extra,
    })
  }, [filters])

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
          if (includeExcluded) params.includeExcluded = 'true'
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
  }, [buildParams, includeExcluded])

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
      {/* Sub-tabs + toggle */}
      <div className="flex items-center gap-4 flex-wrap">
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

        <label className="flex items-center gap-2 cursor-pointer select-none ml-2">
          <button
            type="button"
            role="switch"
            aria-checked={includeExcluded}
            onClick={() => setIncludeExcluded((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              includeExcluded ? 'bg-[var(--accent)]' : 'bg-[var(--bg-hover)] border border-[var(--border)]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                includeExcluded ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
          <span className="text-xs text-(--text-secondary)">Inclure tournois promotions/autres</span>
        </label>
      </div>

      {/* Player Records */}
      {subTab === 'players' && (
        <div className="space-y-2">
          <CollapsibleCategory title="KDA & Combat">
            {([
              ['Best KDA', playerRecords.bestKda, (r: ProPlayerRecord) => `${r.value.toFixed(2)} (${r.kills}/${r.deaths}/${r.assists})`],
              ['Most Kills', playerRecords.mostKills, (r: ProPlayerRecord) => String(r.value)],
              ['Most Deaths', playerRecords.mostDeaths, (r: ProPlayerRecord) => String(r.value)],
              ['Most Assists', playerRecords.mostAssists, (r: ProPlayerRecord) => String(r.value)],
              ['K+A (0 Deaths)', playerRecords.mostKillsAssistsZeroDeaths, (r: ProPlayerRecord) => `${r.value} (${r.kills}/${r.deaths}/${r.assists})`],
              ['Most K+A', playerRecords.mostKillsAssists, (r: ProPlayerRecord) => `${r.value} (${r.kills}/${r.deaths}/${r.assists})`],
              ['Solo Kills', playerRecords.mostSoloKills, (r: ProPlayerRecord) => String(r.value)],
              ['Solo Deaths', playerRecords.mostSoloDeaths, (r: ProPlayerRecord) => String(r.value)],
            ] as [string, ProPlayerRecord[], (r: ProPlayerRecord) => string][]).map(([title, recs, fv]) => (
              <PlayerTable
                key={title}
                title={title}
                records={recs}
                formatValue={fv}
                onExport={() => openSocialCard(title, 'player', recs, fv as SocialCardData['formatValue'])}
              />
            ))}
          </CollapsibleCategory>

          <CollapsibleCategory title="Degats & Farm">
            {([
              ['Highest DPM', playerRecords.highestDpm, (r: ProPlayerRecord) => Math.round(r.value).toLocaleString()],
              ['Highest DPM Post 15', playerRecords.highestDpmPost15, (r: ProPlayerRecord) => Math.round(r.value).toLocaleString()],
              ['Highest DMG%', playerRecords.highestDamageShare, (r: ProPlayerRecord) => `${r.value.toFixed(1)}%`],
              ['Highest CS/min', playerRecords.highestCsPerMin, (r: ProPlayerRecord) => r.value.toFixed(2)],
            ] as [string, ProPlayerRecord[], (r: ProPlayerRecord) => string][]).map(([title, recs, fv]) => (
              <PlayerTable
                key={title}
                title={title}
                records={recs}
                formatValue={fv}
                onExport={() => openSocialCard(title, 'player', recs, fv as SocialCardData['formatValue'])}
              />
            ))}
          </CollapsibleCategory>

          <CollapsibleCategory title="Quetes">
            {([
              ['Fastest Quest', playerRecords.fastestQuest, (r: ProPlayerRecord) => fmt(r.value)],
              ['Slowest Quest', playerRecords.slowestQuest, (r: ProPlayerRecord) => fmt(r.value)],
            ] as [string, ProPlayerRecord[], (r: ProPlayerRecord) => string][]).map(([title, recs, fv]) => (
              <PlayerTable
                key={title}
                title={title}
                records={recs}
                formatValue={fv}
                onExport={() => openSocialCard(title, 'player', recs, fv as SocialCardData['formatValue'])}
              />
            ))}
            <QuestGapTable title="Plus gros ecart de quete" records={playerRecords.biggestQuestGap} />
          </CollapsibleCategory>

          <CollapsibleCategory title="Avantage en lane @15">
            {([
              ['Kills @15', playerRecords.mostKillsAt15, (r: ProPlayerRecord) => String(Math.round(r.value))],
              ['Kills + Assists @15', playerRecords.mostKillsAssistsAt15, (r: ProPlayerRecord) => String(Math.round(r.value))],
              ['Deaths @15', playerRecords.mostDeathsAt15, (r: ProPlayerRecord) => String(Math.round(r.value))],
              ['Gold Diff @15 (Best)', playerRecords.highestGoldDiffAt15, (r: ProPlayerRecord) => `+${Math.round(r.value).toLocaleString()}`],
              ['Gold Diff @15 (Worst)', playerRecords.lowestGoldDiffAt15, (r: ProPlayerRecord) => Math.round(r.value).toLocaleString()],
              ['CS Diff @15 (Best)', playerRecords.highestCsDiffAt15, (r: ProPlayerRecord) => `+${Math.round(r.value)}`],
              ['XP Diff @15 (Best)', playerRecords.highestXpDiffAt15, (r: ProPlayerRecord) => `+${Math.round(r.value).toLocaleString()}`],
            ] as [string, ProPlayerRecord[], (r: ProPlayerRecord) => string][]).map(([title, recs, fv]) => (
              <PlayerTable
                key={title}
                title={title}
                records={recs}
                formatValue={fv}
                onExport={() => openSocialCard(title, 'player', recs, fv as SocialCardData['formatValue'])}
              />
            ))}
          </CollapsibleCategory>

          <CollapsibleCategory title="Avantage fin de game">
            {([
              ['Gold Diff End (Best)', playerRecords.highestGoldDiffEnd, (r: ProPlayerRecord) => `+${Math.round(r.value).toLocaleString()}`],
              ['CS Diff End (Best)', playerRecords.highestCsDiffEnd, (r: ProPlayerRecord) => `+${Math.round(r.value)}`],
            ] as [string, ProPlayerRecord[], (r: ProPlayerRecord) => string][]).map(([title, recs, fv]) => (
              <PlayerTable
                key={title}
                title={title}
                records={recs}
                formatValue={fv}
                onExport={() => openSocialCard(title, 'player', recs, fv as SocialCardData['formatValue'])}
              />
            ))}
          </CollapsibleCategory>
        </div>
      )}

      {/* Team Records */}
      {subTab === 'teams' && (
        <div className="space-y-2">
          <CollapsibleCategory title="Duree">
            <TeamTable title="Victoire la plus rapide" records={teamRecords.fastestWin} onExport={() => openSocialCard('Victoire la plus rapide', 'team', teamRecords.fastestWin, ((r: ProTeamRecord) => fmt(r.value)) as SocialCardData['formatValue'])} />
            <TeamTable title="Game la plus longue" records={teamRecords.longestGame} onExport={() => openSocialCard('Game la plus longue', 'team', teamRecords.longestGame, ((r: ProTeamRecord) => fmt(r.value)) as SocialCardData['formatValue'])} />
          </CollapsibleCategory>

          <CollapsibleCategory title="First Blood">
            <TeamTable title="First Blood le plus rapide" records={teamRecords.fastestFirstBlood} winnerLabel="Auteur" loserLabel="Victime" onExport={() => openSocialCard('First Blood le plus rapide', 'team', teamRecords.fastestFirstBlood, ((r: ProTeamRecord) => fmt(r.value)) as SocialCardData['formatValue'], { winnerLabel: 'Auteur', loserLabel: 'Victime' })} />
            <TeamTable title="First Blood le plus lent" records={teamRecords.slowestFirstBlood} winnerLabel="Auteur" loserLabel="Victime" onExport={() => openSocialCard('First Blood le plus lent', 'team', teamRecords.slowestFirstBlood, ((r: ProTeamRecord) => fmt(r.value)) as SocialCardData['formatValue'], { winnerLabel: 'Auteur', loserLabel: 'Victime' })} />
          </CollapsibleCategory>

          <CollapsibleCategory title="Best of">
            <BoTable title="BO3 le plus rapide" records={teamRecords.fastestBo3} onExport={() => openSocialCard('BO3 le plus rapide', 'bo', teamRecords.fastestBo3, (() => '') as SocialCardData['formatValue'])} />
            <BoTable title="BO3 le plus long" records={teamRecords.slowestBo3} onExport={() => openSocialCard('BO3 le plus long', 'bo', teamRecords.slowestBo3, (() => '') as SocialCardData['formatValue'])} />
            <BoTable title="BO5 le plus rapide" records={teamRecords.fastestBo5} onExport={() => openSocialCard('BO5 le plus rapide', 'bo', teamRecords.fastestBo5, (() => '') as SocialCardData['formatValue'])} />
            <BoTable title="BO5 le plus long" records={teamRecords.slowestBo5} onExport={() => openSocialCard('BO5 le plus long', 'bo', teamRecords.slowestBo5, (() => '') as SocialCardData['formatValue'])} />
          </CollapsibleCategory>

          <CollapsibleCategory title="Kills">
            <TeamTable title="Plus de kills (equipe)" records={teamRecords.mostTeamKills} valueLabel="Kills" formatValue={(r) => String(r.value)} onExport={() => openSocialCard('Plus de kills (equipe)', 'team', teamRecords.mostTeamKills, ((r: ProTeamRecord) => String(r.value)) as SocialCardData['formatValue'], { valueLabel: 'Kills' })} />
            <TeamTable title="Plus de kills (game)" records={teamRecords.mostGameKills} valueLabel="Kills" formatValue={(r) => String(r.value)} onExport={() => openSocialCard('Plus de kills (game)', 'team', teamRecords.mostGameKills, ((r: ProTeamRecord) => String(r.value)) as SocialCardData['formatValue'], { valueLabel: 'Kills' })} />
            <TournamentKillsTable title="Moyenne de kills par game" records={tournamentRecords.avgKillsPerGame} onExport={() => openSocialCard('Moyenne de kills par game', 'tournamentKills', tournamentRecords.avgKillsPerGame, (() => '') as SocialCardData['formatValue'])} />
          </CollapsibleCategory>

          <CollapsibleCategory title="Objectifs">
            <TeamTable title="First Tower le plus rapide" records={teamRecords.fastestFirstTower} onExport={() => openSocialCard('First Tower le plus rapide', 'team', teamRecords.fastestFirstTower, ((r: ProTeamRecord) => fmt(r.value)) as SocialCardData['formatValue'])} />
            <TeamTable title="First Dragon le plus rapide" records={teamRecords.fastestFirstDragon} onExport={() => openSocialCard('First Dragon le plus rapide', 'team', teamRecords.fastestFirstDragon, ((r: ProTeamRecord) => fmt(r.value)) as SocialCardData['formatValue'])} />
            <TeamTable title="First Herald le plus rapide" records={teamRecords.fastestFirstHerald} onExport={() => openSocialCard('First Herald le plus rapide', 'team', teamRecords.fastestFirstHerald, ((r: ProTeamRecord) => fmt(r.value)) as SocialCardData['formatValue'])} />
            <TeamTable title="First Baron le plus rapide" records={teamRecords.fastestFirstBaron} onExport={() => openSocialCard('First Baron le plus rapide', 'team', teamRecords.fastestFirstBaron, ((r: ProTeamRecord) => fmt(r.value)) as SocialCardData['formatValue'])} />
            <TeamTable title="Plus de dragons (game)" records={teamRecords.mostDragons} valueLabel="Dragons" formatValue={(r) => String(r.value)} onExport={() => openSocialCard('Plus de dragons (game)', 'team', teamRecords.mostDragons, ((r: ProTeamRecord) => String(r.value)) as SocialCardData['formatValue'], { valueLabel: 'Dragons' })} />
            <TeamTable title="Plus d'Elder Dragons" records={teamRecords.mostElderDragons} valueLabel="Elders" formatValue={(r) => String(r.value)} onExport={() => openSocialCard("Plus d'Elder Dragons", 'team', teamRecords.mostElderDragons, ((r: ProTeamRecord) => String(r.value)) as SocialCardData['formatValue'], { valueLabel: 'Elders' })} />
            <TeamTable title="Plus de Barons" records={teamRecords.mostBarons} valueLabel="Barons" formatValue={(r) => String(r.value)} onExport={() => openSocialCard('Plus de Barons', 'team', teamRecords.mostBarons, ((r: ProTeamRecord) => String(r.value)) as SocialCardData['formatValue'], { valueLabel: 'Barons' })} />
          </CollapsibleCategory>
        </div>
      )}

      {/* Streak Records */}
      {subTab === 'series' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StreakTable title="Plus longue serie de victoires (games)" records={streakRecords.longestGameWinStreak} unit="games" onExport={() => openSocialCard('Plus longue serie de victoires (games)', 'streak', streakRecords.longestGameWinStreak, (() => '') as SocialCardData['formatValue'], { unit: 'games' })} />
          <StreakTable title="Plus longue serie de defaites (games)" records={streakRecords.longestGameLossStreak} unit="games" onExport={() => openSocialCard('Plus longue serie de defaites (games)', 'streak', streakRecords.longestGameLossStreak, (() => '') as SocialCardData['formatValue'], { unit: 'games' })} />
          <StreakTable title="Plus longue serie de victoires (matchs)" records={streakRecords.longestMatchWinStreak} unit="matchs" onExport={() => openSocialCard('Plus longue serie de victoires (matchs)', 'streak', streakRecords.longestMatchWinStreak, (() => '') as SocialCardData['formatValue'], { unit: 'matchs' })} />
          <StreakTable title="Plus longue serie de defaites (matchs)" records={streakRecords.longestMatchLossStreak} unit="matchs" onExport={() => openSocialCard('Plus longue serie de defaites (matchs)', 'streak', streakRecords.longestMatchLossStreak, (() => '') as SocialCardData['formatValue'], { unit: 'matchs' })} />
        </div>
      )}

      {/* Tournament-aggregated Player Records */}
      {subTab === 'tournament' && records.tournamentPlayerRecords && (() => {
        const tpr = records.tournamentPlayerRecords!
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {([
              ['Best KDA (Tournoi)', tpr.bestKda, (r: ProTournamentPlayerRecord) => r.kills != null ? `${r.value.toFixed(2)} (${r.kills}/${r.deaths}/${r.assists})` : r.value.toFixed(2)],
              ['Most Kills (Tournoi)', tpr.mostKills, (r: ProTournamentPlayerRecord) => String(r.value)],
              ['Most Assists (Tournoi)', tpr.mostAssists, (r: ProTournamentPlayerRecord) => String(r.value)],
              ['Highest DPM (Tournoi)', tpr.highestDpm, (r: ProTournamentPlayerRecord) => Math.round(r.value).toLocaleString()],
              ['Highest DPM Post 15 (Tournoi)', tpr.highestDpmPost15, (r: ProTournamentPlayerRecord) => Math.round(r.value).toLocaleString()],
              ['Highest CS/min (Tournoi)', tpr.highestCsPerMin, (r: ProTournamentPlayerRecord) => r.value.toFixed(2)],
              ['Best Win Rate (Tournoi)', tpr.bestWinRate, (r: ProTournamentPlayerRecord) => `${r.value.toFixed(1)}%`],
              ['Highest KP (Tournoi)', tpr.highestKp, (r: ProTournamentPlayerRecord) => `${r.value.toFixed(1)}%`],
              ['Avg Gold Diff @15 (Tournoi)', tpr.bestAvgGoldDiffAt15, (r: ProTournamentPlayerRecord) => r.value >= 0 ? `+${Math.round(r.value).toLocaleString()}` : Math.round(r.value).toLocaleString()],
              ['Most Pentakills (Tournoi)', tpr.mostPentakills, (r: ProTournamentPlayerRecord) => String(r.value)],
              ['Most Champions (Tournoi)', tpr.mostUniqueChampions, (r: ProTournamentPlayerRecord) => String(r.value)],
            ] as [string, ProTournamentPlayerRecord[], (r: ProTournamentPlayerRecord) => string][]).map(([title, recs, fv]) => (
              <TournamentPlayerTable
                key={title}
                title={title}
                records={recs}
                formatValue={fv}
                onExport={() => openSocialCard(title, 'tournamentPlayer', recs, fv as SocialCardData['formatValue'])}
              />
            ))}
          </div>
        )
      })()}

      {/* Social Card Export Modal */}
      {socialCardData && (
        <SocialCardModal
          isOpen={!!socialCardData}
          onClose={() => setSocialCardData(null)}
          data={socialCardData}
        />
      )}
    </div>
  )
}
