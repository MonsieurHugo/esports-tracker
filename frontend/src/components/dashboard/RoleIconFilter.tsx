'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { VALID_ROLES } from '@/lib/constants'

interface RoleIconFilterProps {
  selected: string[]
  onToggle: (role: string) => void
  onSelectAll: () => void
}

export default function RoleIconFilter({
  selected,
  onToggle,
  onSelectAll,
}: RoleIconFilterProps) {
  const t = useTranslations()
  const isAllSelected = selected.length === 0 || selected.length === VALID_ROLES.length

  const isRoleSelected = (role: string) => {
    if (isAllSelected) return true
    return selected.includes(role)
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-[6px] bg-(--bg-card) border border-(--border) rounded-md">
      {/* All button */}
      <button
        onClick={onSelectAll}
        className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
          isAllSelected
            ? 'bg-(--accent) text-white'
            : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--bg-hover)'
        }`}
        title={t('filters.allRoles')}
      >
        ALL
      </button>

      <div className="w-px h-5 bg-(--border)" />

      {/* Role icons */}
      {VALID_ROLES.map((role) => {
        const isActive = isRoleSelected(role)

        return (
          <button
            key={role}
            onClick={() => onToggle(role)}
            className={`w-6 h-6 p-0.5 rounded transition-all ${
              isActive
                ? 'bg-(--accent)/20 ring-1 ring-(--accent)'
                : 'opacity-40 hover:opacity-70 hover:bg-(--bg-hover)'
            }`}
            title={role}
            style={{
              filter: isActive ? 'none' : 'grayscale(100%)',
            }}
          >
            <Image
              src={`/images/roles/${role}.png`}
              alt={role}
              width={20}
              height={20}
              className="w-full h-full object-contain"
            />
          </button>
        )
      })}
    </div>
  )
}
