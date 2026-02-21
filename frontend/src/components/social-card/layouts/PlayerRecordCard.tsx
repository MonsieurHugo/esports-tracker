import type { ProPlayerRecord } from '@/lib/types'
import { getChampionName, getChampionIconUrl } from '@/lib/champions'
import { getRoleImagePath } from '@/lib/utils'
import { CardTeamIcon } from '../CardTeamIcon'
import { CardRowList } from '../CardRowList'
import { sz } from '../utils'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface PlayerRecordCardProps {
  records: ProPlayerRecord[]
  formatValue: (r: ProPlayerRecord) => string
  formatDetail?: (r: ProPlayerRecord) => string | null
  format: SocialCardFormat
}

export function PlayerRecordCard({ records, formatValue, formatDetail, format }: PlayerRecordCardProps) {
  // Twitter 1200x1600 | Instagram 1080x1080 | TikTok 900x1540 usable
  const pseudoSize     = sz(format, 40, 26, 30)
  const valueSize      = sz(format, 64, 40, 48)
  const champSize      = sz(format, 72, 46, 54)
  const roleSize       = sz(format, 54, 36, 40)
  const teamLogoSize   = sz(format, 56, 36, 44)
  const badgeSize      = sz(format, 56, 34, 42)
  const vsDateFontSize = sz(format, 22, 15, 17)
  const opponentLogo   = sz(format, 48, 32, 38)
  const rowPadR        = sz(format, 24, 14, 16)
  const rowPadL        = sz(format, 20, 12, 14)
  const rowGap         = sz(format, 14, 8, 10)
  const rightGap       = sz(format, 24, 16, 20)
  const valueWidth     = sz(format, 220, 140, 170)
  const vsColWidth     = sz(format, 125, 80, 95)
  const borderW        = sz(format, 8, 5, 6)

  // Scale down value font size if the longest value overflows the column
  const top10 = records.slice(0, 10)
  const maxLen = Math.max(...top10.map(r => formatValue(r).length), 1)
  const maxFitSize = valueWidth / (maxLen * 0.62)
  const actualValueSize = Math.min(valueSize, Math.floor(maxFitSize))

  return (
    <CardRowList<ProPlayerRecord>
      records={records}
      rowPadH={rowPadR}
      rowPadL={rowPadL}
      rowGap={rowGap}
      badgeSize={badgeSize}
      leftBorder={(r) => r.win != null ? `${borderW}px solid ${r.win ? '#00dc82' : '#ff4757'}60` : undefined}
      renderRow={(r, _i, isFirst) => (
        <>
          {/* Team logo */}
          <div style={{ width: teamLogoSize, height: teamLogoSize, flexShrink: 0 }}>
            {r.teamName && (
              <CardTeamIcon name={r.teamName} fullName={r.teamFullName} size={teamLogoSize} />
            )}
          </div>

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

          {/* Champion icon */}
          <div style={{ width: champSize, height: champSize, flexShrink: 0 }}>
            {r.championId != null && r.championId !== 0 ? (
              <img
                src={getChampionIconUrl(r.championId)}
                alt={getChampionName(r.championId)}
                width={champSize}
                height={champSize}
                style={{ borderRadius: 6, objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: champSize,
                  height: champSize,
                  borderRadius: 6,
                  backgroundColor: CARD_COLORS.border,
                }}
              />
            )}
          </div>

          {/* Player name */}
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: pseudoSize,
              fontWeight: 700,
              color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {r.playerName}
          </span>

          {/* Right section: value + vs/date grouped */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: rightGap,
              flexShrink: 0,
            }}
          >
            {/* Value */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                width: valueWidth,
              }}
            >
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: actualValueSize,
                  fontWeight: 700,
                  color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                  lineHeight: 1.1,
                }}
              >
                {formatValue(r)}
              </span>
              {formatDetail && formatDetail(r) && (
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: Math.round(actualValueSize * 0.55),
                    fontWeight: 500,
                    color: CARD_COLORS.textMuted,
                    lineHeight: 1,
                  }}
                >
                  {formatDetail(r)}
                </span>
              )}
            </div>

            {/* vs + Date */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: sz(format, 10, 6, 8),
                width: vsColWidth,
                overflow: 'hidden',
              }}
            >
              {r.opponentName ? (
                <>
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: vsDateFontSize - 3,
                      lineHeight: 1,
                      color: CARD_COLORS.textMuted,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.05em',
                    }}
                  >
                    vs
                  </span>
                  <div style={{ width: opponentLogo, height: opponentLogo, flexShrink: 0 }}>
                    <CardTeamIcon name={r.opponentName} size={opponentLogo} />
                  </div>

                </>
              ) : (
                <div style={{ height: opponentLogo }} />
              )}
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: vsDateFontSize - 3,
                  lineHeight: 1,
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
          </div>
        </>
      )}
    />
  )
}
