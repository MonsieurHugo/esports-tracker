import type { ProTeamRecord } from '@/lib/types'
import { getChampionIconUrl, getChampionName } from '@/lib/champions'
import { CardTeamIcon } from '../CardTeamIcon'
import { CardRowList } from '../CardRowList'
import { sz, fmtSeconds } from '../utils'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface TeamRecordCardProps {
  records: ProTeamRecord[]
  formatValue?: (r: ProTeamRecord) => string
  format: SocialCardFormat
  winnerLabel?: string
  loserLabel?: string
}

const SIDE_COLORS = {
  blue: '#3b82f6',
  red: '#ef4444',
}

function SideBar({ side, height, width, format }: { side: 'blue' | 'red'; height: number; width: number; format: SocialCardFormat }) {
  const radius = sz(format, 3, 2, 2)
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: SIDE_COLORS[side],
        flexShrink: 0,
        opacity: 0.85,
      }}
    />
  )
}

function ChampIcons({
  comp,
  size,
  format,
  side,
  reverse,
}: {
  comp: number[]
  size: number
  format: SocialCardFormat
  side?: 'blue' | 'red' | null
  reverse?: boolean
}) {
  const gap = sz(format, 3, 2, 2)
  const barWidth = sz(format, 5, 3, 4)
  const barHeight = size
  if (comp.length === 0 && !side) return null

  const icons = comp.map((id, i) => (
    <img
      key={i}
      src={getChampionIconUrl(id)}
      alt={getChampionName(id)}
      width={size}
      height={size}
      style={{ borderRadius: size * 0.2, objectFit: 'cover' }}
    />
  ))

  const bar = side && comp.length > 0 ? <SideBar side={side} height={barHeight} width={barWidth} format={format} /> : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, flexShrink: 0 }}>
      {reverse ? (
        <>
          {bar}
          {icons}
        </>
      ) : (
        <>
          {icons}
          {bar}
        </>
      )}
    </div>
  )
}

export function TeamRecordCard({ records, formatValue, format, winnerLabel, loserLabel }: TeamRecordCardProps) {
  const badgeSize    = sz(format, 56, 34, 42)
  const iconSize     = sz(format, 68, 44, 54)
  const champSize    = sz(format, 64, 42, 50)
  const valueSize    = sz(format, 46, 28, 34)
  const dateSize     = sz(format, 22, 14, 17)
  const rowPadH      = sz(format, 16, 10, 12)
  const rowGap       = sz(format, 8, 5, 6)
  const vsSize       = sz(format, 22, 14, 17)
  const teamGap      = sz(format, 4, 2, 3)

  const renderValue = formatValue ?? ((r: ProTeamRecord) => fmtSeconds(r.value))

  return (
    <CardRowList<ProTeamRecord>
      records={records}
      rowPadH={rowPadH}
      rowGap={rowGap}
      badgeSize={badgeSize}
      renderRow={(r, _i, isFirst) => {
        const winnerComp = r.winnerComp ?? []
        const loserComp = r.loserComp ?? []
        const winnerSide = r.winnerSide ?? null
        const loserSide = winnerSide === 'blue' ? 'red' : winnerSide === 'red' ? 'blue' : null

        return (
          <>
            {/* Value */}
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: valueSize,
                fontWeight: 700,
                color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                flexShrink: 0,
              }}
            >
              {renderValue(r)}
            </span>

            {/* Winner comp + logo */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: teamGap,
                flex: 1,
                justifyContent: 'flex-end',
                overflow: 'hidden',
              }}
            >
              <ChampIcons comp={winnerComp} size={champSize} format={format} side={winnerSide} reverse />
              <div style={{ width: iconSize, height: iconSize, flexShrink: 0 }}>
                {r.winnerName && <CardTeamIcon name={r.winnerName} fullName={r.winnerFullName} size={iconSize} />}
              </div>
            </div>

            {/* VS + date stacked */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: vsSize,
                  fontWeight: 700,
                  color: CARD_COLORS.textMuted,
                  lineHeight: 1.2,
                }}
              >
                vs
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: dateSize,
                  color: CARD_COLORS.textMuted,
                  lineHeight: 1.1,
                  marginTop: sz(format, 4, 2, 3),
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

            {/* Loser logo + comp */}
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
                {r.loserName && <CardTeamIcon name={r.loserName} fullName={r.loserFullName} size={iconSize} />}
              </div>
              <ChampIcons comp={loserComp} size={champSize} format={format} side={loserSide} />
            </div>
          </>
        )
      }}
    />
  )
}
