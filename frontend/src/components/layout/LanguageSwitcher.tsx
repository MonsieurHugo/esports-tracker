'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { useTransition } from 'react'

const localeNames: Record<string, string> = {
  fr: 'FR',
  en: 'EN',
}

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const handleLocaleChange = (newLocale: string) => {
    if (newLocale === locale) return
    startTransition(() => {
      router.replace(pathname, { locale: newLocale })
    })
  }

  return (
    <div className="flex items-center gap-0.5 bg-(--bg-card) border border-(--border) rounded-md p-0.5">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => handleLocaleChange(l)}
          disabled={isPending}
          className={`
            px-2 py-1 rounded text-[10px] font-medium transition-all
            ${locale === l
              ? 'bg-(--accent) text-(--bg-primary)'
              : 'text-(--text-muted) hover:text-(--text-secondary)'
            }
            ${isPending ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {localeNames[l] || l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
