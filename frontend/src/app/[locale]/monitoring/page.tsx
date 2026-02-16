'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/Skeleton'

const MonitoringDashboard = dynamic(
  () => import('./MonitoringDashboard'),
  {
    loading: () => (
      <div className="p-4 sm:p-6 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="mb-5">
          <Skeleton className="h-6 w-48" />
        </div>

        {/* SoloQ section */}
        <Skeleton className="h-14 w-full rounded-xl mb-4" />

        {/* Pro section */}
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    ),
    ssr: false,
  }
)

export default function MonitoringPage() {
  return <MonitoringDashboard />
}
