import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h2 className="text-4xl font-bold mb-4">404</h2>
      <p className="text-[var(--text-muted)] mb-6">Page non trouvée</p>
      <Link
        href="/"
        className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
      >
        Retour à l'accueil
      </Link>
    </div>
  )
}
