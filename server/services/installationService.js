function mapInstallation(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    ktp: row.ktp,
    address: row.address,
    phone: row.phone,
    email: row.email,
    group: row.grp,
    notes: row.notes,
    status: row.status,
    installFee: row.install_fee,
    adminFee: row.admin_fee,
    totalFee: row.total_fee,
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    paidDate: row.paid_date,
    installedDate: row.installed_date,
    meterNo: row.meter_no,
    custId: row.cust_id,
    createdAt: row.created_at,
  }
}

async function listInstallations(db, filters = {}) {
  const { status } = filters
  let sql = 'SELECT * FROM installations WHERE 1=1'
  const params = []
  if (status) {
    sql += ' AND status = ?'
    params.push(status)
  }
  sql += ' ORDER BY id DESC'
  const rows = await db.all(sql, params)
  return rows.map(mapInstallation)
}

async function getInstallationById(db, id) {
  const row = await db.get('SELECT * FROM installations WHERE id = ?', [id])
  return row ? mapInstallation(row) : null
}

async function getInstallationRowById(db, id) {
  return await db.get('SELECT * FROM installations WHERE id = ?', [id])
}

async function createInstallation(db, payload) {
  const result = await db.run(`
    INSERT INTO installations (name, ktp, address, phone, email, grp, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [payload.name, payload.ktp, payload.address, payload.phone, payload.email, payload.group || 'R1', payload.notes])
  return await getInstallationById(db, result.lastInsertRowid)
}

async function updateInstallation(db, id, payload) {
  const existing = await getInstallationRowById(db, id)
  if (!existing) return null

  await db.run(`
    UPDATE installations SET name=?, ktp=?, address=?, phone=?, email=?, grp=?, notes=? WHERE id=?
  `, [
    payload.name ?? existing.name,
    payload.ktp ?? existing.ktp,
    payload.address ?? existing.address,
    payload.phone ?? existing.phone,
    payload.email ?? existing.email,
    payload.group ?? existing.grp,
    payload.notes ?? existing.notes,
    id,
  ])
  return await getInstallationById(db, id)
}

async function createInstallationInvoice(db, id, payload) {
  const existing = await getInstallationRowById(db, id)
  if (!existing) return null

  await db.run(`
    UPDATE installations SET status='invoiced', install_fee=?, admin_fee=?, total_fee=?,
    invoice_no=?, invoice_date=? WHERE id=?
  `, [payload.installFee, payload.adminFee, payload.totalFee, payload.invoiceNo, payload.today, id])

  return await getInstallationById(db, id)
}

async function markInstallationPaid(db, id, payload) {
  const existing = await getInstallationRowById(db, id)
  if (!existing) return null

  await db.transaction(async (tx) => {
    await tx.run("UPDATE installations SET status='paid', paid_date=? WHERE id=?", [payload.today, id])
    const found = await tx.get(
      "SELECT id FROM transactions WHERE ref_bill_id IS NULL AND description LIKE ? AND date = ?",
      [`%${existing.invoice_no}%`, payload.today]
    )
    if (!found) {
      await tx.run(`
        INSERT INTO transactions (date, type, category, description, amount)
        VALUES (?, 'income', 'Biaya Sambung Baru', ?, ?)
      `, [payload.today, `Biaya Pasang Baru - ${existing.name} (${existing.invoice_no})`, existing.total_fee])
    }
  })

  return await getInstallationById(db, id)
}

async function markInstallationInstalled(db, id, payload) {
  const existing = await getInstallationRowById(db, id)
  if (!existing) return null

  await db.transaction(async (tx) => {
    const customer = await tx.run(`
      INSERT INTO customers (name, ktp, meter, grp, address, phone, last_stand, join_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `, [existing.name, existing.ktp, payload.meterNo, existing.grp, existing.address, existing.phone, payload.lastStand, payload.today])

    await tx.run(`
      UPDATE installations SET status='installed', installed_date=?, meter_no=?, cust_id=? WHERE id=?
    `, [payload.today, payload.meterNo, customer.lastInsertRowid, id])
  })

  return await getInstallationById(db, id)
}

async function cancelInstallation(db, id) {
  const existing = await getInstallationRowById(db, id)
  if (!existing) return null
  await db.run("UPDATE installations SET status='cancelled' WHERE id=?", [id])
  return await getInstallationById(db, id)
}

module.exports = {
  listInstallations,
  getInstallationById,
  getInstallationRowById,
  createInstallation,
  updateInstallation,
  createInstallationInvoice,
  markInstallationPaid,
  markInstallationInstalled,
  cancelInstallation,
}
