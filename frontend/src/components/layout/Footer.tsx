export function Footer() {
  return (
    <footer className="border-t border-(--border) py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-(--muted)">
            Esports Tracker - Suivi des stats SoloQ des joueurs professionnels
          </p>
          <p className="text-sm text-(--muted)">
            Donnees fournies par Riot Games API
          </p>
        </div>
      </div>
    </footer>
  )
}
