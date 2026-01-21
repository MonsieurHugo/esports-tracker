/**
 * Script to rename team images from slug to shortName format
 *
 * Usage: node scripts/rename-team-images.mjs
 *
 * Prerequisites:
 * - Backend must be running on localhost:3333
 * - Run from the frontend directory
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const IMAGES_DIR = path.join(__dirname, '../public/images/teams')
const API_URL = 'http://localhost:3333/api/v1/lol/dashboard/teams?perPage=100'

async function fetchTeamsMapping() {
  console.log('Fetching teams from API...')

  try {
    const response = await fetch(API_URL)
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const data = await response.json()

    // Create a mapping of slug -> shortName (lowercase)
    const mapping = {}
    for (const entry of data.data) {
      if (entry.team && entry.team.slug && entry.team.shortName) {
        mapping[entry.team.slug] = entry.team.shortName.toLowerCase()
      }
    }

    return mapping
  } catch (error) {
    console.error('Failed to fetch teams from API:', error.message)
    console.log('\nMake sure the backend is running on localhost:3333')
    process.exit(1)
  }
}

function renameImages(mapping) {
  console.log('\nRenaming images...')

  // Get all PNG files in the directory
  const files = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.png'))

  let renamed = 0
  let skipped = 0
  let notFound = 0

  for (const file of files) {
    const slug = file.replace('.png', '')
    const newName = mapping[slug]

    if (!newName) {
      console.log(`  [SKIP] ${file} - no mapping found for slug "${slug}"`)
      notFound++
      continue
    }

    const oldPath = path.join(IMAGES_DIR, file)
    const newPath = path.join(IMAGES_DIR, `${newName}.png`)

    if (oldPath === newPath) {
      console.log(`  [SAME] ${file} - already named correctly`)
      skipped++
      continue
    }

    if (fs.existsSync(newPath)) {
      console.log(`  [EXISTS] ${file} -> ${newName}.png already exists, skipping`)
      skipped++
      continue
    }

    try {
      fs.renameSync(oldPath, newPath)
      console.log(`  [OK] ${file} -> ${newName}.png`)
      renamed++
    } catch (error) {
      console.error(`  [ERROR] ${file}: ${error.message}`)
    }
  }

  console.log(`\nSummary:`)
  console.log(`  Renamed: ${renamed}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Not found: ${notFound}`)
}

async function main() {
  console.log('Team Image Rename Script')
  console.log('========================\n')

  // Check if images directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`Images directory not found: ${IMAGES_DIR}`)
    process.exit(1)
  }

  // Fetch mapping from API
  const mapping = await fetchTeamsMapping()
  console.log(`Found ${Object.keys(mapping).length} teams in database`)

  // Show mapping
  console.log('\nMapping (slug -> shortName):')
  for (const [slug, shortName] of Object.entries(mapping)) {
    console.log(`  ${slug} -> ${shortName}`)
  }

  // Rename images
  renameImages(mapping)
}

main()
