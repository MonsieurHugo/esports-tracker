import type { ProStreakRecord } from '@/lib/types'
import { CardRankBadge } from '../CardRankBadge'
import { CardTeamIcon } from '../CardTeamIcon'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface StreakRecordCardProps {
  records: ProStreakRecord[]
  format: SocialCardFormat
  unit?: string
}

export function StreakRecordCard({ records, format, unit = 'games' }: StreakRecordCardProps) {
  const isInsta = format === 'instagram'
  const rowHeight = isInsta ? 72 : 48
  const fontSize = isInsta ? 14 : 12
  const iconSize = isInsta ? 28 : 22
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
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: isInsta ? 100 : 80, textAlign: 'center' }}>Serie</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flex: 1 }}>Equipe</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: 60, textAlign: 'right' }}>Fin</span>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 4,
                width: isInsta ? 100 : 80,
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: fontSize + 2,
                  fontWeight: 700,
                  color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                }}
              >
                {r.value}
              </span>
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: fontSize - 2,
                  color: CARD_COLORS.textMuted,
                }}
              >
                {unit}
              </span>
            </div>

            {/* Team */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flex: 1,
                overflow: 'hidden',
              }}
            >
              {r.teamName && <CardTeamIcon name={r.teamName} size={iconSize} />}
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
                {r.teamName}
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
              {r.streakEnd
                ? new Date(r.streakEnd).toLocaleDateString('fr-FR', {
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
