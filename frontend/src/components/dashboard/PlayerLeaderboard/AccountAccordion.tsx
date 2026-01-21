'use client'

import { memo, useState } from 'react'
import Image from 'next/image'
import type { PlayerAccount } from '@/lib/types'
import { formatLp, getRankImagePath as getRankImage, getRegionTagClasses, cn } from '@/lib/utils'

interface AccountAccordionProps {
  accounts: PlayerAccount[]
  isOpen: boolean
}

const AccountAccordion = memo(function AccountAccordion({ accounts, isOpen }: AccountAccordionProps) {
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
                {/* Account name + Region */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-medium truncate">
                    {account.gameName}
                    <span className="text-(--text-muted)">#{account.tagLine}</span>
                  </span>
                  <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-sm shrink-0 uppercase ${getRegionTagClasses(account.region)}`}>
                    {account.region}
                  </span>
                </div>
                {/* Rank image + LP */}
                <span className="font-mono text-[10px] sm:text-[11px] text-(--text-secondary) w-16 sm:w-20 text-center flex items-center justify-center gap-1">
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
                <span className="font-mono text-[10px] sm:text-[11px] text-(--text-secondary) w-16 sm:w-20 text-center">
                  {account.games}
                </span>
                {/* Winrate */}
                <span className={cn(
                  'font-mono text-[10px] sm:text-[11px] w-16 sm:w-20 text-center',
                  account.games > 0 && account.winrate >= 60
                    ? 'text-(--positive)'
                    : 'text-(--text-secondary)'
                )}>
                  {account.games > 0 ? `${account.winrate.toFixed(0)}%` : '-'}
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
  // Compare by reference for accounts array (parent should provide stable reference)
  return (
    prevProps.accounts === nextProps.accounts &&
    prevProps.isOpen === nextProps.isOpen
  )
})

export default AccountAccordion
