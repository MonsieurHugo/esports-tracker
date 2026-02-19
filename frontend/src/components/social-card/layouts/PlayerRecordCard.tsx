import type { ProPlayerRecord } from '@/lib/types'
import { getChampionName, getChampionIconUrl } from '@/lib/champions'
import { getRoleImagePath } from '@/lib/utils'
import { CardRankBadge } from '../CardRankBadge'
import { CardTeamIcon } from '../CardTeamIcon'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface PlayerRecordCardProps {
  records: ProPlayerRecord[]
  formatValue: (r: ProPlayerRecord) => string
  format: SocialCardFormat
}

/** Pick value by format: twitter / instagram / tiktok */
function sz(format: SocialCardFormat, twitter: number, insta: number, tiktok: number) {
  return format === 'twitter' ? twitter : format === 'tiktok' ? tiktok : insta
}

export function PlayerRecordCard({ records, formatValue, format }: PlayerRecordCardProps) {
  // Twitter 1200×1600 | Instagram 1080×1080 | TikTok 900×1540 usable
  const pseudoSize     = sz(format, 46, 30, 34)
  const valueSize      = sz(format, 78, 48, 58)
  const champSize      = sz(format, 88, 56, 66)
  const roleSize       = sz(format, 54, 34, 40)
  const teamLogoSize   = sz(format, 56, 36, 42)
  const badgeSize      = sz(format, 56, 34, 42)
  const vsDateFontSize = sz(format, 28, 18, 21)
  const opponentLogo   = sz(format, 46, 29, 34)
  const rowPadR        = sz(format, 24, 14, 16)
  const rowPadL        = sz(format, 20, 12, 14)
  const rowGap         = sz(format, 14, 8, 10)
  const rightGap       = sz(format, 36, 24, 28)
  const valueWidth     = sz(format, 260, 160, 190)
  const vsColWidth     = sz(format, 125, 80, 95)
  const borderW        = sz(format, 8, 5, 6)

  const top10 = records.slice(0, 10)

  // Scale down value font size if the longest value overflows the column
  const maxLen = Math.max(...top10.map(r => formatValue(r).length), 1)
  const maxFitSize = valueWidth / (maxLen * 0.62)
  const actualValueSize = Math.min(valueSize, Math.floor(maxFitSize))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {top10.map((r, i) => {
        const isFirst = i === 0
        const bgColor = isFirst
          ? CARD_COLORS.accent + '14'
          : i % 2 === 0
            ? CARD_COLORS.bgRow
            : CARD_COLORS.bgRowAlt

        const leftBorder = r.win != null
          ? `${borderW}px solid ${r.win ? '#00dc82' : '#ff4757'}60`
          : 'none'

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              flex: 1,
              padding: `0 ${rowPadR}px`,
              paddingLeft: rowPadL,
              backgroundColor: bgColor,
              borderBottom: i < top10.length - 1 ? `1px solid ${CARD_COLORS.border}40` : 'none',
              borderLeft: leftBorder,
              gap: rowGap,
            }}
          >
            {/* Rank */}
            <CardRankBadge rank={i + 1} size={badgeSize} />

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
              <span
                style={{
                  display: 'inline-block',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: actualValueSize,
                  fontWeight: 700,
                  color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                  textAlign: 'right',
                  width: valueWidth,
                }}
              >
                {formatValue(r)}
              </span>

              {/* vs + Date */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
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
                        color: CARD_COLORS.textMuted,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.05em',
                      }}
                    >
                      vs
                    </span>
                    <CardTeamIcon name={r.opponentName} size={opponentLogo} />

                  </>
                ) : (
                  <div style={{ height: opponentLogo }} />
                )}
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: vsDateFontSize - 3,
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
          </div>
        )
      })}
    </div>
  )
}
