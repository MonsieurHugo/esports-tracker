import type { ProTournamentKillsRecord } from '@/lib/types'
import { CardRowList } from '../CardRowList'
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

  const header = (
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
  )

  return (
    <CardRowList<ProTournamentKillsRecord>
      records={records}
      rowPadH={24}
      rowGap={12}
      rowHeight={rowHeight}
      header={header}
      renderRow={(r, _i, isFirst) => (
        <>
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
        </>
      )}
    />
  )
}
