import { memo } from 'react'

interface TeamValue {
  value: string | number
  change?: number
}

interface StatCardProps {
  label: string
  // Mode simple (1 équipe ou global)
  value?: string | number
  change?: number
  changeUnit?: string
  // Mode comparaison (2 équipes)
  teams?: TeamValue[]
}

function StatCard({ label, value, change, changeUnit = '%', teams }: StatCardProps) {
  const isPositive = change !== undefined && change >= 0

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4 h-[88px] flex flex-col">
      <div className="text-[11px] text-(--text-muted) uppercase tracking-wider mb-auto">
        {label}
      </div>

      {/* Mode comparaison : 2 équipes */}
      {teams && teams.length === 2 ? (
        <div className="flex flex-col gap-0.5">
          {teams.map((team, index) => {
            const teamIsPositive = team.change !== undefined && team.change >= 0
            return (
              <div key={index} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: index === 0 ? 'var(--accent)' : 'var(--lol)' }}
                />
                <span className="font-mono text-base font-bold leading-none flex-1">
                  {typeof team.value === 'number' ? team.value.toLocaleString('fr-FR') : team.value}
                </span>
                {team.change !== undefined && (
                  <span className={`text-[9px] font-medium ${teamIsPositive ? 'text-(--positive)' : 'text-(--negative)'}`}>
                    {teamIsPositive ? '↑' : '↓'}{Math.abs(team.change).toLocaleString('fr-FR')}{changeUnit}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Mode simple : 1 équipe ou stats globales */
        <>
          <div className="font-mono text-2xl font-bold leading-none">
            {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
          </div>
          <div
            className={`text-[10px] font-medium h-4 ${
              change !== undefined
                ? isPositive ? 'text-(--positive)' : 'text-(--negative)'
                : 'opacity-0'
            }`}
          >
            {change !== undefined && (
              <>
                {isPositive ? '↑' : '↓'} {Math.abs(change).toLocaleString('fr-FR')}{changeUnit}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default memo(StatCard)
