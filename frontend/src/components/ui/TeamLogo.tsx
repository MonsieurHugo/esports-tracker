'use client'

import { memo, useState, useEffect } from 'react'
import Image from 'next/image'

interface TeamLogoProps {
  slug: string
  shortName: string
  size?: number
  className?: string
}

function TeamLogo({ slug, shortName, size = 20, className = '' }: TeamLogoProps) {
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [slug])

  if (error || !slug) {
    return (
      <div
        className={`bg-[var(--bg-secondary)] rounded flex-shrink-0 flex items-center justify-center text-[7px] font-semibold text-[var(--text-muted)] ${className}`}
        style={{ width: size, height: size }}
      >
        {shortName.substring(0, 2)}
      </div>
    )
  }

  return (
    <Image
      src={`/images/teams/${slug}.png`}
      alt={shortName}
      width={size}
      height={size}
      className={`object-contain flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  )
}

export default memo(TeamLogo)
