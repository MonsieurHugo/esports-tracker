'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { CreateUserPayload } from '@/lib/types'

interface UserCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateUserPayload) => Promise<void>
}

export function UserCreateModal({ isOpen, onClose, onSubmit }: UserCreateModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Email et mot de passe requis')
      return
    }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        email,
        password,
        fullName: fullName || undefined,
        role,
      })
      // Reset form
      setEmail('')
      setPassword('')
      setFullName('')
      setRole('user')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setError(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nouvel utilisateur" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-3 py-2 bg-(--negative)/10 border border-(--negative)/30 rounded-md text-sm text-(--negative)">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-(--text-secondary) mb-1">
            Email *
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-(--bg-secondary) border border-(--border) rounded-md px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:border-(--accent)"
            placeholder="utilisateur@exemple.com"
            required
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-(--text-secondary) mb-1"
          >
            Mot de passe *
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-(--bg-secondary) border border-(--border) rounded-md px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:border-(--accent)"
            placeholder="Minimum 8 caractères"
            minLength={8}
            required
          />
        </div>

        <div>
          <label
            htmlFor="fullName"
            className="block text-sm font-medium text-(--text-secondary) mb-1"
          >
            Nom complet
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full bg-(--bg-secondary) border border-(--border) rounded-md px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:border-(--accent)"
            placeholder="John Doe"
          />
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-(--text-secondary) mb-1">
            Rôle
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
            className="w-full bg-(--bg-secondary) border border-(--border) rounded-md px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:border-(--accent)"
          >
            <option value="user">Utilisateur</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-(--border)">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-md border border-(--border) text-(--text-secondary) hover:bg-(--bg-hover) transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm rounded-md bg-(--accent) text-black font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isSubmitting ? 'Création...' : 'Créer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
