'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'

export interface ToastProps {
  id: string
  message: string
  type?: 'error' | 'success' | 'info' | 'warning'
  duration?: number
  onClose: (id: string) => void
}

/**
 * Toast notification component
 *
 * Usage:
 * - Displays toast notifications in bottom-right corner
 * - Auto-dismisses after specified duration (default 5s)
 * - Manual dismiss via close button
 * - Styled with CSS variables for consistency
 *
 * @example
 * <Toast
 *   id="error-1"
 *   message="Failed to fetch data"
 *   type="error"
 *   onClose={handleClose}
 * />
 */
export function Toast({ id, message, type = 'error', duration = 5000, onClose }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id)
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [id, duration, onClose])

  const typeStyles = {
    error: 'border-[var(--negative)] bg-[var(--negative)]/10',
    success: 'border-[var(--positive)] bg-[var(--positive)]/10',
    warning: 'border-[var(--warning)] bg-[var(--warning)]/10',
    info: 'border-[var(--accent)] bg-[var(--accent)]/10',
  }

  const iconPaths = {
    error: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    ),
    success: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    ),
    warning: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    ),
    info: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg',
        'bg-[var(--bg-card)] backdrop-blur-sm',
        'animate-in slide-in-from-right-full duration-300',
        'min-w-[320px] max-w-[420px]',
        typeStyles[type]
      )}
    >
      {/* Icon */}
      <svg
        className={cn(
          'shrink-0 w-5 h-5 mt-0.5',
          type === 'error' && 'text-[var(--negative)]',
          type === 'success' && 'text-[var(--positive)]',
          type === 'warning' && 'text-[var(--warning)]',
          type === 'info' && 'text-[var(--accent)]'
        )}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        {iconPaths[type]}
      </svg>

      {/* Message */}
      <p className="flex-1 text-sm text-[var(--text-primary)] leading-relaxed">
        {message}
      </p>

      {/* Close button */}
      <button
        onClick={() => onClose(id)}
        className="shrink-0 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        aria-label="Fermer la notification"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
}
