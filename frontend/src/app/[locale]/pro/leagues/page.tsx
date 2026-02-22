'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/Skeleton'

const ProLeaguesPage = dynamic(() => import('./ProLeaguesPage'), {
  loading: () => (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  ),
})

export default function ProLeaguesPageWrapper() {
  return <ProLeaguesPage />
}
