import { CARD_COLORS } from './types'
import type { SocialCardFormat, FilterSummary } from './types'

const HANDLE = '@MonsieurYordle'

interface CardFooterProps {
  filters: FilterSummary
  format: SocialCardFormat
}

function sz(format: SocialCardFormat, twitter: number, insta: number, tiktok: number) {
  return format === 'twitter' ? twitter : format === 'tiktok' ? tiktok : insta
}

export function CardFooter({ filters, format }: CardFooterProps) {
  const height = sz(format, 110, 70, 90)
  const tagSize = sz(format, 21, 13, 17)
  const handleSize = sz(format, 32, 20, 26)
  const pad = sz(format, 48, 28, 32)
  const tagGap = sz(format, 16, 10, 12)
  const tagPadV = sz(format, 7, 4, 5)
  const tagPadH = sz(format, 18, 10, 14)

  const tags: string[] = []
  for (const league of filters.leagues) tags.push(league)
  for (const team of filters.teams) tags.push(team)
  for (const year of filters.years) tags.push(String(year))
  if (filters.role) tags.push(filters.role)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height,
        padding: `0 ${pad}px`,
        backgroundColor: CARD_COLORS.bgHeader,
        borderTop: `1px solid ${CARD_COLORS.border}`,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: tagGap, alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: tagSize,
                fontWeight: 600,
                color: CARD_COLORS.accent,
                backgroundColor: CARD_COLORS.accent + '15',
                border: `1px solid ${CARD_COLORS.accent}30`,
                borderRadius: 4,
                padding: `${tagPadV}px ${tagPadH}px`,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.03em',
              }}
            >
              {tag}
            </span>
          ))
        ) : (
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: tagSize,
              color: CARD_COLORS.textMuted,
            }}
          >
            All leagues
          </span>
        )}
      </div>

      <span
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: handleSize,
          fontWeight: 600,
          color: CARD_COLORS.accent,
        }}
      >
        {HANDLE}
      </span>
    </div>
  )
}
