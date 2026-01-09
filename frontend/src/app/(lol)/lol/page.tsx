'use client'

import dynamic from 'next/dynamic'

const LolDashboard = dynamic(() => import('./LolDashboard'), {
  ssr: false,
  loading: () => (
    <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
      <div className="animate-pulse">
        <div className="h-8 bg-[var(--bg-card)] rounded w-32 mb-4"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="h-96 bg-[var(--bg-card)] rounded"></div>
          <div className="h-96 bg-[var(--bg-card)] rounded"></div>
        </div>
      </div>
    </main>
  ),
})

export default function Page() {
  return <LolDashboard />
}
