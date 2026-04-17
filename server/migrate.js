#!/usr/bin/env node

const { loadDbConfig } = require('./dbConfig')
const { migrateDatabase } = require('./dbMigration')

function getArg(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : null
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

async function main() {
  const config = loadDbConfig()
  const from = getArg('--from') || 'sqlite'
  const to = getArg('--to') || config.activeEngine || 'sqlite'
  const resetTarget = !hasFlag('--append')

  if (!config.profiles[from]) throw new Error(`Profil sumber "${from}" tidak ditemukan`)
  if (!config.profiles[to]) throw new Error(`Profil target "${to}" tidak ditemukan`)

  const result = await migrateDatabase({
    source: config.profiles[from],
    target: config.profiles[to],
    resetTarget,
  })

  console.log(`Migrasi selesai: ${result.sourceEngine} -> ${result.targetEngine}`)
  result.stats.forEach(item => {
    console.log(`- ${item.table}: ${item.rows} baris`)
  })
}

main().catch(error => {
  console.error('Migrasi gagal:', error.message)
  process.exit(1)
})
