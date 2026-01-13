'use client'

import { useState, useEffect, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/lib/auth'
import TwoFactorSetup from '@/components/auth/TwoFactorSetup'

interface OAuthAccount {
  provider: string
  email: string | null
  linkedAt: string
}

export default function SecuritySettingsPage() {
  const router = useRouter()
  const { user, isLoading, isAuthenticated, refreshUser } = useAuth()
  const [oauthAccounts, setOauthAccounts] = useState<OAuthAccount[]>([])
  const [loadingOAuth, setLoadingOAuth] = useState(true)

  // Password change form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isLoading, isAuthenticated, router])

  useEffect(() => {
    async function loadOAuthAccounts() {
      try {
        const result = await authApi.getOAuthAccounts()
        setOauthAccounts(result.accounts)
      } catch {
        // Silent fail - linked accounts section will show empty
      } finally {
        setLoadingOAuth(false)
      }
    }

    if (isAuthenticated) {
      loadOAuthAccounts()
    }
  }, [isAuthenticated])

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordError('Les mots de passe ne correspondent pas')
      return
    }

    setPasswordLoading(true)

    try {
      await authApi.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        passwordForm.confirmNewPassword
      )
      setPasswordSuccess('Mot de passe mis a jour')
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Erreur lors du changement')
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleUnlinkOAuth = async (provider: string) => {
    if (!confirm(`Voulez-vous vraiment delier votre compte ${provider}?`)) {
      return
    }

    try {
      await authApi.unlinkOAuth(provider)
      setOauthAccounts((prev) => prev.filter((a) => a.provider !== provider))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la dissociation')
    }
  }

  const handleLinkOAuth = (provider: 'google' | 'github' | 'discord') => {
    window.location.href = authApi.getOAuthUrl(provider)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--accent)]"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const providerIcons: Record<string, ReactElement> = {
    google: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    github: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
      </svg>
    ),
    discord: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  }

  const allProviders = ['google', 'github', 'discord'] as const
  const linkedProviders = oauthAccounts.map((a) => a.provider)

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/admin/players"
          className="inline-block mb-6 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          &larr; Retour au dashboard
        </Link>

        <h1 className="text-2xl font-semibold mb-8">Parametres de securite</h1>

        {/* Two-Factor Authentication */}
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">Authentification a deux facteurs</h2>
          <TwoFactorSetup isEnabled={user.twoFactorEnabled} onUpdate={refreshUser} />
        </section>

        {/* Password Change */}
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">Changer le mot de passe</h2>
          <div className="p-6 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl">
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label
                  htmlFor="currentPassword"
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Mot de passe actuel
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                  }
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Nouveau mot de passe
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                  }
                  required
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmNewPassword"
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Confirmer le nouveau mot de passe
                </label>
                <input
                  id="confirmNewPassword"
                  type="password"
                  value={passwordForm.confirmNewPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, confirmNewPassword: e.target.value }))
                  }
                  required
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              {passwordError && (
                <div className="px-3 py-2 bg-[var(--negative)]/10 border border-[var(--negative)]/30 rounded-lg text-sm text-[var(--negative)]">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="px-3 py-2 bg-[var(--positive)]/10 border border-[var(--positive)]/30 rounded-lg text-sm text-[var(--positive)]">
                  {passwordSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={passwordLoading}
                className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                {passwordLoading ? 'Changement...' : 'Changer le mot de passe'}
              </button>
            </form>
          </div>
        </section>

        {/* OAuth Accounts */}
        <section>
          <h2 className="text-lg font-medium mb-4">Comptes lies</h2>
          <div className="p-6 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl space-y-4">
            {loadingOAuth ? (
              <div className="text-center py-4 text-[var(--text-muted)]">Chargement...</div>
            ) : (
              allProviders.map((provider) => {
                const isLinked = linkedProviders.includes(provider)
                const account = oauthAccounts.find((a) => a.provider === provider)

                return (
                  <div
                    key={provider}
                    className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      {providerIcons[provider]}
                      <div>
                        <p className="font-medium capitalize">{provider}</p>
                        {account && (
                          <p className="text-xs text-[var(--text-muted)]">{account.email}</p>
                        )}
                      </div>
                    </div>

                    {isLinked ? (
                      <button
                        onClick={() => handleUnlinkOAuth(provider)}
                        className="px-3 py-1.5 text-sm text-[var(--negative)] border border-[var(--negative)]/30 rounded-lg hover:bg-[var(--negative)]/10 transition-colors"
                      >
                        Delier
                      </button>
                    ) : (
                      <button
                        onClick={() => handleLinkOAuth(provider)}
                        className="px-3 py-1.5 text-sm text-[var(--accent)] border border-[var(--accent)]/30 rounded-lg hover:bg-[var(--accent)]/10 transition-colors"
                      >
                        Lier
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
