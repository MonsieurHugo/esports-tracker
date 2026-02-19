import type { ProBoRecord } from '@/lib/types'
import { CardRankBadge } from '../CardRankBadge'
import { CardTeamIcon } from '../CardTeamIcon'
import { fmtSeconds } from '../utils'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface BoRecordCardProps {
  records: ProBoRecord[]
  format: SocialCardFormat
}

export function BoRecordCard({ records, format }: BoRecordCardProps) {
  const isInsta = format === 'instagram'
  const rowHeight = isInsta ? 72 : 48
  const fontSize = isInsta ? 14 : 12
  const iconSize = isInsta ? 24 : 20
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
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: isInsta ? 80 : 65, textAlign: 'center' }}>Duree</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flex: 1 }}>Equipes</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: 50, textAlign: 'center' }}>Games</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: 60, textAlign: 'right' }}>Date</span>
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

            {/* Duration */}
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize,
                fontWeight: 700,
                color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                width: isInsta ? 80 : 65,
                textAlign: 'center',
              }}
            >
              {fmtSeconds(r.value)}
            </span>

            {/* Teams */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flex: 1,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {r.team1Name && <CardTeamIcon name={r.team1Name} fullName={r.team1FullName} size={iconSize} />}
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: fontSize - 1, fontWeight: 600, color: CARD_COLORS.text }}>{r.team1Name || ''}</span>
              </div>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: CARD_COLORS.textMuted }}>vs</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {r.team2Name && <CardTeamIcon name={r.team2Name} fullName={r.team2FullName} size={iconSize} />}
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: fontSize - 1, fontWeight: 600, color: CARD_COLORS.text }}>{r.team2Name || ''}</span>
              </div>
            </div>

            {/* Games played */}
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: fontSize - 1,
                color: CARD_COLORS.textMuted,
                width: 50,
                textAlign: 'center',
              }}
            >
              {r.gamesPlayed}
            </span>

            {/* Date */}
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: fontSize - 2,
                color: CARD_COLORS.textMuted,
                textAlign: 'right',
                width: 60,
              }}
            >
              {r.gameDate
                ? new Date(r.gameDate).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                  })
                : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
