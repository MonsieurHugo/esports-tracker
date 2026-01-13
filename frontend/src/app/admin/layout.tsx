'use client'

import { RequireAdmin } from '@/components/auth/RequireAdmin'
import type { ReactNode } from 'react'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>
}
