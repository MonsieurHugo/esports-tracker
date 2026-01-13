'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { adminApi } from '@/lib/auth'
import type { AdminUser, UserRoleFilter } from '@/lib/types'
import { UserFilters } from '@/components/admin/UserFilters'
import { UserRow } from '@/components/admin/UserRow'
import { UserCreateModal } from '@/components/admin/UserCreateModal'
import { Modal } from '@/components/ui/Modal'

export const dynamic = 'force-dynamic'

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()

  // State
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>('all')

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null)

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await adminApi.getUsers({
        search: searchQuery || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
      })
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement')
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, roleFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (debouncedSearch !== searchQuery) return
    fetchUsers()
  }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers
  const handleCreateUser = async (data: {
    email: string
    password: string
    fullName?: string
    role?: 'user' | 'admin'
  }) => {
    await adminApi.createUser(data)
    await fetchUsers()
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return
    try {
      await adminApi.deleteUser(userToDelete.id)
      setUserToDelete(null)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    }
  }

  const handleUnlockUser = async (userId: number) => {
    try {
      await adminApi.unlockUser(userId)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du déverrouillage')
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold">Gestion des utilisateurs</h1>
        <p className="text-sm text-(--text-muted) mt-1">
          {users.length} utilisateur{users.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-(--negative)/10 border border-(--negative)/30 rounded-lg text-sm text-(--negative)">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline hover:no-underline"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Filters */}
      <UserFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        roleFilter={roleFilter}
        onRoleChange={setRoleFilter}
        onCreateClick={() => setIsCreateModalOpen(true)}
      />

      {/* Table */}
      <div className="bg-(--bg-card) border border-(--border) rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-(--bg-secondary) border-b border-(--border)">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Email</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Nom</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Rôle</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Statut</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-muted)">
                  Dernière connexion
                </th>
                <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-(--text-muted)">
                    Chargement...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-(--text-muted)">
                    Aucun utilisateur trouvé
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    currentUserId={currentUser?.id}
                    onDelete={setUserToDelete}
                    onUnlock={handleUnlockUser}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <UserCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateUser}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        title="Supprimer l'utilisateur ?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-(--text-secondary)">
            Êtes-vous sûr de vouloir supprimer{' '}
            <span className="font-medium text-(--text-primary)">{userToDelete?.email}</span> ?
          </p>
          <p className="text-xs text-(--text-muted)">Cette action est irréversible.</p>
          <div className="flex justify-end gap-3 pt-4 border-t border-(--border)">
            <button
              onClick={() => setUserToDelete(null)}
              className="px-4 py-2 text-sm rounded-md border border-(--border) text-(--text-secondary) hover:bg-(--bg-hover) transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleDeleteUser}
              className="px-4 py-2 text-sm rounded-md bg-(--negative) text-white font-medium hover:opacity-90 transition-opacity"
            >
              Supprimer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
