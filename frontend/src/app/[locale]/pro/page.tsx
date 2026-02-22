'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/Skeleton'

const ProHubPage = dynamic(() => import('./ProHubPage'), {
  loading: () => (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  ),
})

export default function ProHubPageWrapper() {
  return <ProHubPage />
}
