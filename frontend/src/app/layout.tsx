import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Footer } from '@/components/layout/Footer'
import { ToastContainerWrapper } from '@/components/ui/ToastContainerWrapper'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Esports Tracker',
  description: 'Suivi des statistiques SoloQ des joueurs professionnels',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased font-sans bg-(--bg-primary) text-(--text-primary) flex flex-col">
        <main className="flex-1">{children}</main>
        <Footer />
        <ToastContainerWrapper />
      </body>
    </html>
  )
}
