import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('meta')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-xl font-bold mb-4">{t('title')}</h1>
      <p className="text-sm text-(--text-muted) text-center max-w-md">
        {t('comingSoon')}
      </p>
    </main>
  )
}
