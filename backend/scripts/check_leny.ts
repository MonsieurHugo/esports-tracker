import db from '@adonisjs/lucid/services/db'

async function main() {
  // Chercher Leny
  const player = await db.from('players').where('current_pseudo', 'ilike', '%leny%').first()
  console.log('=== PLAYER ===')
  console.log(JSON.stringify(player, null, 2))

  if (player) {
    // Contrats
    const contracts = await db.from('player_contracts').where('player_id', player.player_id).orderBy('created_at', 'desc')
    console.log('\n=== CONTRACTS ===')
    console.log(JSON.stringify(contracts, null, 2))

    // Comptes LoL
    const accounts = await db.from('lol_accounts').where('player_id', player.player_id)
    console.log('\n=== LOL ACCOUNTS ===')
    console.log(JSON.stringify(accounts, null, 2))

    // Daily stats
    const puuids = accounts.map((a: any) => a.puuid).filter((p: any) => p)
    if (puuids.length > 0) {
      const stats = await db.from('lol_daily_stats').whereIn('puuid', puuids).orderBy('date', 'desc').limit(10)
      console.log('\n=== DAILY STATS ===')
      console.log(JSON.stringify(stats, null, 2))

      // Current ranks
      const ranks = await db.from('lol_current_ranks').whereIn('puuid', puuids)
      console.log('\n=== CURRENT RANKS ===')
      console.log(JSON.stringify(ranks, null, 2))
    } else {
      console.log('\n=== NO PUUID - accounts need validation ===')
    }
  } else {
    console.log('Player not found')
  }

  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
