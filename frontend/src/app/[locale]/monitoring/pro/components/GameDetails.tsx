'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'

interface GameData {
  game: {
    id: number
    gameNumber: number
    duration: number
    winnerTeamSide: string | null
    patch: string | null
    team1Side?: 'blue' | 'red'
  }
  teams: {
    team1: { name: string | null; score: number }
    team2: { name: string | null; score: number }
  }
  playerStats: Array<{
    playerName: string
    teamSide: string
    role: string | null
    championName: string | null
    kills: number
    deaths: number
    assists: number
    cs: number
    goldEarned: number
    damageDealt: number
    killParticipation: number
  }>
  draftActions: Array<{
    actionOrder: number
    actionType: string
    teamOrder: string
    championName: string | null
    role: string | null
  }>
}

interface GameWithObjectives {
  id: number
  gameNumber: number
  duration: number
  patch: string | null
  status: string
  winnerTeamSide: string | null
  blueTowers: number
  redTowers: number
  blueDragons: number
  redDragons: number
  blueBarons: number
  redBarons: number
}

interface GameEvent {
  id: number
  eventType: string
  gameTime: number
  actorPlayerName: string | null
  targetPlayerName: string | null
  positionX: number | null
  positionY: number | null
  eventData: Record<string, unknown>
}

interface GameDetailsProps {
  gameId: number
  onClose: () => void
}

type TabType = 'stats' | 'draft' | 'timeline' | 'objectives'

