import { CARD_COLORS } from './types'
import type { SocialCardFormat } from './types'

const HANDLE = '@MonsieurYordle'

interface CardHeaderProps {
  title: string
  format: SocialCardFormat
}

function sz(format: SocialCardFormat, twitter: number, insta: number, tiktok: number) {
  return format === 'twitter' ? twitter : format === 'tiktok' ? tiktok : insta
}

export function CardHeader({ title, format }: CardHeaderProps) {
  const height = sz(format, 160, 110, 130)
  const titleSize = sz(format, 40, 26, 32)
  const labelSize = sz(format, 28, 18, 22)
  const handleSize = sz(format, 32, 20, 26)
  const pad = sz(format, 48, 28, 32)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height,
        padding: `0 ${pad}px`,
        backgroundColor: CARD_COLORS.bgHeader,
        borderBottom: `1px solid ${CARD_COLORS.border}`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: labelSize,
          fontWeight: 600,
          color: CARD_COLORS.accent,
          letterSpacing: '0.05em',
          textTransform: 'uppercase' as const,
          whiteSpace: 'nowrap' as const,
          flexShrink: 0,
        }}
      >
        LoL Pro Stats
      </span>

      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: titleSize,
          fontWeight: 700,
          color: CARD_COLORS.text,
          textAlign: 'center',
          flex: 1,
          padding: '0 16px',
        }}
      >
        {title}
      </span>

      <span
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: handleSize,
          fontWeight: 600,
          color: CARD_COLORS.accent,
          flexShrink: 0,
        }}
      >
        {HANDLE}
      </span>
    </div>
  )
}
