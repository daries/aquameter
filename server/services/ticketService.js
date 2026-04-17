function mapTicket(row) {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    custId: row.cust_id,
    custName: row.cust_name || null,
    custMeter: row.cust_meter || null,
    reporterName: row.reporter_name,
    reporterPhone: row.reporter_phone,
    category: row.category,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  }
}

function mapTicketUpdate(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    status: row.status,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

async function nextTicketNo(db) {
  const last = await db.get('SELECT ticket_no FROM tickets ORDER BY id DESC LIMIT 1')
  let seq = 1
  if (last) {
    const match = last.ticket_no.match(/TKT-(\d+)/)
    if (match) seq = parseInt(match[1]) + 1
  }
  return `TKT-${String(seq).padStart(4, '0')}`
}

async function listTickets(db, filters = {}) {
  const { status = '', search = '', priority = '' } = filters
  let sql = `
    SELECT t.*, c.name as cust_name, c.meter as cust_meter
    FROM tickets t
    LEFT JOIN customers c ON c.id = t.cust_id
    WHERE 1=1
  `
  const params = []
  if (status) {
    sql += ' AND t.status = ?'
    params.push(status)
  }
  if (priority) {
    sql += ' AND t.priority = ?'
    params.push(priority)
  }
  if (search) {
    sql += ' AND (t.ticket_no LIKE ? OR t.reporter_name LIKE ? OR t.description LIKE ? OR c.name LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  sql += ' ORDER BY t.id DESC'
  const rows = await db.all(sql, params)
  return rows.map(mapTicket)
}

async function getTicketById(db, id) {
  const row = await db.get(`
    SELECT t.*, c.name as cust_name, c.meter as cust_meter
    FROM tickets t LEFT JOIN customers c ON c.id = t.cust_id
    WHERE t.id = ?
  `, [id])
  return row ? mapTicket(row) : null
}

async function getTicketDetail(db, id) {
  const ticket = await getTicketById(db, id)
  if (!ticket) return null
  const updates = await db.all('SELECT * FROM ticket_updates WHERE ticket_id = ? ORDER BY id ASC', [id])
  return { ...ticket, updates: updates.map(mapTicketUpdate) }
}

async function createTicket(db, payload) {
  const now = payload.now
  let createdId = null

  await db.transaction(async (tx) => {
    const ticketNo = await nextTicketNo(tx)
    const result = await tx.run(`
      INSERT INTO tickets (ticket_no, cust_id, reporter_name, reporter_phone, category, description, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ticketNo,
      payload.custId || null,
      payload.reporterName,
      payload.reporterPhone || null,
      payload.category || 'Lain-lain',
      payload.description,
      payload.priority || 'medium',
      now,
      now,
    ])
    createdId = result.lastInsertRowid
    await tx.run(`
      INSERT INTO ticket_updates (ticket_id, status, note, created_by, created_at)
      VALUES (?, 'open', 'Tiket dibuat', ?, ?)
    `, [createdId, payload.createdBy, now])
  })

  return await getTicketById(db, createdId)
}

async function updateTicket(db, id, payload) {
  const existing = await db.get('SELECT * FROM tickets WHERE id = ?', [id])
  if (!existing) return null

  await db.run(`
    UPDATE tickets SET reporter_name=?, reporter_phone=?, category=?, description=?,
    priority=?, assigned_to=?, notes=?, updated_at=? WHERE id=?
  `, [
    payload.reporterName || existing.reporter_name,
    payload.reporterPhone ?? existing.reporter_phone,
    payload.category || existing.category,
    payload.description || existing.description,
    payload.priority || existing.priority,
    payload.assignedTo ?? existing.assigned_to,
    payload.notes ?? existing.notes,
    payload.now,
    id,
  ])

  return await getTicketById(db, id)
}

async function updateTicketStatus(db, id, payload) {
  const existing = await db.get('SELECT * FROM tickets WHERE id = ?', [id])
  if (!existing) return null

  const resolvedAt = (payload.status === 'resolved' || payload.status === 'closed') && !existing.resolved_at
    ? payload.now
    : existing.resolved_at

  await db.transaction(async (tx) => {
    await tx.run(`
      UPDATE tickets SET status=?, resolved_at=?, updated_at=? WHERE id=?
    `, [payload.status, resolvedAt, payload.now, id])
    await tx.run(`
      INSERT INTO ticket_updates (ticket_id, status, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [id, payload.status, payload.note || null, payload.createdBy, payload.now])
  })

  return await getTicketById(db, id)
}

async function deleteTicket(db, id) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM ticket_updates WHERE ticket_id = ?', [id])
    await tx.run('DELETE FROM tickets WHERE id = ?', [id])
  })
  return { success: true }
}

module.exports = {
  listTickets,
  getTicketById,
  getTicketDetail,
  createTicket,
  updateTicket,
  updateTicketStatus,
  deleteTicket,
}
