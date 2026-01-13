'use client'

import { useEffect } from 'react'
import { logError } from '@/lib/logger'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error - only shows in dev, could send to monitoring in prod
    logError('Application error', error, { digest: error.digest })
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold mb-4 text-(--negative)">Une erreur est survenue</h2>
      <p className="text-(--text-muted) mb-6">
        Une erreur inattendue s'est produite. Veuillez réessayer.
      </p>
      {error.digest && (
        <p className="text-xs text-(--text-muted) mb-4">
          Code erreur: {error.digest}
        </p>
      )}
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-(--accent) text-white rounded-lg hover:bg-(--accent-hover) transition-colors"
      >
        Réessayer
      </button>
    </div>
  )
}
