'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function Navigation() {
  const pathname = usePathname()
  const isLolActive = pathname.startsWith('/lol')
  const isAdminActive = pathname.startsWith('/admin')

  return (
    <nav className="hidden md:flex items-center gap-1">
      <Link
        href="/lol"
        className={cn(
          'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isLolActive
            ? 'bg-(--card) text-white'
            : 'text-(--muted) hover:text-white hover:bg-(--card-hover)'
        )}
      >
        LoL
      </Link>
      <Link
        href="/admin/players"
        className={cn(
          'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isAdminActive
            ? 'bg-(--card) text-white'
            : 'text-(--muted) hover:text-white hover:bg-(--card-hover)'
        )}
      >
        Admin
      </Link>
    </nav>
  )
}
