'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/lib/auth'

type LoginStep = 'credentials' | '2fa'

interface LoginError extends Error {
  attemptsRemaining?: number
  lockedUntil?: string
  requires2FA?: boolean
  userId?: number
  status?: number
}

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()

  const [step, setStep] = useState<LoginStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setWarning('')
    setIsLoading(true)

    try {
      await login(email, password)
      router.push('/admin/players')
    } catch (err) {
      const error = err as LoginError

      // Handle 2FA required
      if (error.requires2FA) {
        setStep('2fa')
        return
      }

      // Handle account locked
      if (error.status === 423 && error.lockedUntil) {
        const lockedDate = new Date(error.lockedUntil)
        setError(`Compte verrouille. Reessayez apres ${lockedDate.toLocaleTimeString()}`)
        return
      }

      // Handle attempts remaining warning
      if (error.attemptsRemaining !== undefined && error.attemptsRemaining <= 2) {
        setWarning(`Attention: ${error.attemptsRemaining} tentative(s) restante(s) avant verrouillage`)
      }

      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      if (useRecoveryCode) {
        await login(email, password, undefined, recoveryCode)
      } else {
        await login(email, password, twoFactorCode)
      }
      router.push('/admin/players')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthLogin = (provider: 'google' | 'github' | 'discord') => {
    window.location.href = authApi.getOAuthUrl(provider)
  }

  const handleBackToCredentials = () => {
    setStep('credentials')
    setTwoFactorCode('')
    setRecoveryCode('')
    setUseRecoveryCode(false)
    setError('')
  }

  // 2FA Step
  if (step === '2fa') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
        <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
          <button
            type="button"
            onClick={handleBackToCredentials}
            className="mb-4 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            &larr; Retour
          </button>

          <h1 className="text-xl font-semibold text-center mb-2">Verification 2FA</h1>
          <p className="text-sm text-[var(--text-muted)] text-center mb-6">
            {useRecoveryCode
              ? 'Entrez un code de recuperation'
              : 'Entrez le code de votre application authenticator'}
          </p>

          <form onSubmit={handle2FASubmit} className="space-y-4">
            {useRecoveryCode ? (
              <div>
                <label
                  htmlFor="recoveryCode"
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Code de recuperation
                </label>
                <input
                  id="recoveryCode"
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  required
                  autoComplete="off"
                  placeholder="XXXX-XXXX"
                  className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors font-mono text-center tracking-wider"
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor="twoFactorCode"
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Code 2FA
                </label>
                <input
                  id="twoFactorCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors font-mono text-center text-2xl tracking-widest"
                />
              </div>
            )}

            {error && (
              <div className="px-3 py-2 bg-[var(--negative)]/10 border border-[var(--negative)]/30 rounded-lg text-sm text-[var(--negative)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || (!useRecoveryCode && twoFactorCode.length !== 6)}
              className="w-full py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Verification...' : 'Verifier'}
            </button>

            <button
              type="button"
              onClick={() => {
                setUseRecoveryCode(!useRecoveryCode)
                setError('')
              }}
              className="w-full text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {useRecoveryCode
                ? 'Utiliser le code authenticator'
                : 'Utiliser un code de recuperation'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Credentials Step
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-sm p-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
        <h1 className="text-xl font-semibold text-center mb-6">Connexion</h1>

        {/* OAuth Buttons */}
        <div className="space-y-3 mb-6">
          <button
            type="button"
            onClick={() => handleOAuthLogin('google')}
            className="w-full flex items-center justify-center gap-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Continuer avec Google</span>
          </button>

          <button
            type="button"
            onClick={() => handleOAuthLogin('github')}
            className="w-full flex items-center justify-center gap-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"
              />
            </svg>
            <span>Continuer avec GitHub</span>
          </button>

          <button
            type="button"
            onClick={() => handleOAuthLogin('discord')}
            className="w-full flex items-center justify-center gap-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            <span>Continuer avec Discord</span>
          </button>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border)]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[var(--bg-card)] text-[var(--text-muted)]">
              ou par email
            </span>
          </div>
        </div>

        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
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
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="********"
            />
          </div>

          {warning && (
            <div className="px-3 py-2 bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-lg text-sm text-[var(--warning)]">
              {warning}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-[var(--negative)]/10 border border-[var(--negative)]/30 rounded-lg text-sm text-[var(--negative)]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
          >
            Mot de passe oublie?
          </Link>
        </div>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Pas encore de compte?{' '}
          <Link href="/register" className="text-[var(--accent)] hover:underline">
            Creer un compte
          </Link>
        </p>
      </div>
    </div>
  )
}
