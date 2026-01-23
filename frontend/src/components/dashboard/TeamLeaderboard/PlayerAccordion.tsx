'use client'

import { memo, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import type { PlayerInTeam } from '@/lib/types'
import { formatLp, getRankImagePath, VALID_ROLES, cn } from '@/lib/utils'

interface PlayerAccordionProps {
  players: PlayerInTeam[]
  isOpen: boolean
}

function RoleIcon({ role }: { role: string | null }) {
  const [error, setError] = useState(false)

  if (!role || !(VALID_ROLES as readonly string[]).includes(role.toUpperCase()) || error) {
    return (
      <span className="text-[8px] sm:text-[9px] text-(--text-muted) uppercase w-6 sm:w-7 text-center">
        {role || '-'}
      </span>
    )
  }

  return (
    <Image
      src={`/images/roles/${role.toUpperCase()}.png`}
      alt={role}
      width={20}
      height={20}
      className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
      onError={() => setError(true)}
    />
  )
}

const PlayerAccordion = memo(function PlayerAccordion({ players, isOpen }: PlayerAccordionProps) {
  const t = useTranslations()
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-in-out"
      style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden">
        <div
          className={`
            py-1.5 px-2 sm:px-3 bg-(--bg-accordion) border-b border-(--border)
            transition-opacity duration-300 ease-in-out
            ${isOpen ? 'opacity-100' : 'opacity-0'}
          `}
        >
          {players.map((player, index) => {
            const isGrayed = player.countsForStats === false
            return (
              <div
                key={player.playerId}
                className={`
                  flex items-center py-[5px]
                  ${index !== players.length - 1 ? 'border-b border-(--border)' : ''}
                  ${isGrayed ? 'opacity-40' : ''}
                `}
                title={isGrayed ? t('leaderboard.notInTopFive') : undefined}
              >
                {/* Spacer pour aligner avec le rank */}
                <span className="w-6 sm:w-7" />
                <RoleIcon role={player.role} />
                <span className={`text-[10px] sm:text-[11px] font-medium flex-1 min-w-0 truncate ml-2 ${isGrayed ? 'text-(--text-muted)' : ''}`}>
                  {player.pseudo}
                </span>
                <span className={`font-mono text-[10px] sm:text-[11px] w-16 sm:w-20 text-center flex items-center justify-center gap-1 ${isGrayed ? 'text-(--text-muted)' : 'text-(--text-secondary)'}`}>
                  {getRankImagePath(player.tier) && (
                    <img
                      src={getRankImagePath(player.tier)!}
                      alt={player.tier || ''}
                      className={`w-4 h-4 sm:w-5 sm:h-5 object-contain ${isGrayed ? 'grayscale' : ''}`}
                    />
                  )}
                  {formatLp(player.tier, player.lp)}
                </span>
                <span className={`font-mono text-[10px] sm:text-[11px] w-16 sm:w-20 text-center ${isGrayed ? 'text-(--text-muted)' : 'text-(--text-secondary)'}`}>
                  {player.games === -1 ? '-' : player.games}
                </span>
                <span className={cn(
                  'font-mono text-[10px] sm:text-[11px] w-16 sm:w-20 text-center',
                  isGrayed
                    ? 'text-(--text-muted)'
                    : !isGrayed && player.winrate !== -1 && player.games > 0 && player.winrate >= 60
                      ? 'text-(--positive)'
                      : 'text-(--text-secondary)'
                )}>
                  {player.winrate === -1 || player.games === 0 ? '-' : `${player.winrate.toFixed(0)}%`}
                </span>
                {/* Spacer pour aligner avec le bouton expand */}
                <span className="w-7 sm:w-8" />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Return true if props are equal (no re-render needed)
  // Compare by reference for players array (parent should provide stable reference)
  return (
    prevProps.players === nextProps.players &&
    prevProps.isOpen === nextProps.isOpen
  )
})

export default PlayerAccordion
