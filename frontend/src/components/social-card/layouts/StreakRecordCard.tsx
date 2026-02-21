import type { ProStreakRecord } from '@/lib/types'
import { CardTeamIcon } from '../CardTeamIcon'
import { CardRowList } from '../CardRowList'
import { sz } from '../utils'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface StreakRecordCardProps {
  records: ProStreakRecord[]
  format: SocialCardFormat
  unit?: string
}

export function StreakRecordCard({ records, format, unit = 'games' }: StreakRecordCardProps) {
  const badgeSize    = sz(format, 56, 34, 42)
  const iconSize     = sz(format, 48, 32, 38)
  const nameSize     = sz(format, 36, 24, 28)
  const valueSize    = sz(format, 64, 40, 48)
  const unitSize     = sz(format, 28, 18, 22)
  const dateSize     = sz(format, 24, 16, 19)
  const rowPadH      = sz(format, 24, 14, 16)
  const rowGap       = sz(format, 14, 8, 10)
  const valueWidth   = sz(format, 180, 110, 140)
  const dateWidth    = sz(format, 120, 80, 95)
  const headerSize   = sz(format, 20, 13, 15)
  const headerHeight = sz(format, 52, 32, 40)
  const teamGap      = sz(format, 10, 6, 8)

  const header = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: headerHeight,
        flexShrink: 0,
        padding: `0 ${rowPadH}px`,
        backgroundColor: CARD_COLORS.bgRowAlt,
        borderBottom: `1px solid ${CARD_COLORS.border}`,
        gap: rowGap,
      }}
    >
      <div style={{ width: badgeSize }} />
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: headerSize, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: valueWidth, textAlign: 'center' }}>Serie</span>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: headerSize, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flex: 1 }}>Equipe</span>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: headerSize, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: dateWidth, textAlign: 'right' }}>Fin</span>
    </div>
  )

  return (
    <CardRowList<ProStreakRecord>
      records={records}
      rowPadH={rowPadH}
      rowGap={rowGap}
      badgeSize={badgeSize}
      header={header}
      renderRow={(r, _i, isFirst) => (
        <>
          {/* Value */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 4,
              width: valueWidth,
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: valueSize,
                fontWeight: 700,
                color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
              }}
            >
              {r.value}
            </span>
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: unitSize,
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
              gap: teamGap,
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <div style={{ width: iconSize, height: iconSize, flexShrink: 0 }}>
              {r.teamName && <CardTeamIcon name={r.teamName} size={iconSize} />}
            </div>
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: nameSize,
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
              fontSize: dateSize,
              color: CARD_COLORS.textMuted,
              textAlign: 'right',
              width: dateWidth,
              flexShrink: 0,
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
        </>
      )}
    />
  )
}
