'use client'

import WorkerStatus from './WorkerStatus'
import DataQualityStats from './DataQualityStats'

export default function WorkerHealthTab() {
  return (
    <div className="space-y-4">
      <WorkerStatus />
      <DataQualityStats />
    </div>
  )
}
