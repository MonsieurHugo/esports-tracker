'use client'

import { Component, ReactNode } from 'react'
import { logError } from '@/lib/logger'

interface FallbackProps {
  error: Error
  resetError: () => void
}

interface Props {
  children: ReactNode
  fallback?: ReactNode | ((props: FallbackProps) => ReactNode)
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logError('ErrorBoundary caught an error', error, { componentStack: errorInfo.componentStack })
    this.props.onError?.(error, errorInfo)
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props

      if (typeof fallback === 'function') {
        return fallback({ error: this.state.error, resetError: this.resetError })
      }

      return fallback || (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400">Something went wrong loading this component.</p>
          <button
            onClick={this.resetError}
            className="mt-2 text-sm text-red-300 hover:text-red-200"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
