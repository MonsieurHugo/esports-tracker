'use client'

import { useEffect, useState } from 'react'
import { useToastStore } from '@/stores/toastStore'
import { Toast } from './Toast'

/**
 * ToastContainer - Renders all active toasts
 *
 * Usage:
 * Place this component at the root of your app layout:
 *
 * ```tsx
 * <body>
 *   {children}
 *   <ToastContainer />
 * </body>
 * ```
 *
 * Accessibility:
 * - Uses aria-live region for screen readers
 * - Each toast has role="alert"
 * - Fixed positioning in bottom-right corner
 */
export function ToastContainer() {
  const [mounted, setMounted] = useState(false)
  const { toasts, removeToast } = useToastStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  if (toasts.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            id={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={removeToast}
          />
        </div>
      ))}
    </div>
  )
}
