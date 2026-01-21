'use client'

import { useToastStore } from '@/stores/toastStore'

/**
 * Toast Demo Page - Development only
 *
 * Visit /toast-demo to test the toast notification system
 * Shows all 4 toast types with interactive buttons
 */
export default function ToastDemoPage() {
  const addToast = useToastStore(state => state.addToast)

  return (
    <main className="min-h-screen p-8 bg-[var(--bg-primary)]">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-8">
          Toast Notification Demo
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Error Toast */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
              Error Toast
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Used for API errors, failed operations, validation errors
            </p>
            <button
              onClick={() =>
                addToast({
                  message: 'Impossible de charger les données des équipes',
                  type: 'error',
                })
              }
              className="w-full px-4 py-2 bg-[var(--negative)] text-white rounded-md hover:bg-[var(--negative)]/90 transition-colors"
            >
              Show Error
            </button>
          </div>

          {/* Success Toast */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
              Success Toast
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Used for successful operations, confirmations
            </p>
            <button
              onClick={() =>
                addToast({
                  message: 'Données sauvegardées avec succès',
                  type: 'success',
                  duration: 3000,
                })
              }
              className="w-full px-4 py-2 bg-[var(--positive)] text-white rounded-md hover:bg-[var(--positive)]/90 transition-colors"
            >
              Show Success
            </button>
          </div>

          {/* Warning Toast */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
              Warning Toast
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Used for warnings, non-critical issues, deprecation notices
            </p>
            <button
              onClick={() =>
                addToast({
                  message: 'Certaines données peuvent être obsolètes',
                  type: 'warning',
                  duration: 7000,
                })
              }
              className="w-full px-4 py-2 bg-[var(--warning)] text-white rounded-md hover:bg-[var(--warning)]/90 transition-colors"
            >
              Show Warning
            </button>
          </div>

          {/* Info Toast */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
              Info Toast
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Used for informational messages, tips, updates
            </p>
            <button
              onClick={() =>
                addToast({
                  message: 'Nouvelle mise à jour disponible',
                  type: 'info',
                  duration: 5000,
                })
              }
              className="w-full px-4 py-2 bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent)]/90 transition-colors"
            >
              Show Info
            </button>
          </div>

          {/* Long Message */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
              Long Message
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Test with longer text content
            </p>
            <button
              onClick={() =>
                addToast({
                  message: 'Une erreur est survenue lors de la récupération des données. Veuillez réessayer ou contacter le support si le problème persiste.',
                  type: 'error',
                })
              }
              className="w-full px-4 py-2 bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md hover:border-[var(--text-muted)] transition-colors"
            >
              Show Long Message
            </button>
          </div>

          {/* Persistent Toast */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
              Persistent Toast
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Won't auto-dismiss (duration=0)
            </p>
            <button
              onClick={() =>
                addToast({
                  message: 'Action requise - ce message ne disparaîtra pas automatiquement',
                  type: 'warning',
                  duration: 0,
                })
              }
              className="w-full px-4 py-2 bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md hover:border-[var(--text-muted)] transition-colors"
            >
              Show Persistent
            </button>
          </div>

          {/* Multiple Toasts */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6 md:col-span-2">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
              Multiple Toasts
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Show multiple toasts at once
            </p>
            <button
              onClick={() => {
                addToast({ message: 'Premier toast', type: 'info', duration: 8000 })
                setTimeout(() => addToast({ message: 'Deuxième toast', type: 'success', duration: 8000 }), 500)
                setTimeout(() => addToast({ message: 'Troisième toast', type: 'warning', duration: 8000 }), 1000)
                setTimeout(() => addToast({ message: 'Quatrième toast', type: 'error', duration: 8000 }), 1500)
              }}
              className="w-full px-4 py-2 bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md hover:border-[var(--text-muted)] transition-colors"
            >
              Show 4 Toasts (Staggered)
            </button>
          </div>
        </div>

        {/* API Error Simulation */}
        <div className="mt-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            API Error Simulation
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Simulate real API errors with status codes
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() =>
                addToast({
                  message: 'Erreur lors du chargement (400)',
                  type: 'error',
                })
              }
              className="px-4 py-2 bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md hover:border-[var(--text-muted)] transition-colors text-sm"
            >
              400 Bad Request
            </button>
            <button
              onClick={() =>
                addToast({
                  message: 'Erreur lors du chargement (401)',
                  type: 'error',
                })
              }
              className="px-4 py-2 bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md hover:border-[var(--text-muted)] transition-colors text-sm"
            >
              401 Unauthorized
            </button>
            <button
              onClick={() =>
                addToast({
                  message: 'Erreur lors du chargement (404)',
                  type: 'error',
                })
              }
              className="px-4 py-2 bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md hover:border-[var(--text-muted)] transition-colors text-sm"
            >
              404 Not Found
            </button>
            <button
              onClick={() =>
                addToast({
                  message: 'Erreur lors du chargement (500)',
                  type: 'error',
                })
              }
              className="px-4 py-2 bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-md hover:border-[var(--text-muted)] transition-colors text-sm"
            >
              500 Server Error
            </button>
          </div>
        </div>

        {/* Documentation Link */}
        <div className="mt-8 text-center text-sm text-[var(--text-secondary)]">
          <p>
            See{' '}
            <code className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-[var(--accent)] font-mono text-xs">
              frontend/TOAST_NOTIFICATIONS.md
            </code>{' '}
            for implementation details
          </p>
        </div>
      </div>
    </main>
  )
}
