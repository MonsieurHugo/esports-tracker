'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

export default function NotFound() {
  const t = useTranslations('errors')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h2 className="text-4xl font-bold mb-4">404</h2>
      <p className="text-(--text-muted) mb-6">{t('pageNotFound')}</p>
      <Link
        href="/"
        className="px-4 py-2 bg-(--accent) text-white rounded-lg hover:bg-(--accent-hover) transition-colors"
      >
        {t('backToHome')}
      </Link>
    </div>
  )
}
