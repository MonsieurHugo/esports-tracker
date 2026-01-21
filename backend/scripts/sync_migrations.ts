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

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

async function main() {
  const client = new pg.Client({
    host: getRequiredEnv('DB_HOST'),
    port: parseInt(getRequiredEnv('DB_PORT')),
    user: getRequiredEnv('DB_USER'),
    password: getRequiredEnv('DB_PASSWORD'),
    database: getRequiredEnv('DB_DATABASE'),
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
      console.log('\n⚠️  Make sure the database is accessible at the configured host and port')
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
