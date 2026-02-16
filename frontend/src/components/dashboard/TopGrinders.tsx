import { memo } from 'react'
import type { GrinderEntry } from '@/lib/types'
import TopEntryList from './TopEntryList'

interface TopGrindersProps {
  entries: GrinderEntry[]
  isLoading?: boolean
}

function TopGrinders({ entries, isLoading }: TopGrindersProps) {
  return (
    <TopEntryList
      titleKey="leaderboard.topGrinders"
      headerValueKey="dashboard.games"
      entries={entries}
      renderValue={(entry) => ('games' in entry ? entry.games : null)}
      valueColumnWidth="w-10"
      isLoading={isLoading}
    />
  )
}

export default memo(TopGrinders)
