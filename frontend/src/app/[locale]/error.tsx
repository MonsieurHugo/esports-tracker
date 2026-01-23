'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { logError } from '@/lib/logger'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    logError('Application error', error, { digest: error.digest })
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold mb-4 text-(--negative)">{t('errorOccurred')}</h2>
      <p className="text-(--text-muted) mb-6">
        {t('unexpectedError')}
      </p>
      {error.digest && (
        <p className="text-xs text-(--text-muted) mb-4">
          {t('errorCode')}: {error.digest}
        </p>
      )}
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-(--accent) text-white rounded-lg hover:bg-(--accent-hover) transition-colors"
      >
        {t('retry')}
      </button>
    </div>
  )
}
