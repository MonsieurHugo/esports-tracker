'use client'

import Link from 'next/link'
import { Navigation } from './Navigation'

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-(--border) bg-(--background)/95 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-xl">
            Esports Tracker
          </Link>
          <Navigation />
        </div>
      </div>
    </header>
  )
}
