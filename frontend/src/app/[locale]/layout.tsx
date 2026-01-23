import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { Footer } from '@/components/layout/Footer'
import { ToastContainerWrapper } from '@/components/ui/ToastContainerWrapper'
import { ThemeProvider } from '@/components/ThemeProvider'

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params

  const titles: Record<string, string> = {
    fr: 'Esports Tracker',
    en: 'Esports Tracker',
  }

  const descriptions: Record<string, string> = {
    fr: 'Suivi des statistiques SoloQ des joueurs professionnels',
    en: 'Track SoloQ statistics of professional players',
  }

  return {
    title: titles[locale] || titles.fr,
    description: descriptions[locale] || descriptions.fr,
  }
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params

  // Validate that the locale is supported
  if (!routing.locales.includes(locale as 'fr' | 'en')) {
    notFound()
  }

  // Enable static rendering
  setRequestLocale(locale)

  // Get messages for the current locale
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <ThemeProvider>
        <main className="flex-1">{children}</main>
        <Footer />
        <ToastContainerWrapper />
      </ThemeProvider>
    </NextIntlClientProvider>
  )
}
