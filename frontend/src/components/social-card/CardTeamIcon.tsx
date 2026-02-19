import { sanitizeSlug } from '@/lib/utils'

export function CardTeamIcon({ name, fullName, size }: { name: string; fullName?: string | null; size: number }) {
  const primarySrc = fullName
    ? `/images/teams/${sanitizeSlug(fullName)}.png`
    : `/images/teams/${sanitizeSlug(name)}.png`
  const fallbackSrc = fullName
    ? `/images/teams/${sanitizeSlug(name)}.png`
    : null

  return (
    <img
      src={primarySrc}
      alt={name}
      width={size}
      height={size}
      style={{ borderRadius: 4, objectFit: 'contain' }}
      onError={(e) => {
        if (fallbackSrc && !e.currentTarget.dataset.fallback) {
          e.currentTarget.dataset.fallback = '1'
          e.currentTarget.src = fallbackSrc
        } else {
          e.currentTarget.style.display = 'none'
        }
      }}
    />
  )
}
