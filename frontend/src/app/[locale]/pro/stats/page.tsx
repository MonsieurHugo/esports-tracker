'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/Skeleton'

const ProStatsPage = dynamic(() => import('./ProStatsPage'), {
  loading: () => (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg mb-4" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  ),
  ssr: false,
})

export default function ProStatsPageWrapper() {
  return <ProStatsPage />
}
