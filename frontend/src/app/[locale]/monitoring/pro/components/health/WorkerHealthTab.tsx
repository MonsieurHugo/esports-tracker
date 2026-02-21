'use client'

import WorkerStatus from './WorkerStatus'
import DataQualityStats from './DataQualityStats'
import DataQualityFlags from './DataQualityFlags'

export default function WorkerHealthTab() {
  return (
    <div className="space-y-4">
      <WorkerStatus />
      <DataQualityStats />
      <DataQualityFlags />
    </div>
  )
}
