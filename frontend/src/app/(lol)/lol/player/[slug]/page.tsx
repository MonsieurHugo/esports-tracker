'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/lib/api'
import type {
  PlayerProfileData,
  PlayHoursData,
  PlayerDuosData,
  PlayerChampionStats,
  PlayerCompareData,
  DashboardPeriod,
  PlayHourEntry,
  PlayHourMatrix,
  PlayerLeaderboardEntry,
} from '@/lib/types'

import PeriodSelector from '@/components/dashboard/PeriodSelector'
import PeriodNavigator from '@/components/dashboard/PeriodNavigator'
import StatCard from '@/components/dashboard/StatCard'
import { getChampionName, getChampionIconUrl } from '@/lib/champions'
import { getRoleImagePath, getRankImagePath } from '@/lib/utils'

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export default function PlayerProfilePage() {
  const params = useParams()
  const slug = params.slug as string

  // Period state
  const [period, setPeriod] = useState<DashboardPeriod>('day')
  const [refDate, setRefDate] = useState(new Date())
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null)
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null)

  // Data state
  const [profile, setProfile] = useState<PlayerProfileData | null>(null)
  const [playHoursHist, setPlayHoursHist] = useState<PlayHoursData | null>(null)
  const [playHoursHeat, setPlayHoursHeat] = useState<PlayHoursData | null>(null)
  const [duos, setDuos] = useState<PlayerDuosData | null>(null)
  const [champions, setChampions] = useState<PlayerChampionStats | null>(null)
  const [compareData, setCompareData] = useState<PlayerCompareData | null>(null)
  const [compareSlug, setCompareSlug] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PlayerLeaderboardEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Loading states
  const [isLoading, setIsLoading] = useState(true)
  const [playHoursView, setPlayHoursView] = useState<'histogram' | 'heatmap'>('histogram')

  // Navigation helpers
  const canGoNext = refDate < new Date()

  const getRefDateString = () => refDate.toISOString().split('T')[0]

  const navigatePeriod = (direction: 'prev' | 'next') => {
    const newDate = new Date(refDate)
    switch (period) {
      case 'day':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
        break
      case 'year':
        newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 1 : -1))
        break
      case 'custom':
        if (customStartDate && customEndDate) {
          const days = Math.ceil((customEndDate.getTime() - customStartDate.getTime()) / (1000 * 60 * 60 * 24))
          const newStart = new Date(customStartDate)
          const newEnd = new Date(customEndDate)
          if (direction === 'next') {
            newStart.setDate(newStart.getDate() + days + 1)
            newEnd.setDate(newEnd.getDate() + days + 1)
          } else {
            newStart.setDate(newStart.getDate() - days - 1)
            newEnd.setDate(newEnd.getDate() - days - 1)
          }
          setCustomStartDate(newStart)
          setCustomEndDate(newEnd)
        }
        return
    }
    setRefDate(newDate)
  }

  const getPeriodLabel = () => {
    if (period === 'custom' && customStartDate && customEndDate) {
      const format = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      return `${format(customStartDate)} - ${format(customEndDate)}`
    }
    switch (period) {
      case 'day':
        return '7 derniers jours'
      case 'month':
        return refDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      case 'year':
        return refDate.getFullYear().toString()
      default:
        return ''
    }
  }

  // Fetch profile data
  const fetchProfileData = useCallback(async () => {
    setIsLoading(true)
    try {
      const baseParams: Record<string, string | undefined> = {
        period,
        date: getRefDateString(),
      }
      if (period === 'custom' && customStartDate && customEndDate) {
        baseParams.startDate = customStartDate.toISOString().split('T')[0]
        baseParams.endDate = customEndDate.toISOString().split('T')[0]
      }

      const [profileRes, playHoursHistRes, playHoursHeatRes, duosRes, championsRes] = await Promise.all([
        api.get<PlayerProfileData>(`/players/${slug}/profile`, { params: baseParams }),
        api.get<PlayHoursData>(`/players/${slug}/play-hours`, { params: { ...baseParams, groupBy: 'hour' } }),
        api.get<PlayHoursData>(`/players/${slug}/play-hours`, { params: { ...baseParams, groupBy: 'weekday-hour' } }),
        api.get<PlayerDuosData>(`/players/${slug}/duos`, { params: { limit: 10 } }),
        api.get<PlayerChampionStats>(`/players/${slug}/champions`, { params: { limit: 10 } }),
      ])

      setProfile(profileRes)
      // Store both histogram and heatmap data
      setPlayHoursHist(playHoursHistRes)
      setPlayHoursHeat(playHoursHeatRes)
      setDuos(duosRes)
      setChampions(championsRes)
    } catch {
      // Silent fail - UI will show "not found" state
    } finally {
      setIsLoading(false)
    }
  }, [slug, period, refDate, customStartDate, customEndDate])

  useEffect(() => {
    fetchProfileData()
  }, [fetchProfileData])

  // Search for comparison player
  const searchPlayers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    try {
      const res = await api.get<{ data: PlayerLeaderboardEntry[] }>('/lol/dashboard/players', {
        params: { search: query, perPage: 5 },
      })
      setSearchResults(res.data.filter(p => p.player.slug !== slug))
    } catch {
      // Silent fail - search results will remain empty
    } finally {
      setIsSearching(false)
    }
  }, [slug])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchPlayers(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchPlayers])

  // Fetch comparison data
  useEffect(() => {
    if (!compareSlug) {
      setCompareData(null)
      return
    }
    const fetchCompare = async () => {
      const baseParams: Record<string, string | undefined> = {
        period,
        date: getRefDateString(),
      }
      if (period === 'custom' && customStartDate && customEndDate) {
        baseParams.startDate = customStartDate.toISOString().split('T')[0]
        baseParams.endDate = customEndDate.toISOString().split('T')[0]
      }
      const res = await api.get<PlayerCompareData>(`/players/${slug}/compare/${compareSlug}`, { params: baseParams })
      setCompareData(res)
    }
    fetchCompare()
  }, [compareSlug, slug, period, refDate, customStartDate, customEndDate])

  if (isLoading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-(--text-muted)">Chargement...</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-(--text-muted)">Joueur non trouvé</div>
      </div>
    )
  }

  const maxGames = playHoursHist?.data
    ? Math.max(...(playHoursHist.data as PlayHourEntry[]).map(d => d.games), 1)
    : 1

  const heatmapMax = playHoursHeat?.data
    ? Math.max(...(playHoursHeat.data as PlayHourMatrix).flat().map(d => d.games), 1)
    : 1

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/lol" className="text-(--text-muted) hover:text-(--text-primary) transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold">Profil Joueur</h1>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <PeriodSelector
          value={period}
          onChange={(p) => {
            setPeriod(p)
            if (p !== 'custom') {
              setCustomStartDate(null)
              setCustomEndDate(null)
            }
          }}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onCustomDateChange={(start, end) => {
            setPeriod('custom')
            setCustomStartDate(start)
            setCustomEndDate(end)
          }}
        />
        <PeriodNavigator
          label={getPeriodLabel()}
          onPrevious={() => navigatePeriod('prev')}
          onNext={() => navigatePeriod('next')}
          canGoNext={canGoNext}
        />
      </div>

      {/* Profile Header */}
      <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4 md:p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Player Info */}
          <div className="flex items-center gap-4 flex-1">
            {profile.player.team && (
              <Image
                src={`/images/teams/${profile.player.team.slug}.png`}
                alt={profile.player.team.shortName}
                width={48}
                height={48}
                className="w-12 h-12 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <div>
              <h2 className="text-2xl font-bold">{profile.player.pseudo}</h2>
              <div className="flex items-center gap-2 text-sm text-(--text-muted)">
                {profile.player.team && (
                  <span>{profile.player.team.shortName}</span>
                )}
                {profile.player.role && (
                  <Image
                    src={getRoleImagePath(profile.player.role)}
                    alt={profile.player.role}
                    width={16}
                    height={16}
                    className="w-4 h-4"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Rank Display */}
          {profile.rank && (
            <div className="flex items-center gap-3 bg-(--bg-secondary) rounded-lg px-4 py-3">
              <Image
                src={getRankImagePath(profile.rank.tier) || ''}
                alt={profile.rank.tier}
                width={48}
                height={48}
                className="w-12 h-12"
              />
              <div>
                <div className="font-bold text-lg">
                  {profile.rank.tier} {profile.rank.rank !== 'I' ? profile.rank.rank : ''}
                </div>
                <div className="text-sm text-(--text-muted)">
                  {profile.totalLp.toLocaleString()} LP
                </div>
              </div>
            </div>
          )}

          {/* Rankings */}
          {profile.ranking && (
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-(--accent)">
                  #{profile.ranking.global.rank}
                </div>
                <div className="text-xs text-(--text-muted)">
                  Global ({profile.ranking.global.total})
                </div>
              </div>
              {profile.ranking.league && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-(--lol)">
                    #{profile.ranking.league.rank}
                  </div>
                  <div className="text-xs text-(--text-muted)">
                    {profile.player.team?.region} ({profile.ranking.league.total})
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {profile.stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Games"
            value={profile.stats.games}
            change={profile.stats.gamesChange}
            changeUnit=""
          />
          <StatCard
            label="Winrate"
            value={`${profile.stats.winrate}%`}
            change={profile.stats.winrateChange}
          />
          <StatCard
            label="KDA"
            value={`${profile.stats.avgKills}/${profile.stats.avgDeaths}/${profile.stats.avgAssists}`}
          />
          <StatCard
            label="Temps de jeu"
            value={formatDuration(profile.stats.totalDuration)}
          />
        </div>
      )}

      {/* Compare Section */}
      <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4 mb-6">
        <h3 className="font-semibold mb-3">Comparer avec un joueur</h3>
        <div className="relative">
          <input
            type="text"
            placeholder="Rechercher un joueur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-(--bg-secondary) border border-(--border) rounded-lg text-sm focus:outline-hidden focus:border-(--accent)"
          />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-(--bg-card) border border-(--border) rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
              {searchResults.map((p) => (
                <button
                  key={p.player.playerId}
                  onClick={() => {
                    setCompareSlug(p.player.slug)
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-(--bg-hover) flex items-center gap-2"
                >
                  <span className="font-medium">{p.player.pseudo}</span>
                  {p.team && <span className="text-xs text-(--text-muted)">{p.team.shortName}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {compareSlug && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-(--text-muted)">Comparaison avec:</span>
            <span className="font-medium">{compareData?.players[1]?.pseudo}</span>
            <button
              onClick={() => setCompareSlug('')}
              className="text-(--text-muted) hover:text-(--negative)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Play Hours Section */}
      <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Heures de jeu</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setPlayHoursView('histogram')}
              className={`px-3 py-1 text-xs rounded-sm ${playHoursView === 'histogram' ? 'bg-(--accent) text-white' : 'bg-(--bg-secondary) text-(--text-muted)'}`}
            >
              Histogramme
            </button>
            <button
              onClick={() => setPlayHoursView('heatmap')}
              className={`px-3 py-1 text-xs rounded-sm ${playHoursView === 'heatmap' ? 'bg-(--accent) text-white' : 'bg-(--bg-secondary) text-(--text-muted)'}`}
            >
              Heatmap
            </button>
          </div>
        </div>

        {playHoursHist && playHoursView === 'histogram' && (
          <div className="h-48 flex items-end gap-1">
            {(playHoursHist.data as PlayHourEntry[]).map((d) => {
              const height = (d.games / maxGames) * 100
              const compareHeight = compareData?.players[1]?.playHours[d.hour]?.games
                ? (compareData.players[1].playHours[d.hour].games / maxGames) * 100
                : 0
              return (
                <div key={d.hour} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-0.5" style={{ height: '140px' }}>
                    <div
                      className="flex-1 bg-(--accent) rounded-t transition-all"
                      style={{ height: `${height}%` }}
                      title={`${d.hour}h: ${d.games} games (${d.winrate}% WR)`}
                    />
                    {compareData && (
                      <div
                        className="flex-1 bg-(--lol) rounded-t transition-all opacity-70"
                        style={{ height: `${compareHeight}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-(--text-muted)">{d.hour}</span>
                </div>
              )
            })}
          </div>
        )}

        {playHoursHeat && playHoursView === 'heatmap' && (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="flex gap-1 mb-2 pl-10">
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} className="flex-1 text-center text-[9px] text-(--text-muted)">
                    {i}
                  </div>
                ))}
              </div>
              {(playHoursHeat.data as PlayHourMatrix).map((row, dow) => (
                <div key={dow} className="flex gap-1 mb-1">
                  <div className="w-10 text-[10px] text-(--text-muted) flex items-center">
                    {DAY_NAMES[dow]}
                  </div>
                  {row.map((cell) => {
                    const intensity = cell.games / heatmapMax
                    return (
                      <div
                        key={cell.hour}
                        className="flex-1 h-6 rounded-xs transition-colors"
                        style={{
                          backgroundColor: cell.games > 0
                            ? `rgba(var(--accent-rgb), ${0.2 + intensity * 0.8})`
                            : 'var(--bg-secondary)',
                        }}
                        title={`${DAY_NAMES[dow]} ${cell.hour}h: ${cell.games} games (${cell.winrate}% WR)`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Champions Section */}
      {champions && champions.stats.length > 0 && (
        <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-4">Champions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-(--text-muted) text-xs uppercase">
                  <th className="text-left py-2">Champion</th>
                  <th className="text-right py-2">Games</th>
                  <th className="text-right py-2">WR</th>
                  <th className="text-right py-2">KDA</th>
                  <th className="text-right py-2 hidden md:table-cell">CS</th>
                </tr>
              </thead>
              <tbody>
                {champions.stats.map((c) => (
                  <tr key={c.championId} className="border-t border-(--border)">
                    <td className="py-2 flex items-center gap-2">
                      <Image
                        src={getChampionIconUrl(c.championId)}
                        alt={getChampionName(c.championId)}
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-sm"
                        unoptimized
                      />
                      <span className="font-medium">{getChampionName(c.championId)}</span>
                    </td>
                    <td className="text-right py-2 font-mono">{c.games}</td>
                    <td className={`text-right py-2 font-mono ${c.winrate >= 50 ? 'text-(--positive)' : 'text-(--negative)'}`}>
                      {c.winrate}%
                    </td>
                    <td className="text-right py-2 font-mono">
                      {c.avgKills}/{c.avgDeaths}/{c.avgAssists}
                    </td>
                    <td className="text-right py-2 font-mono hidden md:table-cell">{c.avgCs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Duos Section */}
      {duos && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {/* Best Duos */}
          <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
            <h3 className="font-semibold mb-3 text-(--positive)">Meilleurs Duos</h3>
            <div className="space-y-2">
              {duos.duos.slice(0, 5).map((d, i) => (
                <div key={d.puuid} className="flex items-center gap-2 text-sm">
                  <span className="text-(--text-muted) w-4">{i + 1}.</span>
                  {d.player ? (
                    <Link href={`/lol/player/${d.player.slug}`} className="font-medium hover:text-(--accent)">
                      {d.player.pseudo}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.gameName}</span>
                  )}
                  <span className="text-(--text-muted) ml-auto">{d.games}G</span>
                  <span className="text-(--positive)">{d.winrate}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Win Against */}
          <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
            <h3 className="font-semibold mb-3 text-(--positive)">Gagne contre</h3>
            <div className="space-y-2">
              {duos.winAgainst.slice(0, 5).map((d, i) => (
                <div key={d.puuid} className="flex items-center gap-2 text-sm">
                  <span className="text-(--text-muted) w-4">{i + 1}.</span>
                  {d.player ? (
                    <Link href={`/lol/player/${d.player.slug}`} className="font-medium hover:text-(--accent)">
                      {d.player.pseudo}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.gameName}</span>
                  )}
                  <span className="text-(--text-muted) ml-auto">{d.wins}W</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lose Against */}
          <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
            <h3 className="font-semibold mb-3 text-(--negative)">Perd contre</h3>
            <div className="space-y-2">
              {duos.loseAgainst.slice(0, 5).map((d, i) => (
                <div key={d.puuid} className="flex items-center gap-2 text-sm">
                  <span className="text-(--text-muted) w-4">{i + 1}.</span>
                  {d.player ? (
                    <Link href={`/lol/player/${d.player.slug}`} className="font-medium hover:text-(--accent)">
                      {d.player.pseudo}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.gameName}</span>
                  )}
                  <span className="text-(--text-muted) ml-auto">{d.losses || 0}L</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
