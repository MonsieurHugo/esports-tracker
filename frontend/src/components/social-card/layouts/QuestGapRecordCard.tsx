import type { ProQuestGapRecord } from '@/lib/types'
import { getChampionName, getChampionIconUrl } from '@/lib/champions'
import { getRoleImagePath } from '@/lib/utils'
import { CardTeamIcon } from '../CardTeamIcon'
import { CardRowList } from '../CardRowList'
import { sz } from '../utils'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface QuestGapRecordCardProps {
  records: ProQuestGapRecord[]
  formatValue: (r: ProQuestGapRecord) => string
  format: SocialCardFormat
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function QuestGapRecordCard({ records, formatValue, format }: QuestGapRecordCardProps) {
  const nameSize       = sz(format, 32, 21, 25)
  const valueSize      = sz(format, 56, 36, 42)
  const timeSize       = sz(format, 24, 16, 19)
  const champSize      = sz(format, 56, 36, 42)
  const roleSize       = sz(format, 44, 28, 34)
  const teamLogoSize   = sz(format, 44, 28, 34)
  const badgeSize      = sz(format, 56, 34, 42)
  const rowPadR        = sz(format, 24, 14, 16)
  const rowPadL        = sz(format, 20, 12, 14)
  const rowGap         = sz(format, 12, 7, 9)
  const valueWidth     = sz(format, 160, 100, 125)
  const matchColWidth  = sz(format, 140, 90, 110)
  const vsDateFontSize = sz(format, 24, 16, 19)
  const borderW        = sz(format, 8, 5, 6)

  return (
    <CardRowList<ProQuestGapRecord>
      records={records}
      rowPadH={rowPadR}
      rowPadL={rowPadL}
      rowGap={rowGap}
      badgeSize={badgeSize}
      leftBorder={(r) => r.fastWin != null ? `${borderW}px solid ${r.fastWin ? '#00dc82' : '#ff4757'}60` : undefined}
      renderRow={(r, _i, isFirst) => (
        <>
          {/* Gap value */}
          <span
            style={{
              display: 'inline-block',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: valueSize,
              fontWeight: 700,
              color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
              textAlign: 'center',
              width: valueWidth,
              flexShrink: 0,
            }}
          >
            {formatValue(r)}
          </span>

          {/* Role icon */}
          <div style={{ width: roleSize, height: roleSize, flexShrink: 0 }}>
            {r.role ? (
              <img
                src={getRoleImagePath(r.role)}
                alt={r.role}
                width={roleSize}
                height={roleSize}
                style={{ objectFit: 'contain', opacity: 0.75 }}
              />
            ) : (
              <div style={{ width: roleSize, height: roleSize }} />
            )}
          </div>

          {/* Fast player: champ + name + time */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: rowGap, minWidth: 0 }}>
            <div style={{ width: champSize, height: champSize, flexShrink: 0 }}>
              {r.fastChampionId != null && r.fastChampionId !== 0 ? (
                <img
                  src={getChampionIconUrl(r.fastChampionId)}
                  alt={getChampionName(r.fastChampionId)}
                  width={champSize}
                  height={champSize}
                  style={{ borderRadius: 6, objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: champSize, height: champSize, borderRadius: 6, backgroundColor: CARD_COLORS.border }} />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: nameSize,
                fontWeight: 700,
                color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {r.fastPlayerName}
              </span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: timeSize, color: CARD_COLORS.accent }}>
                {fmtTime(r.fastQuestTime)}
              </span>
            </div>
          </div>

          {/* Slow player: champ + name + time */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: rowGap, minWidth: 0 }}>
            <div style={{ width: champSize, height: champSize, flexShrink: 0 }}>
              {r.slowChampionId != null && r.slowChampionId !== 0 ? (
                <img
                  src={getChampionIconUrl(r.slowChampionId)}
                  alt={getChampionName(r.slowChampionId)}
                  width={champSize}
                  height={champSize}
                  style={{ borderRadius: 6, objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: champSize, height: champSize, borderRadius: 6, backgroundColor: CARD_COLORS.border }} />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: nameSize,
                fontWeight: 700,
                color: CARD_COLORS.textSecondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {r.slowPlayerName}
              </span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: timeSize, color: CARD_COLORS.textMuted }}>
                {fmtTime(r.slowQuestTime)}
              </span>
            </div>
          </div>

          {/* Match (team logos) + Date */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              width: matchColWidth,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {r.fastTeamName && <CardTeamIcon name={r.fastTeamName} fullName={r.fastTeamFullName} size={teamLogoSize} />}
              <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: vsDateFontSize - 4,
                color: CARD_COLORS.textMuted,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
              }}>
                vs
              </span>
              {r.slowTeamName && <CardTeamIcon name={r.slowTeamName} fullName={r.slowTeamFullName} size={teamLogoSize} />}
            </div>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: vsDateFontSize - 4,
                color: CARD_COLORS.textMuted,
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
        </>
      )}
    />
  )
}
