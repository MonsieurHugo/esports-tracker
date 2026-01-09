'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold mb-4 text-[var(--negative)]">Une erreur est survenue</h2>
      <p className="text-[var(--text-muted)] mb-6">{error.message}</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
      >
        Réessayer
      </button>
    </div>
  )
}
