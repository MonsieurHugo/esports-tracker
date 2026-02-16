import { memo } from 'react'
import type { LpChangeEntry } from '@/lib/types'
import TopEntryList from './TopEntryList'

interface TopLpGainersProps {
  entries: LpChangeEntry[]
  isLoading?: boolean
}

function TopLpGainers({ entries, isLoading }: TopLpGainersProps) {
  return (
    <TopEntryList
      titleKey="leaderboard.topLpGainers"
      headerValueKey="dashboard.lp"
      entries={entries}
      renderValue={(entry) => (
        <span className="text-(--positive)">
          +{'lpChange' in entry ? entry.lpChange.toLocaleString('fr-FR') : 0}
        </span>
      )}
      valueColumnWidth="w-14"
      isLoading={isLoading}
    />
  )
}

export default memo(TopLpGainers)
