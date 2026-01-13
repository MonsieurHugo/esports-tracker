'use client'

import { useState } from 'react'
import Link from 'next/link'
import { authApi } from '@/lib/auth'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsLoading(true)

    try {
      const result = await authApi.forgotPassword(email)
      setSuccess(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
        <Link
          href="/login"
          className="inline-block mb-4 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          &larr; Retour a la connexion
        </Link>

        <h1 className="text-xl font-semibold text-center mb-2">Mot de passe oublie</h1>
        <p className="text-sm text-[var(--text-muted)] text-center mb-6">
          Entrez votre email pour recevoir un lien de reinitialisation
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="votre@email.com"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-[var(--negative)]/10 border border-[var(--negative)]/30 rounded-lg text-sm text-[var(--negative)]">
              {error}
            </div>
          )}

          {success && (
            <div className="px-3 py-2 bg-[var(--positive)]/10 border border-[var(--positive)]/30 rounded-lg text-sm text-[var(--positive)]">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !!success}
            className="w-full py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Envoi...' : 'Envoyer le lien'}
          </button>
        </form>
      </div>
    </div>
  )
}
