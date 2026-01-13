'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SidebarItem {
  href: string
  label: string
  icon?: string
}

interface SidebarProps {
  items: SidebarItem[]
}

export function Sidebar({ items }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="w-64 border-r border-(--border) min-h-screen p-4">
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-(--primary) text-white'
                  : 'text-(--muted) hover:text-white hover:bg-(--card)'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
