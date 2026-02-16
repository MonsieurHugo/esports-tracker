'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/Skeleton'

const ProDataDashboard = dynamic(() => import('./ProDataDashboard'), {
  loading: () => (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-lg mb-4" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  ),
  ssr: false,
})

export default function ProMonitoringPage() {
  return <ProDataDashboard />
}
