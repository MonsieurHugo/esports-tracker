'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { logError } from '@/lib/logger'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary component that catches JavaScript errors in child components.
 * Prevents the entire app from crashing when a component throws an error.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary fallback={<div>Something went wrong</div>}>
 *   <SomeComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to monitoring service
    logError('ErrorBoundary caught error', error, {
      componentStack: errorInfo.componentStack,
    })

    // Call optional error callback
    this.props.onError?.(error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div className="p-4 bg-(--bg-card) border border-(--border) rounded-lg">
          <div className="flex items-center gap-2 text-(--negative) mb-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="font-medium text-sm">Une erreur est survenue</span>
          </div>
          <p className="text-xs text-(--text-muted) mb-3">
            Ce composant a rencontré une erreur. Essayez de recharger.
          </p>
          <button
            onClick={this.handleReset}
            className="px-3 py-1.5 text-xs bg-(--accent) text-white rounded-md hover:bg-(--accent-hover) transition-colors"
          >
            Réessayer
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Wrapper component for sections that might fail.
 * Shows a minimal inline error state without affecting the rest of the page.
 */
export function ErrorBoundaryInline({
  children,
  label = 'section',
}: {
  children: ReactNode
  label?: string
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex items-center gap-2 p-3 text-sm text-(--text-muted) bg-(--bg-secondary) rounded-lg">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Impossible de charger {label}</span>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

export default ErrorBoundary
