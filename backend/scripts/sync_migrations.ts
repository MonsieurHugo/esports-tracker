/**
 * Script to sync adonis_schema table with existing database state.
 * Run with: node --import=tsx scripts/sync_migrations.ts
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// @ts-ignore - pg types
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    user: process.env.DB_USER || 'monsieuryordle',
    password: process.env.DB_PASSWORD || 'WpvN27rH1dSYYUdpxWM2hHtz',
    database: process.env.DB_DATABASE || 'esports',
  })

  try {
    console.log('Connecting to database...')
    await client.connect()
    console.log('Connected!')

    const sqlPath = join(__dirname, 'sync_migrations.sql')
    const sql = readFileSync(sqlPath, 'utf-8')

    console.log('Running sync_migrations.sql...')
    await client.query(sql)

    console.log('\nMigrations synced successfully!')
    console.log('Current adonis_schema contents:')

    // Get the final SELECT result
    const schemaResult = await client.query('SELECT * FROM adonis_schema ORDER BY id')
    console.table(schemaResult.rows)
  } catch (error: any) {
    console.error('Error:', error.message)
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n⚠️  Make sure the SSH tunnel is active:')
      console.log('   ssh -L 5433:127.0.0.1:5432 root@monsieuryordle.com')
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
