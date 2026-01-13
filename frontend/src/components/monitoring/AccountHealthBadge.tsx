'use client'

import type { AccountHealthStatus } from '@/lib/types'

interface AccountHealthBadgeProps {
  status: AccountHealthStatus
  size?: 'sm' | 'md'
  showLabel?: boolean
}

const STATUS_CONFIG: Record<
  AccountHealthStatus,
  { color: string; bgColor: string; label: string }
> = {
  fresh: {
    color: 'var(--accent)',
    bgColor: 'var(--accent)',
    label: 'Frais',
  },
  normal: {
    color: '#3b82f6',
    bgColor: '#3b82f6',
    label: 'Normal',
  },
  stale: {
    color: 'var(--warning)',
    bgColor: 'var(--warning)',
    label: 'Ancien',
  },
  critical: {
    color: 'var(--negative)',
    bgColor: 'var(--negative)',
    label: 'Critique',
  },
}

export default function AccountHealthBadge({
  status,
  size = 'sm',
  showLabel = false,
}: AccountHealthBadgeProps) {
  const config = STATUS_CONFIG[status]
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'

  if (showLabel) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex rounded-full ${dotSize}`}
          style={{ backgroundColor: config.bgColor }}
        />
        <span
          className="text-[10px] font-medium"
          style={{ color: config.color }}
        >
          {config.label}
        </span>
      </div>
    )
  }

  return (
    <span
      className={`inline-flex rounded-full ${dotSize}`}
      style={{ backgroundColor: config.bgColor }}
      title={config.label}
    />
  )
}
