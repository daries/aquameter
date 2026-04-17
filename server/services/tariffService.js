async function listTariffs(db) {
  const rows = await db.all('SELECT * FROM tariffs ORDER BY grp, blk_order')
  const result = {}
  for (const row of rows) {
    if (!result[row.grp]) result[row.grp] = []
    result[row.grp].push({ limit: row.limit_m3, price: row.price })
  }
  return result
}

async function replaceTariffBlocks(db, grp, blocks) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM tariffs WHERE grp = ?', [grp])
    for (const [index, block] of blocks.entries()) {
      await tx.run(
        'INSERT INTO tariffs (grp, blk_order, limit_m3, price) VALUES (?, ?, ?, ?)',
        [grp, index + 1, block.limit === undefined ? null : block.limit, block.price]
      )
    }
  })

  const rows = await db.all('SELECT * FROM tariffs WHERE grp = ? ORDER BY blk_order', [grp])
  return rows.map(row => ({ limit: row.limit_m3, price: row.price }))
}

module.exports = {
  listTariffs,
  replaceTariffBlocks,
}
