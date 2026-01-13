'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import type { AdminUser } from '@/lib/types'

interface UserRowProps {
  user: AdminUser
  currentUserId: number | undefined
  onDelete: (user: AdminUser) => void
  onUnlock: (userId: number) => Promise<void>
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return "à l'instant"
  if (diffMin < 60) return `il y a ${diffMin} min`
  if (diffHour < 24) return `il y a ${diffHour}h`
  if (diffDay < 7) return `il y a ${diffDay}j`
  if (diffDay < 30) return `il y a ${Math.floor(diffDay / 7)} sem.`
  if (diffDay < 365) return `il y a ${Math.floor(diffDay / 30)} mois`
  return `il y a ${Math.floor(diffDay / 365)} an(s)`
}

export function UserRow({ user, currentUserId, onDelete, onUnlock }: UserRowProps) {
  const [isUnlocking, setIsUnlocking] = useState(false)

  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date()
  const isSelf = user.id === currentUserId

  const handleUnlock = async () => {
    setIsUnlocking(true)
    try {
      await onUnlock(user.id)
    } finally {
      setIsUnlocking(false)
    }
  }

  const formatLastLogin = (date: string | null) => {
    if (!date) return 'Jamais'
    return formatRelativeTime(date)
  }

  return (
    <tr className="border-b border-(--border) hover:bg-(--bg-hover)">
      {/* Email */}
      <td className="px-4 py-3 text-sm text-(--text-primary)">{user.email}</td>

      {/* Nom */}
      <td className="px-4 py-3 text-sm text-(--text-muted)">{user.fullName || '-'}</td>

      {/* Rôle */}
      <td className="px-4 py-3">
        <Badge variant={user.role === 'admin' ? 'default' : 'outline-solid'}>
          {user.role === 'admin' ? 'Admin' : 'User'}
        </Badge>
      </td>

      {/* Statut */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {user.emailVerified ? (
            <Badge variant="success">Vérifié</Badge>
          ) : (
            <Badge variant="outline-solid">Non vérifié</Badge>
          )}
          {user.twoFactorEnabled && <Badge variant="success">2FA</Badge>}
          {isLocked && <Badge variant="danger">Verrouillé</Badge>}
        </div>
      </td>

      {/* Dernière connexion */}
      <td className="px-4 py-3 text-sm text-(--text-muted)">{formatLastLogin(user.lastLoginAt)}</td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex gap-2">
          {isLocked && (
            <button
              onClick={handleUnlock}
              disabled={isUnlocking}
              className="px-3 py-1 text-xs rounded-md border border-(--accent) text-(--accent) hover:bg-(--accent)/10 disabled:opacity-50 transition-colors"
            >
              {isUnlocking ? '...' : 'Déverrouiller'}
            </button>
          )}
          <button
            onClick={() => onDelete(user)}
            disabled={isSelf}
            title={isSelf ? 'Vous ne pouvez pas vous supprimer' : 'Supprimer'}
            className="px-3 py-1 text-xs rounded-md border border-(--negative) text-(--negative) hover:bg-(--negative)/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Supprimer
          </button>
        </div>
      </td>
    </tr>
  )
}
