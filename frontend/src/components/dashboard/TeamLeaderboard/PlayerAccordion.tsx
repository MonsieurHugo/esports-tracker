'use client'

import { memo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { PlayerInTeam } from '@/lib/types'
import { formatLp, getRankImagePath, VALID_ROLES } from '@/lib/utils'

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

function PlayerAccordion({ players, isOpen }: PlayerAccordionProps) {
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
          {players.map((player, index) => (
            <div
              key={player.playerId}
              className={`
                flex items-center py-[5px]
                ${index !== players.length - 1 ? 'border-b border-(--border)' : ''}
              `}
            >
              {/* Spacer pour aligner avec le rank */}
              <span className="w-6 sm:w-7" />
              <RoleIcon role={player.role} />
              <Link
                href={`/lol/player/${player.slug}`}
                className="text-[10px] sm:text-[11px] font-medium flex-1 min-w-0 truncate ml-2 hover:text-(--accent) hover:underline transition-colors"
              >
                {player.pseudo}
              </Link>
              <span className="font-mono text-[10px] sm:text-[11px] text-(--text-secondary) w-16 sm:w-20 text-right pr-4 flex items-center justify-end gap-1">
                {getRankImagePath(player.tier) && (
                  <img
                    src={getRankImagePath(player.tier)!}
                    alt={player.tier || ''}
                    className="w-4 h-4 sm:w-5 sm:h-5 object-contain"
                  />
                )}
                {formatLp(player.tier, player.lp)}
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] text-(--text-secondary) w-14 sm:w-16 text-right pr-4">
                {player.games === -1 ? '-' : player.games}
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] text-(--text-secondary) w-[4.5rem] sm:w-20 text-right pr-4">
                {player.winrate === -1 || player.games === 0 ? '-' : `${player.winrate.toFixed(0)}%`}
              </span>
              {/* Spacer pour aligner avec le bouton expand */}
              <span className="w-7 sm:w-8 ml-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(PlayerAccordion)
