'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { VALID_ROLES } from '@/lib/constants'

interface RoleDropdownProps {
  selected: string[]
  onToggle: (role: string) => void
  onSelectAll: () => void
}

const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'TOP': { bg: 'bg-(--role-top)/20', text: 'text-(--role-top)', dot: 'bg-(--role-top)' },
  'JGL': { bg: 'bg-(--role-jungle)/20', text: 'text-(--role-jungle)', dot: 'bg-(--role-jungle)' },
  'MID': { bg: 'bg-(--role-mid)/20', text: 'text-(--role-mid)', dot: 'bg-(--role-mid)' },
  'ADC': { bg: 'bg-(--role-adc)/20', text: 'text-(--role-adc)', dot: 'bg-(--role-adc)' },
  'SUP': { bg: 'bg-(--role-support)/20', text: 'text-(--role-support)', dot: 'bg-(--role-support)' },
}

export default function RoleDropdown({
  selected,
  onToggle,
  onSelectAll,
}: RoleDropdownProps) {
  const t = useTranslations()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isAllSelected = selected.length === 0 || selected.length === VALID_ROLES.length

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getButtonLabel = () => {
    if (isAllSelected) return t('filters.allRoles')
    if (selected.length === 1) return t(`roles.${selected[0]}`)
    return t('filters.nRoles', { count: selected.length })
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-full flex items-center justify-between gap-2 px-3 py-[8px] bg-(--bg-card) border border-(--border) rounded-md text-[11px] font-medium hover:border-(--text-muted) transition-colors min-w-[140px]"
      >
        <span>{getButtonLabel()}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-(--bg-card) border border-(--border) rounded-lg shadow-lg z-50 min-w-[140px] py-1">
          <button
            onClick={() => {
              onSelectAll()
            }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-(--bg-hover) transition-colors ${
              isAllSelected ? 'text-(--accent)' : 'text-(--text-secondary)'
            }`}
          >
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
              isAllSelected
                ? 'bg-(--accent) border-(--accent)'
                : 'border-(--border)'
            }`}>
              {isAllSelected && (
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            {t('common.all')}
          </button>

          <div className="h-px bg-(--border) my-1" />

          {VALID_ROLES.map((role) => {
            const isSelected = selected.includes(role) && !isAllSelected
            const colors = ROLE_COLORS[role]
            return (
              <button
                key={role}
                onClick={() => onToggle(role)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-(--bg-hover) transition-colors ${
                  isSelected ? 'text-(--accent)' : 'text-(--text-secondary)'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                  isSelected
                    ? 'bg-(--accent) border-(--accent)'
                    : 'border-(--border)'
                }`}>
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className={`w-2 h-2 rounded-full ${colors?.dot}`} />
                {t(`roles.${role}`)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
