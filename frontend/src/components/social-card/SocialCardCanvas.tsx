import { forwardRef } from 'react'
import type { ProPlayerRecord, ProQuestGapRecord, ProTeamRecord, ProBoRecord, ProStreakRecord, ProTournamentKillsRecord, ProTournamentPlayerRecord } from '@/lib/types'
import { CardHeader } from './CardHeader'
import { CardFooter } from './CardFooter'
import { PlayerRecordCard } from './layouts/PlayerRecordCard'
import { QuestGapRecordCard } from './layouts/QuestGapRecordCard'
import { TeamRecordCard } from './layouts/TeamRecordCard'
import { BoRecordCard } from './layouts/BoRecordCard'
import { StreakRecordCard } from './layouts/StreakRecordCard'
import { TournamentKillsCard } from './layouts/TournamentKillsCard'
import { TournamentPlayerCard } from './layouts/TournamentPlayerCard'
import { CARD_DIMENSIONS, CARD_COLORS, TIKTOK_SAFE_ZONE } from './types'
import type { SocialCardFormat, SocialCardData } from './types'

interface SocialCardCanvasProps {
  data: SocialCardData
  format: SocialCardFormat
}

export const SocialCardCanvas = forwardRef<HTMLDivElement, SocialCardCanvasProps>(
  function SocialCardCanvas({ data, format }, ref) {
    const { width, height } = CARD_DIMENSIONS[format]
    const isTiktok = format === 'tiktok'
    const sz = isTiktok ? TIKTOK_SAFE_ZONE : { top: 0, bottom: 0, left: 0, right: 0 }

    return (
      <div
        ref={ref}
        style={{
          width,
          height,
          backgroundColor: CARD_COLORS.bg,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, sans-serif',
          overflow: 'hidden',
          paddingTop: sz.top,
          paddingBottom: sz.bottom,
          paddingLeft: sz.left,
          paddingRight: sz.right,
        }}
      >
        <CardHeader title={data.title} format={format} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {data.cardType === 'player' && (
            <PlayerRecordCard
              records={data.records as ProPlayerRecord[]}
              formatValue={data.formatValue as (r: ProPlayerRecord) => string}
              format={format}
            />
          )}
          {data.cardType === 'team' && (
            <TeamRecordCard
              records={data.records as ProTeamRecord[]}
              formatValue={data.extra?.valueLabel ? (data.formatValue as (r: ProTeamRecord) => string) : undefined}
              format={format}
              winnerLabel={data.extra?.winnerLabel}
              loserLabel={data.extra?.loserLabel}
            />
          )}
          {data.cardType === 'bo' && (
            <BoRecordCard
              records={data.records as ProBoRecord[]}
              format={format}
            />
          )}
          {data.cardType === 'streak' && (
            <StreakRecordCard
              records={data.records as ProStreakRecord[]}
              format={format}
              unit={data.extra?.unit}
            />
          )}
          {data.cardType === 'tournamentKills' && (
            <TournamentKillsCard
              records={data.records as ProTournamentKillsRecord[]}
              format={format}
            />
          )}
          {data.cardType === 'questGap' && (
            <QuestGapRecordCard
              records={data.records as ProQuestGapRecord[]}
              formatValue={data.formatValue as (r: ProQuestGapRecord) => string}
              format={format}
            />
          )}
          {data.cardType === 'tournamentPlayer' && (
            <TournamentPlayerCard
              records={data.records as ProTournamentPlayerRecord[]}
              formatValue={data.formatValue as (r: ProTournamentPlayerRecord) => string}
              format={format}
            />
          )}
        </div>

        <CardFooter filters={data.filters} format={format} />
      </div>
    )
  }
)
