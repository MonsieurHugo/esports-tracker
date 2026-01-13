'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/auth'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    async function verifyEmail() {
      if (!token) {
        setStatus('error')
        setError('Token de verification manquant')
        return
      }

      try {
        await authApi.verifyEmail(token)
        setStatus('success')
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Erreur lors de la verification')
      }
    }

    verifyEmail()
  }, [token])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--accent)] mx-auto mb-4"></div>
          <p className="text-[var(--text-muted)]">Verification en cours...</p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--positive)]/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--positive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold mb-2">Email verifie!</h1>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Votre adresse email a ete verifiee avec succes.
          </p>
          <Link
            href="/login"
            className="inline-block w-full py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors text-center"
          >
            Se connecter
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--negative)]/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[var(--negative)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold mb-2">Echec de la verification</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          {error || 'Le lien de verification est invalide ou a expire.'}
        </p>
        <Link
          href="/login"
          className="inline-block w-full py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] font-medium rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-center"
        >
          Retour a la connexion
        </Link>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--accent)]"></div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
