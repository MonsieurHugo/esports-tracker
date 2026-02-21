import type { ProTournamentPlayerRecord } from '@/lib/types'
import { getRoleImagePath } from '@/lib/utils'
import { CardRowList } from '../CardRowList'
import { shortenTournament } from '../utils'
import { CARD_COLORS } from '../types'
import type { SocialCardFormat } from '../types'

interface TournamentPlayerCardProps {
  records: ProTournamentPlayerRecord[]
  formatValue: (r: ProTournamentPlayerRecord) => string
  format: SocialCardFormat
}

export function TournamentPlayerCard({ records, formatValue, format }: TournamentPlayerCardProps) {
  const isInsta = format === 'instagram'
  const rowHeight = isInsta ? 72 : 48
  const fontSize = isInsta ? 14 : 12

  return (
    <CardRowList<ProTournamentPlayerRecord>
      records={records}
      rowPadH={24}
      rowGap={12}
      rowHeight={rowHeight}
      renderRow={(r, _i, isFirst) => (
        <>
          {/* Role icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 40, flexShrink: 0 }}>
            {r.role && (
              <img
                src={getRoleImagePath(r.role)}
                alt={r.role}
                width={16}
                height={16}
                style={{ objectFit: 'contain', opacity: 0.6 }}
              />
            )}
          </div>

          {/* Player + tournament info */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              overflow: 'hidden',
              gap: 1,
            }}
          >
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize,
                fontWeight: 600,
                color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.playerName}
            </span>
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: fontSize - 3,
                color: CARD_COLORS.textMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.teamName ? `${r.teamName} \u00b7 ` : ''}{shortenTournament(r.tournamentName)}
            </span>
          </div>

          {/* Value */}
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize,
              fontWeight: 700,
              color: isFirst ? CARD_COLORS.accent : CARD_COLORS.text,
              textAlign: 'right',
              minWidth: isInsta ? 90 : 70,
            }}
          >
            {formatValue(r)}
          </span>

          {/* Games played */}
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: fontSize - 2,
              color: CARD_COLORS.textMuted,
              textAlign: 'right',
              width: 40,
            }}
          >
            {r.gamesPlayed}GP
          </span>
        </>
      )}
    />
  )
}
