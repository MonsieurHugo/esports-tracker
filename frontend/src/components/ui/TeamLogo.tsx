'use client'

import { memo, useState, useEffect } from 'react'
import Image from 'next/image'
import { sanitizeSlug } from '@/lib/utils'

interface TeamLogoProps {
  slug: string
  shortName: string
  name?: string | null
  size?: number
  className?: string
}

type Source = 'name' | 'short' | 'fallback'

function TeamLogo({ slug, shortName, name, size = 20, className = '' }: TeamLogoProps) {
  const [source, setSource] = useState<Source>(name ? 'name' : 'short')

  useEffect(() => {
    setSource(name ? 'name' : 'short')
  }, [name, shortName])

  if (source === 'fallback' || !shortName) {
    return (
      <div
        className={`bg-(--bg-secondary) rounded-sm shrink-0 flex items-center justify-center text-[7px] font-semibold text-(--text-muted) ${className}`}
        style={{ width: size, height: size }}
      >
        {shortName.substring(0, 2)}
      </div>
    )
  }

  const src = source === 'name' && name
    ? `/images/teams/${sanitizeSlug(name)}.png`
    : `/images/teams/${sanitizeSlug(shortName)}.png`

  return (
    <Image
      src={src}
      alt={shortName}
      width={size}
      height={size}
      className={`object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => {
        if (source === 'name') {
          setSource('short')
        } else {
          setSource('fallback')
        }
      }}
    />
  )
}

export default memo(TeamLogo)
