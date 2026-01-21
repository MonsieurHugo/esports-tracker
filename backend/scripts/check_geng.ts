import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'

await app.boot()

const contracts = await db.from('player_contracts as pc')
  .join('players as p', 'pc.player_id', 'p.player_id')
  .select('p.current_pseudo', 'pc.role', 'pc.start_date', 'pc.end_date')
  .where('pc.team_id', 162)
  .orderByRaw('pc.end_date DESC NULLS FIRST')

console.log('Contrats Gen.G (team_id=162):')
console.log('-'.repeat(60))
for (const c of contracts) {
  const status = c.end_date ? 'TERMINE ' + c.end_date : 'ACTIF'
  const pseudo = (c.current_pseudo || 'Unknown').padEnd(20)
  const role = (c.role || 'N/A').padEnd(10)
  console.log(pseudo + ' | ' + role + ' | ' + status)
}
console.log('')
console.log('Total: ' + contracts.length + ' contrat(s)')

await db.manager.closeAll()
