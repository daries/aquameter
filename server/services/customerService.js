function mapCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    ktp: row.ktp,
    meter: row.meter,
    group: row.grp,
    address: row.address,
    phone: row.phone,
    lastStand: row.last_stand,
    status: row.status,
    joinDate: row.join_date,
  }
}

async function listCustomers(db, filters = {}) {
  const { status = 'active', search = '' } = filters
  let sql = 'SELECT * FROM customers WHERE status = ?'
  const params = [status]
  if (search) {
    sql += ' AND (name LIKE ? OR meter LIKE ? OR address LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  sql += ' ORDER BY name'
  const rows = await db.all(sql, params)
  return rows.map(mapCustomer)
}

async function getCustomerById(db, id) {
  const row = await db.get('SELECT * FROM customers WHERE id = ?', [id])
  return row ? mapCustomer(row) : null
}

async function getCustomerRowById(db, id) {
  return await db.get('SELECT * FROM customers WHERE id = ?', [id])
}

async function createCustomer(db, payload) {
  const joinDate = payload.joinDate || new Date().toISOString().split('T')[0]
  const autoMeter = !payload.meter || payload.meter === 'AUTO'
  const tempMeter = autoMeter ? '__AUTO__' : payload.meter
  const result = await db.run(`
    INSERT INTO customers (name, ktp, meter, grp, address, phone, last_stand, join_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [payload.name, payload.ktp, tempMeter, payload.group || 'R1', payload.address, payload.phone, payload.lastStand || 0, joinDate])
  const newId = result.lastInsertRowid
  if (autoMeter) {
    const meter = 'MET-' + String(newId).padStart(4, '0')
    await db.run('UPDATE customers SET meter = ? WHERE id = ?', [meter, newId])
  }
  return await getCustomerById(db, newId)
}

async function updateCustomer(db, id, payload) {
  const existing = await getCustomerRowById(db, id)
  if (!existing) return null
  await db.run(`
    UPDATE customers SET name=?, ktp=?, meter=?, grp=?, address=?, phone=?, last_stand=?, status=?
    WHERE id=?
  `, [
    payload.name ?? existing.name,
    payload.ktp ?? existing.ktp,
    payload.meter ?? existing.meter,
    payload.group || existing.grp,
    payload.address ?? existing.address,
    payload.phone ?? existing.phone,
    payload.lastStand ?? existing.last_stand,
    payload.status ?? existing.status,
    id,
  ])
  return await getCustomerById(db, id)
}

async function deactivateCustomer(db, id) {
  await db.run("UPDATE customers SET status='inactive' WHERE id=?", [id])
  return { success: true }
}

module.exports = {
  listCustomers,
  getCustomerById,
  getCustomerRowById,
  createCustomer,
  updateCustomer,
  deactivateCustomer,
}
