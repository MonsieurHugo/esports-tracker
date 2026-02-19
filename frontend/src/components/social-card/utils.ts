export function fmtSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function shortenTournament(name: string): string {
  const splits: Record<string, string> = {
    spring: 'Spr',
    summer: 'Sum',
    winter: 'Win',
    fall: 'Fall',
    playoffs: 'PO',
  }
  let s = name.replace(/\bseason\b/gi, '').replace(/\s{2,}/g, ' ').trim()
  s = s.replace(/\b(20\d{2})\b/, (_, y: string) => `'${y.slice(2)}`)
  for (const [full, short] of Object.entries(splits)) {
    s = s.replace(new RegExp(`\\b${full}\\b`, 'i'), short)
  }
  return s.trim()
}
