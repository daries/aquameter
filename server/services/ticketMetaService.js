function mapTicketStatus(row) {
  return {
    ...row,
    next_keys: JSON.parse(row.next_keys || '[]'),
  }
}

async function listTicketStatuses(db, { activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = 1' : ''
  const rows = await db.all(`SELECT * FROM ticket_statuses ${where} ORDER BY sort_order, id`)
  return rows.map(mapTicketStatus)
}

async function getTicketStatusById(db, id) {
  const row = await db.get('SELECT * FROM ticket_statuses WHERE id = ?', [id])
  return row ? mapTicketStatus(row) : null
}

async function createTicketStatus(db, { key, label, variant, next_keys, sort_order }) {
  await db.run(
    'INSERT INTO ticket_statuses (key,label,variant,next_keys,sort_order) VALUES (?,?,?,?,?)',
    [key, label, variant, JSON.stringify(next_keys), sort_order]
  )
  const row = await db.get('SELECT * FROM ticket_statuses WHERE key = ?', [key])
  return mapTicketStatus(row)
}

async function updateTicketStatus(db, id, payload) {
  const existing = await db.get('SELECT * FROM ticket_statuses WHERE id = ?', [id])
  if (!existing) return null

  await db.run(
    'UPDATE ticket_statuses SET label = ?, variant = ?, next_keys = ?, sort_order = ?, is_active = ? WHERE id = ?',
    [
      payload.label ?? existing.label,
      payload.variant ?? existing.variant,
      payload.next_keys !== undefined ? JSON.stringify(payload.next_keys) : existing.next_keys,
      payload.sort_order ?? existing.sort_order,
      payload.is_active ?? existing.is_active,
      id,
    ]
  )

  const row = await db.get('SELECT * FROM ticket_statuses WHERE id = ?', [id])
  return mapTicketStatus(row)
}

async function deleteTicketStatus(db, id) {
  await db.run('DELETE FROM ticket_statuses WHERE id = ?', [id])
  return { success: true }
}

async function listTicketCategories(db, { activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = 1' : ''
  return await db.all(`SELECT * FROM ticket_categories ${where} ORDER BY id`)
}

async function listActiveTicketCategoryNames(db) {
  const rows = await db.all('SELECT name FROM ticket_categories WHERE is_active = 1 ORDER BY id')
  return rows.map(row => row.name)
}

async function getTicketCategoryById(db, id) {
  return await db.get('SELECT * FROM ticket_categories WHERE id = ?', [id])
}

async function createTicketCategory(db, { name }) {
  await db.run('INSERT INTO ticket_categories (name) VALUES (?)', [name])
  return await db.get('SELECT * FROM ticket_categories WHERE name = ? ORDER BY id DESC LIMIT 1', [name])
}

async function updateTicketCategory(db, id, payload) {
  const existing = await db.get('SELECT * FROM ticket_categories WHERE id = ?', [id])
  if (!existing) return null

  await db.run(
    'UPDATE ticket_categories SET name = ?, is_active = ? WHERE id = ?',
    [payload.name ?? existing.name, payload.is_active ?? existing.is_active, id]
  )

  return await db.get('SELECT * FROM ticket_categories WHERE id = ?', [id])
}

async function deleteTicketCategory(db, id) {
  await db.run('DELETE FROM ticket_categories WHERE id = ?', [id])
  return { success: true }
}

module.exports = {
  listTicketStatuses,
  getTicketStatusById,
  createTicketStatus,
  updateTicketStatus,
  deleteTicketStatus,
  listTicketCategories,
  listActiveTicketCategoryNames,
  getTicketCategoryById,
  createTicketCategory,
  updateTicketCategory,
  deleteTicketCategory,
}
