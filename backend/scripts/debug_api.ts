import { Ignitor } from '@adonisjs/core'

const ignitor = new Ignitor(new URL('../', import.meta.url))

async function main() {
  const app = ignitor.createApp('console')
  await app.init()
  await app.boot()
  
  // Clear the cache to ensure fresh data
  const redis = await app.container.make('redis')
  await redis.flushall()
  console.log('Cache cleared')
  
  await app.terminate()
}

main().catch(console.error)
