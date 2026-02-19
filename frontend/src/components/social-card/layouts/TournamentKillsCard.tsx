import type { ProTournamentKillsRecord } from '@/lib/types'
import { CardRankBadge } from '../CardRankBadge'
import { shortenTournament } from '../utils'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface TournamentKillsCardProps {
  records: ProTournamentKillsRecord[]
  format: SocialCardFormat
}

export function TournamentKillsCard({ records, format }: TournamentKillsCardProps) {
  const isInsta = format === 'instagram'
  const rowHeight = isInsta ? 72 : 48
  const fontSize = isInsta ? 14 : 12
  const top10 = records.slice(0, 10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Column headers */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: isInsta ? 36 : 28,
          padding: '0 24px',
          backgroundColor: CARD_COLORS.bgRowAlt,
          borderBottom: `1px solid ${CARD_COLORS.border}`,
          gap: 12,
        }}
      >
        <div style={{ width: 24 }} />
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flex: 1 }}>Tournoi</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: 100, textAlign: 'right' }}>Avg Kills/Game</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: 60, textAlign: 'right' }}>Games</span>
      </div>

      {top10.map((r, i) => {
        const isFirst = i === 0
        const bgColor = isFirst
          ? CARD_COLORS.accent + '14'
          : i % 2 === 0
            ? CARD_COLORS.bgRow
            : CARD_COLORS.bgRowAlt

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: rowHeight,
              padding: '0 24px',
              backgroundColor: bgColor,
              borderBottom: i < top10.length - 1 ? `1px solid ${CARD_COLORS.border}40` : 'none',
              gap: 12,
            }}
          >
            <CardRankBadge rank={i + 1} />

            {/* Tournament name */}
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize,
                fontWeight: 600,
                color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={r.tournamentName}
            >
              {shortenTournament(r.tournamentName)}
            </span>

            {/* Avg kills */}
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize,
                fontWeight: 700,
                color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                width: 100,
                textAlign: 'right',
              }}
            >
              {r.avgKillsPerGame.toFixed(1)}
            </span>

            {/* Total games */}
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: fontSize - 1,
                color: CARD_COLORS.textMuted,
                width: 60,
                textAlign: 'right',
              }}
            >
              {r.totalGames}
            </span>
          </div>
        )
      })}
    </div>
  )
}
