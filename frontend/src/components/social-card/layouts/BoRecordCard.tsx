import type { ProBoRecord } from '@/lib/types'
import { CardTeamIcon } from '../CardTeamIcon'
import { CardRowList } from '../CardRowList'
import { sz, fmtSeconds } from '../utils'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface BoRecordCardProps {
  records: ProBoRecord[]
  format: SocialCardFormat
}

export function BoRecordCard({ records, format }: BoRecordCardProps) {
  const badgeSize    = sz(format, 56, 34, 42)
  const iconSize     = sz(format, 44, 28, 34)
  const nameSize     = sz(format, 32, 21, 25)
  const valueSize    = sz(format, 56, 36, 42)
  const dateSize     = sz(format, 24, 16, 19)
  const gamesSize    = sz(format, 36, 24, 28)
  const vsSize       = sz(format, 24, 16, 19)
  const rowPadH      = sz(format, 24, 14, 16)
  const rowGap       = sz(format, 14, 8, 10)
  const valueWidth   = sz(format, 160, 100, 125)
  const gamesWidth   = sz(format, 100, 65, 80)
  const dateWidth    = sz(format, 120, 80, 95)
  const headerSize   = sz(format, 20, 13, 15)
  const headerHeight = sz(format, 52, 32, 40)
  const teamGap      = sz(format, 8, 5, 6)

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
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: headerSize, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: valueWidth, textAlign: 'center' }}>Duree</span>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: headerSize, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flex: 1 }}>Equipes</span>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: headerSize, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: gamesWidth, textAlign: 'center' }}>Games</span>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: headerSize, color: CARD_COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', width: dateWidth, textAlign: 'right' }}>Date</span>
    </div>
  )

  return (
    <CardRowList<ProBoRecord>
      records={records}
      rowPadH={rowPadH}
      rowGap={rowGap}
      badgeSize={badgeSize}
      header={header}
      renderRow={(r, _i, isFirst) => (
        <>
          {/* Duration */}
          <span
            style={{
              display: 'inline-block',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: valueSize,
              fontWeight: 700,
              color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
              width: valueWidth,
              textAlign: 'center',
              flexShrink: 0,
            }}
          >
            {fmtSeconds(r.value)}
          </span>

          {/* Teams */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: teamGap,
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: teamGap }}>
              <div style={{ width: iconSize, height: iconSize, flexShrink: 0 }}>
                {r.team1Name && <CardTeamIcon name={r.team1Name} fullName={r.team1FullName} size={iconSize} />}
              </div>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: nameSize, fontWeight: 600, color: CARD_COLORS.text }}>{r.team1Name || ''}</span>
            </div>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: vsSize, color: CARD_COLORS.textMuted }}>vs</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: teamGap }}>
              <div style={{ width: iconSize, height: iconSize, flexShrink: 0 }}>
                {r.team2Name && <CardTeamIcon name={r.team2Name} fullName={r.team2FullName} size={iconSize} />}
              </div>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: nameSize, fontWeight: 600, color: CARD_COLORS.text }}>{r.team2Name || ''}</span>
            </div>
          </div>

          {/* Games played */}
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: gamesSize,
              color: CARD_COLORS.textMuted,
              width: gamesWidth,
              textAlign: 'center',
              flexShrink: 0,
            }}
          >
            {r.gamesPlayed}
          </span>

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
            {r.gameDate
              ? new Date(r.gameDate).toLocaleDateString('fr-FR', {
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
