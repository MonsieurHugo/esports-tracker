'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface RequireAdminProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Protects admin routes by requiring authentication and admin role.
 * IMPORTANT: This is client-side protection only. Always validate admin
 * permissions on the backend API for all admin operations.
 */
export function RequireAdmin({ children, fallback }: RequireAdminProps) {
  const router = useRouter()
  const { user, isAuthenticated, isLoading } = useAuth()

  // Determine authorization state synchronously
  const isAdmin = isAuthenticated && user?.role === 'admin'
  const shouldRedirect = !isLoading && !isAdmin

  useEffect(() => {
    if (shouldRedirect) {
      if (!isAuthenticated) {
        router.replace('/login')
      } else {
        // User is logged in but not admin
        router.replace('/')
      }
    }
  }, [shouldRedirect, isAuthenticated, router])

  // Show loading state while checking auth
  if (isLoading) {
    return fallback ?? (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-(--text-muted)">Chargement...</div>
      </div>
    )
  }

  // CRITICAL: Never render children if not admin
  // Return null immediately to prevent any content flash
  if (!isAdmin) {
    return null
  }

  return <>{children}</>
}
