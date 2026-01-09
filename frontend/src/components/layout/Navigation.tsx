'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function Navigation() {
  const pathname = usePathname()
  const isLolActive = pathname.startsWith('/lol')
  const isMonitoringActive = pathname.startsWith('/monitoring')

  return (
    <nav className="hidden md:flex items-center gap-1">
      <Link
        href="/lol"
        className={cn(
          'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isLolActive
            ? 'bg-[var(--card)] text-white'
            : 'text-[var(--muted)] hover:text-white hover:bg-[var(--card-hover)]'
        )}
      >
        LoL
      </Link>
      <Link
        href="/monitoring"
        className={cn(
          'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isMonitoringActive
            ? 'bg-[var(--card)] text-white'
            : 'text-[var(--muted)] hover:text-white hover:bg-[var(--card-hover)]'
        )}
      >
        Monitoring
      </Link>
    </nav>
  )
}
