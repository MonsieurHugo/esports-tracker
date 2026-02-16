import { memo } from 'react'
import type { LpChangeEntry } from '@/lib/types'
import TopEntryList from './TopEntryList'

interface TopLpLosersProps {
  entries: LpChangeEntry[]
  isLoading?: boolean
}

function TopLpLosers({ entries, isLoading }: TopLpLosersProps) {
  return (
    <TopEntryList
      titleKey="leaderboard.topLpLosers"
      headerValueKey="dashboard.lp"
      entries={entries}
      renderValue={(entry) => (
        <span className="text-(--negative)">
          {'lpChange' in entry ? entry.lpChange.toLocaleString('fr-FR') : 0}
        </span>
      )}
      valueColumnWidth="w-14"
      isLoading={isLoading}
    />
  )
}

export default memo(TopLpLosers)
