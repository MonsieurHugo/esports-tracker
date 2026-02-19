import { CARD_COLORS } from './types'

const MEDAL_COLORS: Record<number, string> = {
  1: CARD_COLORS.gold,
  2: CARD_COLORS.silver,
  3: CARD_COLORS.bronze,
}

export function CardRankBadge({ rank, size = 28 }: { rank: number; size?: number }) {
  const medal = MEDAL_COLORS[rank]
  const fontSize = Math.round(size * 0.5)

  if (medal) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: medal + '20',
          border: `1.5px solid ${medal}60`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize,
            fontWeight: 700,
            color: medal,
            lineHeight: 1,
          }}
        >
          {rank}
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize,
          fontWeight: 600,
          color: CARD_COLORS.textMuted,
          lineHeight: 1,
        }}
      >
        {rank}
      </span>
    </div>
  )
}
