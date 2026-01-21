/**
 * Script to rename team images from old naming to short name format
 *
 * Usage: node scripts/rename-team-images-manual.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const IMAGES_DIR = path.join(__dirname, '../public/images/teams')

// Manual mapping: old filename (without .png) -> new filename (without .png)
const RENAME_MAP = {
  'karmine-corp': 'kc',
  'karmine-corp-blue': 'kcb',
  'g2-esports': 'g2',
  'fnatic': 'fnc',
  'team-vitality': 'vit',
  'vitality-bee': 'vitb',
  'team-heretics': 'th',
  'sk-gaming': 'sk',
  'giantx': 'gx',
  'bk-rog-esports': 'bkr',
  'bnk-fearx': 'fox',
  'dplus-kia': 'dk',
  'dn-freecs': 'dnf',
  'hanwha-life': 'hle',
  'kt-rolster': 'kt',
  'ns-redforce': 'ns',
  'ok-brion': 'bro',
  'gen-g (1)': 'geng',
  'natus-vincere': 'navi',
  'movistar-koi': 'mkoi',
  'los-ratones': 'lr',
  'solary': 'sly',
  'joblife': 'jl',
  'shifters': 'shft',
  'galions': 'gl',
  'lille-esports': 'lll',
  'french-flair': 'cfo',
  'esprit-shonen': 'shg',
  'ici-japon-corp': 'dcg',
  'div2': 'div2',
  'pcs': 'pcs',
  'zyb': 'zyb',
}

function renameImages() {
  console.log('Team Image Rename Script (Manual Mapping)')
  console.log('=========================================\n')

  // Check if images directory exists
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`Images directory not found: ${IMAGES_DIR}`)
    process.exit(1)
  }

  // Get all PNG files in the directory
  const files = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.png'))

  console.log(`Found ${files.length} image files\n`)
  console.log('Renaming images...\n')

  let renamed = 0
  let skipped = 0
  let notFound = 0

  for (const file of files) {
    const oldName = file.replace('.png', '')
    const newName = RENAME_MAP[oldName]

    if (!newName) {
      console.log(`  [SKIP] ${file} - no mapping defined`)
      notFound++
      continue
    }

    const oldPath = path.join(IMAGES_DIR, file)
    const newPath = path.join(IMAGES_DIR, `${newName}.png`)

    if (oldName === newName) {
      console.log(`  [SAME] ${file} - already named correctly`)
      skipped++
      continue
    }

    if (fs.existsSync(newPath)) {
      console.log(`  [EXISTS] ${file} -> ${newName}.png already exists`)
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

  console.log(`\n=========================================`)
  console.log(`Summary:`)
  console.log(`  Renamed: ${renamed}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  No mapping: ${notFound}`)
}

renameImages()
