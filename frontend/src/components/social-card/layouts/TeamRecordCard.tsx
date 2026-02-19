import type { ProTeamRecord } from '@/lib/types'
import { CardRankBadge } from '../CardRankBadge'
import { CardTeamIcon } from '../CardTeamIcon'
import { fmtSeconds } from '../utils'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface TeamRecordCardProps {
  records: ProTeamRecord[]
  formatValue?: (r: ProTeamRecord) => string
  format: SocialCardFormat
  winnerLabel?: string
  loserLabel?: string
}

export function TeamRecordCard({ records, formatValue, format, winnerLabel, loserLabel }: TeamRecordCardProps) {
  const isInsta = format === 'instagram'
  const rowHeight = isInsta ? 72 : 48
  const fontSize = isInsta ? 14 : 12
  const iconSize = isInsta ? 28 : 22
  const top10 = records.slice(0, 10)
  const renderValue = formatValue ?? ((r: ProTeamRecord) => fmtSeconds(r.value))

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
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: isInsta ? 90 : 70, textAlign: 'center' }}>Valeur</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flex: 1 }}>{winnerLabel || 'Vainqueur'}</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flex: 1 }}>{loserLabel || 'Perdant'}</span>
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

            {/* Value */}
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize,
                fontWeight: 700,
                color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                width: isInsta ? 90 : 70,
                textAlign: 'center',
              }}
            >
              {renderValue(r)}
            </span>

            {/* Winner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flex: 1,
                overflow: 'hidden',
              }}
            >
              {r.winnerName && <CardTeamIcon name={r.winnerName} fullName={r.winnerFullName} size={iconSize} />}
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize,
                  fontWeight: 600,
                  color: CARD_COLORS.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.winnerName || '\u2014'}
              </span>
            </div>

            {/* Loser */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flex: 1,
                overflow: 'hidden',
              }}
            >
              {r.loserName && <CardTeamIcon name={r.loserName} fullName={r.loserFullName} size={iconSize} />}
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: fontSize - 1,
                  color: CARD_COLORS.textSecondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.loserName || '\u2014'}
              </span>
            </div>

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
