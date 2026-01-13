'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/auth'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Le mot de passe doit contenir au moins 8 caracteres'
    }
    if (!/[A-Z]/.test(password)) {
      return 'Le mot de passe doit contenir au moins une majuscule'
    }
    if (!/[a-z]/.test(password)) {
      return 'Le mot de passe doit contenir au moins une minuscule'
    }
    if (!/[0-9]/.test(password)) {
      return 'Le mot de passe doit contenir au moins un chiffre'
    }
    if (!/[@$!%*?&]/.test(password)) {
      return 'Le mot de passe doit contenir au moins un caractere special (@$!%*?&)'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!token) {
      setError('Token manquant')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    const passwordError = validatePassword(formData.password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setIsLoading(true)

    try {
      await authApi.resetPassword(token, formData.password, formData.confirmPassword)
      setSuccess('Mot de passe reinitialise avec succes!')
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la reinitialisation')
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
        <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-center">
          <h1 className="text-xl font-semibold mb-4">Lien invalide</h1>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Ce lien de reinitialisation est invalide ou a expire.
          </p>
          <Link
            href="/forgot-password"
            className="text-[var(--accent)] hover:underline"
          >
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
        <h1 className="text-xl font-semibold text-center mb-2">Nouveau mot de passe</h1>
        <p className="text-sm text-[var(--text-muted)] text-center mb-6">
          Choisissez un nouveau mot de passe securise
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Nouveau mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="Min. 8 caracteres"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Majuscule, minuscule, chiffre et caractere special requis
            </p>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Confirmer le mot de passe
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="Confirmez votre mot de passe"
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
            {isLoading ? 'Reinitialisation...' : 'Reinitialiser le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--accent)]"></div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
