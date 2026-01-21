'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          backgroundColor: '#07070a',
          color: '#f0f0f0'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#ff4757' }}>
            Erreur critique
          </h2>
          <p style={{ color: '#8a8a94', marginBottom: '1.5rem' }}>Une erreur inattendue s&apos;est produite. Veuillez recharger la page.</p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#00dc82',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
