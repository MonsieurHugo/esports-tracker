'use client'

import dynamic from 'next/dynamic'

const ProDashboard = dynamic(() => import('./ProDashboard'), {
  ssr: false,
  loading: () => (
    <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
      <div className="animate-pulse">
        <div className="h-8 bg-(--bg-card) rounded-sm w-48 mb-4"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-80 bg-(--bg-card) rounded-xl"></div>
          <div className="h-80 bg-(--bg-card) rounded-xl"></div>
        </div>
      </div>
    </main>
  ),
})

export default function Page() {
  return <ProDashboard />
}