export default function GameDetails({ gameId, onClose }: GameDetailsProps) {
  const [data, setData] = useState<GameData | null>(null)
  const [objectives, setObjectives] = useState<GameWithObjectives | null>(null)
  const [events, setEvents] = useState<GameEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('stats')

  const fetchGame = useCallback(async () => {
    setIsLoading(true)
    try {
      const [gameResult, eventsResult] = await Promise.all([
        api.get<GameData>(`/pro/monitoring/games/${gameId}`),
        api.get<{ data: GameEvent[] }>(`/pro/monitoring/games/${gameId}/events`),
      ])
      setData(gameResult)
      setEvents(eventsResult.data)

      // Get objectives from games-by-match endpoint
      // This is a workaround since we don't have match_id here
      // We'll extract objectives from the game data if available
    } catch (error) {
      logError('Failed to fetch game details', error)
    } finally {
      setIsLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    fetchGame()
  }, [fetchGame])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatGameTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatGold = (gold: number) => {
    if (gold >= 1000) return `${(gold / 1000).toFixed(1)}k`
    return String(gold)
  }

  if (isLoading) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-6 w-32" />
          <button onClick={onClose} className="text-(--text-muted) hover:text-(--text-primary)">
            X
          </button>
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-(--text-primary) font-medium">Game Details</span>
          <button onClick={onClose} className="text-(--text-muted) hover:text-(--text-primary)">
            X
          </button>
        </div>
        <div className="text-(--text-muted) text-center py-8">Failed to load game data</div>
      </div>
    )
  }

  const blueTeam = data.playerStats.filter((p) => p.teamSide === 'blue')
  const redTeam = data.playerStats.filter((p) => p.teamSide === 'red')

  const bans = data.draftActions.filter((a) => a.actionType === 'ban')
  const picks = data.draftActions.filter((a) => a.actionType === 'pick')

  // Group events by type
  const killEvents = events.filter((e) => e.eventType === 'kill')
  const objectiveEvents = events.filter((e) =>
    ['dragon', 'baron', 'herald', 'tower', 'inhibitor'].includes(e.eventType)
  )

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'kill':
        return '⚔️'
      case 'dragon':
        return '🐉'
      case 'baron':
        return '👿'
      case 'herald':
        return '🦀'
      case 'tower':
        return '🗼'
      case 'inhibitor':
        return '💎'
      default:
        return '📍'
    }
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-(--text-primary) font-medium">Game {data.game.gameNumber}</h3>
            <div className="text-xs text-(--text-muted) mt-1">
              {formatDuration(data.game.duration)} | Patch {data.game.patch || 'Unknown'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-(--text-muted) hover:text-(--text-primary)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Winner indicator */}
      <div className="p-3 bg-[var(--bg-secondary)] text-center text-sm">
        <span
          className={`font-medium ${
            data.game.winnerTeamSide === 'blue' ? 'text-blue-400' : 'text-red-400'
          }`}
        >
          {data.game.winnerTeamSide === 'blue' ? 'Blue Side' : 'Red Side'} Victory
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 py-2 text-xs ${
            activeTab === 'stats'
              ? 'bg-[var(--bg-hover)] text-(--text-primary)'
              : 'text-(--text-muted) hover:bg-[var(--bg-hover)]'
          }`}
        >
          Stats
        </button>
        <button
          onClick={() => setActiveTab('draft')}
          className={`flex-1 py-2 text-xs ${
            activeTab === 'draft'
              ? 'bg-[var(--bg-hover)] text-(--text-primary)'
              : 'text-(--text-muted) hover:bg-[var(--bg-hover)]'
          }`}
        >
          Draft
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 py-2 text-xs ${
            activeTab === 'timeline'
              ? 'bg-[var(--bg-hover)] text-(--text-primary)'
              : 'text-(--text-muted) hover:bg-[var(--bg-hover)]'
          }`}
        >
          Timeline
        </button>
        <button
          onClick={() => setActiveTab('objectives')}
          className={`flex-1 py-2 text-xs ${
            activeTab === 'objectives'
              ? 'bg-[var(--bg-hover)] text-(--text-primary)'
              : 'text-(--text-muted) hover:bg-[var(--bg-hover)]'
          }`}
        >
          Objectives
        </button>
      </div>

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="p-4 space-y-4">
          {/* Blue Team */}
          <div>
            <div className="text-xs text-blue-400 mb-2 font-medium">Blue Side</div>
            <div className="space-y-1">
              {blueTeam.map((player, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs items-center"
                >
                  <div className="truncate">
                    <span className="text-(--text-muted) mr-1">{player.role || '-'}</span>
                    <span className="text-(--text-primary)">{player.playerName}</span>
                    <span className="text-(--text-muted) ml-1">({player.championName})</span>
                  </div>
                  <div className="text-(--text-primary) font-mono">
                    {player.kills}/{player.deaths}/{player.assists}
                  </div>
                  <div className="text-(--text-muted) font-mono">{formatGold(player.goldEarned)}</div>
                  <div className="text-(--text-muted) font-mono">{player.killParticipation}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Red Team */}
          <div>
            <div className="text-xs text-red-400 mb-2 font-medium">Red Side</div>
            <div className="space-y-1">
              {redTeam.map((player, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs items-center"
                >
                  <div className="truncate">
                    <span className="text-(--text-muted) mr-1">{player.role || '-'}</span>
                    <span className="text-(--text-primary)">{player.playerName}</span>
                    <span className="text-(--text-muted) ml-1">({player.championName})</span>
                  </div>
                  <div className="text-(--text-primary) font-mono">
                    {player.kills}/{player.deaths}/{player.assists}
                  </div>
                  <div className="text-(--text-muted) font-mono">{formatGold(player.goldEarned)}</div>
                  <div className="text-(--text-muted) font-mono">{player.killParticipation}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="text-[10px] text-(--text-muted) flex gap-4">
            <span>KDA</span>
            <span>Gold</span>
            <span>KP%</span>
          </div>
        </div>
      )}

      {/* Draft Tab */}
      {activeTab === 'draft' && (() => {
        // Determine which side each team is on
        // team1/team2 = pick order, blue/red = map side
        const team1Side = data.game.team1Side || 'blue'
        const team2Side = team1Side === 'blue' ? 'red' : 'blue'

        const getTeamColorClasses = (side: 'blue' | 'red') => ({
          text: side === 'blue' ? 'text-blue-400' : 'text-red-400',
          bg: side === 'blue' ? 'bg-blue-400/10' : 'bg-red-400/10',
        })

        const team1Colors = getTeamColorClasses(team1Side)
        const team2Colors = getTeamColorClasses(team2Side)

        return (
          <div className="p-4 space-y-4">
            {/* Bans */}
            <div>
              <div className="text-xs text-(--text-muted) mb-2">Bans</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className={`text-xs ${team1Colors.text} mb-1`}>
                    {team1Side === 'blue' ? 'Blue' : 'Red'} Side
                  </div>
                  {bans
                    .filter((b) => b.teamOrder === 'team1')
                    .map((ban) => (
                      <div
                        key={ban.actionOrder}
                        className={`text-xs ${team1Colors.text} ${team1Colors.bg} px-2 py-1 rounded`}
                      >
                        {ban.championName || `Champion ${ban.actionOrder}`}
                      </div>
                    ))}
                </div>
                <div className="space-y-1">
                  <div className={`text-xs ${team2Colors.text} mb-1`}>
                    {team2Side === 'blue' ? 'Blue' : 'Red'} Side
                  </div>
                  {bans
                    .filter((b) => b.teamOrder === 'team2')
                    .map((ban) => (
                      <div
                        key={ban.actionOrder}
                        className={`text-xs ${team2Colors.text} ${team2Colors.bg} px-2 py-1 rounded`}
                      >
                        {ban.championName || `Champion ${ban.actionOrder}`}
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Picks */}
            <div>
              <div className="text-xs text-(--text-muted) mb-2">Picks</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  {picks
                    .filter((p) => p.teamOrder === 'team1')
                    .sort((a, b) => {
                      const roleOrder: Record<string, number> = { Top: 1, Jungle: 2, Mid: 3, ADC: 4, Support: 5 }
                      return (roleOrder[a.role || ''] || 99) - (roleOrder[b.role || ''] || 99)
                    })
                    .map((pick) => (
                      <div
                        key={pick.actionOrder}
                        className={`text-xs ${team1Colors.bg} px-2 py-1 rounded flex justify-between`}
                      >
                        <span className={team1Colors.text}>{pick.championName || '?'}</span>
                        <span className="text-(--text-muted)">{pick.role || '-'}</span>
                      </div>
                    ))}
                </div>
                <div className="space-y-1">
                  {picks
                    .filter((p) => p.teamOrder === 'team2')
                    .sort((a, b) => {
                      const roleOrder: Record<string, number> = { Top: 1, Jungle: 2, Mid: 3, ADC: 4, Support: 5 }
                      return (roleOrder[a.role || ''] || 99) - (roleOrder[b.role || ''] || 99)
                    })
                    .map((pick) => (
                      <div
                        key={pick.actionOrder}
                        className={`text-xs ${team2Colors.bg} px-2 py-1 rounded flex justify-between`}
                      >
                        <span className={team2Colors.text}>{pick.championName || '?'}</span>
                        <span className="text-(--text-muted)">{pick.role || '-'}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <div className="p-4">
          {events.length === 0 ? (
            <div className="text-center text-(--text-muted) py-8">
              No timeline data available for this game
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {events.slice(0, 50).map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 text-xs bg-[var(--bg-secondary)] rounded-lg p-2"
                >
                  <span className="text-sm">{getEventIcon(event.eventType)}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-(--text-muted)">{formatGameTime(event.gameTime)}</span>
                      <span className="text-(--text-primary) capitalize">{event.eventType}</span>
                    </div>
                    {event.actorPlayerName && (
                      <div className="text-(--text-secondary)">
                        {event.actorPlayerName}
                        {event.targetPlayerName && (
                          <span className="text-(--text-muted)"> → {event.targetPlayerName}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {events.length > 50 && (
                <div className="text-center text-(--text-muted) text-xs py-2">
                  + {events.length - 50} more events
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Objectives Tab */}
      {activeTab === 'objectives' && (
        <div className="p-4 space-y-4">
          {/* Objective summary from events */}
          <div className="grid grid-cols-2 gap-4">
            {/* Blue Side */}
            <div>
              <div className="text-xs text-blue-400 font-medium mb-2">Blue Side</div>
              <div className="space-y-2">
                {['tower', 'dragon', 'baron', 'herald', 'inhibitor'].map((objType) => {
                  const count = objectiveEvents.filter(
                    (e) => e.eventType === objType && blueTeam.some((p) => p.playerName === e.actorPlayerName)
                  ).length
                  return (
                    <div key={objType} className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
                      <span className="text-xs text-(--text-secondary) capitalize flex items-center gap-2">
                        <span>{getEventIcon(objType)}</span>
                        {objType}s
                      </span>
                      <span className="font-mono text-blue-400">{count || '-'}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Red Side */}
            <div>
              <div className="text-xs text-red-400 font-medium mb-2">Red Side</div>
              <div className="space-y-2">
                {['tower', 'dragon', 'baron', 'herald', 'inhibitor'].map((objType) => {
                  const count = objectiveEvents.filter(
                    (e) => e.eventType === objType && redTeam.some((p) => p.playerName === e.actorPlayerName)
                  ).length
                  return (
                    <div key={objType} className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
                      <span className="text-xs text-(--text-secondary) capitalize flex items-center gap-2">
                        <span>{getEventIcon(objType)}</span>
                        {objType}s
                      </span>
                      <span className="font-mono text-red-400">{count || '-'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Objective Timeline */}
          {objectiveEvents.length > 0 && (
            <div>
              <div className="text-xs text-(--text-muted) mb-2">Objective Timeline</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {objectiveEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-2 text-xs bg-[var(--bg-secondary)] rounded px-2 py-1"
                  >
                    <span className="font-mono text-(--text-muted) w-10">{formatGameTime(event.gameTime)}</span>
                    <span>{getEventIcon(event.eventType)}</span>
                    <span className="text-(--text-primary) capitalize">{event.eventType}</span>
                    {event.actorPlayerName && (
                      <span className="text-(--text-secondary)">by {event.actorPlayerName}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {objectiveEvents.length === 0 && events.length === 0 && (
            <div className="text-center text-(--text-muted) py-4">
              No objective data available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
