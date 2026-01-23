'use client'

import { use, useState } from 'react'
import { useMatch, useGame } from '@/hooks/useProData'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { ProGame, ProGameDetail } from '@/lib/proTypes'

interface MatchPageProps {
  params: Promise<{ id: string }>
}

function GameStats({ gameId }: { gameId: number }) {
  const { data, isLoading } = useGame(gameId)

  if (isLoading) {
    return (
      <div className="p-4 animate-pulse">
        <div className="h-32 bg-[var(--bg-hover)] rounded" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-[var(--text-muted)]">
        Game data not available
      </div>
    )
  }

  const { game, draft, players } = data

  const blueTeamPlayers = players.filter((p) => p.side === 'blue')
  const redTeamPlayers = players.filter((p) => p.side === 'red')

  return (
    <div className="p-4 space-y-6">
      {/* Draft */}
      {draft && (
        <div>
          <h4 className="text-sm font-medium text-[var(--text-muted)] mb-3">Draft</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Blue Side Picks</div>
              <div className="flex gap-1">
                {draft.bluePicks.map((champId, i) => (
                  <div key={i} className="w-8 h-8 bg-[var(--bg-hover)] rounded flex items-center justify-center text-xs">
                    {champId}
                  </div>
                ))}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-2 mb-1">Blue Side Bans</div>
              <div className="flex gap-1">
                {draft.blueBans.map((champId, i) => (
                  <div key={i} className="w-6 h-6 bg-red-500/20 rounded flex items-center justify-center text-[10px] text-red-500">
                    {champId}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1">Red Side Picks</div>
              <div className="flex gap-1">
                {draft.redPicks.map((champId, i) => (
                  <div key={i} className="w-8 h-8 bg-[var(--bg-hover)] rounded flex items-center justify-center text-xs">
                    {champId}
                  </div>
                ))}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-2 mb-1">Red Side Bans</div>
              <div className="flex gap-1">
                {draft.redBans.map((champId, i) => (
                  <div key={i} className="w-6 h-6 bg-red-500/20 rounded flex items-center justify-center text-[10px] text-red-500">
                    {champId}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Player Stats Table */}
      {players.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[var(--text-muted)] mb-3">Player Stats</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="pb-2">Player</th>
                  <th className="pb-2">Champion</th>
                  <th className="pb-2 text-center">K</th>
                  <th className="pb-2 text-center">D</th>
                  <th className="pb-2 text-center">A</th>
                  <th className="pb-2 text-center">CS</th>
                  <th className="pb-2 text-center">Gold</th>
                  <th className="pb-2 text-center">DMG</th>
                </tr>
              </thead>
              <tbody>
                {/* Blue Team */}
                <tr>
                  <td colSpan={8} className="pt-2 pb-1 text-blue-400 font-medium">
                    {game.blueTeam.shortName || 'Blue Side'}
                  </td>
                </tr>
                {blueTeamPlayers.map((player) => (
                  <tr key={player.playerId} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 font-medium">{player.playerName}</td>
                    <td className="py-2">{player.championId}</td>
                    <td className="py-2 text-center text-[var(--positive)]">{player.kills}</td>
                    <td className="py-2 text-center text-[var(--negative)]">{player.deaths}</td>
                    <td className="py-2 text-center">{player.assists}</td>
                    <td className="py-2 text-center">{player.cs}</td>
                    <td className="py-2 text-center">{(player.goldEarned / 1000).toFixed(1)}k</td>
                    <td className="py-2 text-center">{(player.damageDealt / 1000).toFixed(1)}k</td>
                  </tr>
                ))}

                {/* Red Team */}
                <tr>
                  <td colSpan={8} className="pt-4 pb-1 text-red-400 font-medium">
                    {game.redTeam.shortName || 'Red Side'}
                  </td>
                </tr>
                {redTeamPlayers.map((player) => (
                  <tr key={player.playerId} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 font-medium">{player.playerName}</td>
                    <td className="py-2">{player.championId}</td>
                    <td className="py-2 text-center text-[var(--positive)]">{player.kills}</td>
                    <td className="py-2 text-center text-[var(--negative)]">{player.deaths}</td>
                    <td className="py-2 text-center">{player.assists}</td>
                    <td className="py-2 text-center">{player.cs}</td>
                    <td className="py-2 text-center">{(player.goldEarned / 1000).toFixed(1)}k</td>
                    <td className="py-2 text-center">{(player.damageDealt / 1000).toFixed(1)}k</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MatchPage({ params }: MatchPageProps) {
  const { id } = use(params)
  const matchId = parseInt(id, 10)
  const { data, isLoading, error } = useMatch(isNaN(matchId) ? null : matchId)
  const [selectedGame, setSelectedGame] = useState<number | null>(null)

  if (isLoading) {
    return (
      <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
        <div className="animate-pulse">
          <div className="h-6 bg-[var(--bg-card)] rounded w-32 mb-4" />
          <div className="h-48 bg-[var(--bg-card)] rounded-xl mb-4" />
          <div className="h-64 bg-[var(--bg-card)] rounded-xl" />
        </div>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--negative)]">{error?.message || 'Match not found'}</p>
          <Link href="/pro/matches" className="text-[var(--accent)] mt-4 inline-block">
            Back to matches
          </Link>
        </div>
      </main>
    )
  }

  const { match, games } = data
  const isLive = match.status === 'live'

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/pro/matches" className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] mb-2 inline-block">
          &larr; Back to matches
        </Link>

        {/* Tournament info */}
        <div className="flex items-center gap-2 mb-2">
          <Link
            href={`/pro/tournaments/${match.tournamentSlug}`}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            {match.tournamentName}
          </Link>
          {isLive && (
            <span className="flex items-center gap-1 text-xs text-red-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Match Score Card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 mb-6">
        <div className="flex items-center justify-center gap-8">
          {/* Team 1 */}
          <div className={cn(
            'text-center',
            match.winnerTeamId === match.team1.teamId && 'text-[var(--positive)]'
          )}>
            <div className="text-2xl font-bold">{match.team1.shortName || match.team1.name || 'TBD'}</div>
            <div className="text-5xl font-mono font-bold mt-2">{match.team1Score}</div>
          </div>

          {/* VS */}
          <div className="text-[var(--text-muted)] text-lg">
            <div>{match.format.toUpperCase()}</div>
          </div>

          {/* Team 2 */}
          <div className={cn(
            'text-center',
            match.winnerTeamId === match.team2.teamId && 'text-[var(--positive)]'
          )}>
            <div className="text-2xl font-bold">{match.team2.shortName || match.team2.name || 'TBD'}</div>
            <div className="text-5xl font-mono font-bold mt-2">{match.team2Score}</div>
          </div>
        </div>
      </div>

      {/* Games */}
      {games.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
          {/* Game Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {games.map((game) => (
              <button
                key={game.gameId}
                onClick={() => setSelectedGame(selectedGame === game.gameId ? null : game.gameId)}
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                  selectedGame === game.gameId
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <span>Game {game.gameNumber}</span>
                  {game.winnerTeamId && (
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      game.winnerTeamId === match.team1.teamId ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                    )}>
                      {game.winnerTeamId === match.team1.teamId ? match.team1.shortName : match.team2.shortName}
                    </span>
                  )}
                  {game.duration && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatDuration(game.duration)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Game Details */}
          {selectedGame && <GameStats gameId={selectedGame} />}

          {!selectedGame && (
            <div className="p-8 text-center text-[var(--text-muted)]">
              Select a game to view details
            </div>
          )}
        </div>
      )}

      {games.length === 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--text-muted)]">
            {match.status === 'upcoming' ? 'Match has not started yet' : 'No game data available'}
          </p>
        </div>
      )}
    </main>
  )
}
