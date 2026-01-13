'use client'

import type { UserRoleFilter } from '@/lib/types'

interface UserFiltersProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  roleFilter: UserRoleFilter
  onRoleChange: (role: UserRoleFilter) => void
  onCreateClick: () => void
}

export function UserFilters({
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleChange,
  onCreateClick,
}: UserFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-5">
      <input
        type="text"
        placeholder="Rechercher par email ou nom..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="flex-1 bg-(--bg-card) border border-(--border) rounded-md px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-(--accent)"
      />

      <select
        value={roleFilter}
        onChange={(e) => onRoleChange(e.target.value as UserRoleFilter)}
        className="bg-(--bg-card) border border-(--border) rounded-md px-3 py-2 text-sm text-(--text-primary) min-w-[150px] focus:outline-none focus:border-(--accent)"
      >
        <option value="all">Tous les rôles</option>
        <option value="user">Utilisateurs</option>
        <option value="admin">Admins</option>
      </select>

      <button
        onClick={onCreateClick}
        className="px-4 py-2 bg-(--accent) text-black rounded-md text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
      >
        + Nouvel utilisateur
      </button>
    </div>
  )
}
