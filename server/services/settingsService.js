async function listSettings(db) {
  const rows = await db.all('SELECT key, value FROM settings ORDER BY key')
  const result = {}
  rows.forEach(row => {
    result[row.key] = row.value
  })
  return result
}

async function updateSettings(db, data = {}) {
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(data)) {
      const existing = await tx.get('SELECT key FROM settings WHERE key = ?', [key])
      if (existing) {
        await tx.run('UPDATE settings SET value = ? WHERE key = ?', [String(value), key])
      } else {
        await tx.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(value)])
      }
    }
  })
  return { success: true }
}

module.exports = {
  listSettings,
  updateSettings,
}
