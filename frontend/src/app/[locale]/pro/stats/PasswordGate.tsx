'use client'

import { useState, type FormEvent } from 'react'
import api, { ApiError } from '@/lib/api'

interface PasswordGateProps {
  onSuccess: () => void
}

export default function PasswordGate({ onSuccess }: PasswordGateProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      await api.post('/pro/stats/verify-password', { password })
      localStorage.setItem('proStatsUnlocked', 'true')
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError && err.isForbidden) {
        setError('Mot de passe incorrect')
      } else {
        setError('Erreur de connexion')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-(--text-primary) mb-2">Pro Stats</h1>
          <p className="text-sm text-(--text-muted)">
            Entrez le mot de passe pour acceder aux statistiques pro
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-(--text-primary) placeholder:text-(--text-muted) font-mono text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
              autoFocus
              disabled={isLoading}
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--negative)] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="w-full py-3 bg-[var(--accent)] text-black font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isLoading ? 'Verification...' : 'Acceder'}
          </button>
        </form>
      </div>
    </div>
  )
}
