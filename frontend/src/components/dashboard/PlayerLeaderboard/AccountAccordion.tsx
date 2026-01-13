'use client'

import { memo, useState } from 'react'
import Image from 'next/image'
import type { PlayerAccount } from '@/lib/types'
import { formatLp, getRankImagePath as getRankImage } from '@/lib/utils'

interface AccountAccordionProps {
  accounts: PlayerAccount[]
  isOpen: boolean
}

function AccountAccordion({ accounts, isOpen }: AccountAccordionProps) {
  const [rankErrors, setRankErrors] = useState<Set<string>>(new Set())

  const handleRankError = (puuid: string) => {
    setRankErrors((prev) => new Set(prev).add(puuid))
  }

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
          {accounts.map((account, index) => {
            const rankImage = getRankImage(account.tier)
            return (
              <div
                key={account.puuid}
                className={`
                  flex items-center py-[5px]
                  ${index !== accounts.length - 1 ? 'border-b border-(--border)' : ''}
                `}
              >
                {/* Spacer pour aligner avec le rank */}
                <span className="w-6 sm:w-7" />
                {/* Account name */}
                <span className="text-[10px] sm:text-[11px] font-medium flex-1 min-w-0 truncate">
                  {account.gameName}
                  <span className="text-(--text-muted)">#{account.tagLine}</span>
                </span>
                {/* Region */}
                <span className="text-[8px] sm:text-[9px] px-1.5 py-0.5 bg-(--bg-secondary) text-(--text-muted) rounded-sm shrink-0 mr-2 uppercase">
                  {account.region}
                </span>
                {/* Rank image + LP */}
                <span className="font-mono text-[10px] sm:text-[11px] text-(--text-secondary) w-16 sm:w-20 text-right pr-4 flex items-center justify-end gap-1">
                  {rankImage && !rankErrors.has(account.puuid) && (
                    <Image
                      src={rankImage}
                      alt={account.tier || ''}
                      width={20}
                      height={20}
                      className="w-4 h-4 sm:w-5 sm:h-5 object-contain"
                      onError={() => handleRankError(account.puuid)}
                    />
                  )}
                  {formatLp(account.tier, account.lp)}
                </span>
                {/* Games */}
                <span className="font-mono text-[10px] sm:text-[11px] text-(--text-secondary) w-14 sm:w-16 text-right pr-4">
                  {account.games}
                </span>
                {/* Winrate */}
                <span className="font-mono text-[10px] sm:text-[11px] text-(--text-secondary) w-[4.5rem] sm:w-20 text-right pr-4">
                  {account.games > 0 ? `${account.winrate.toFixed(0)}%` : '-'}
                </span>
                {/* Spacer pour aligner avec le bouton expand */}
                <span className="w-7 sm:w-8 ml-2" />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default memo(AccountAccordion)
