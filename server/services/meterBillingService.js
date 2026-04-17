function mapReading(row) {
  return {
    id: row.id,
    custId: row.cust_id,
    lastStand: row.last_stand,
    currentStand: row.current_stand,
    usage: row.usage,
    date: row.date,
    note: row.note,
    period: row.period,
    photo: row.photo,
    custName: row.cust_name,
    meter: row.meter,
    billId: row.bill_id,
    billStatus: row.bill_status,
    billTotal: row.bill_total,
  }
}

function mapBill(row) {
  return {
    id: row.id,
    custId: row.cust_id,
    invoiceNo: row.invoice_no,
    period: row.period,
    periodKey: row.period_key,
    usage: row.usage,
    waterCost: row.water_cost,
    admin: row.admin,
    ppj: row.ppj,
    total: row.total,
    dueDate: row.due_date,
    status: row.status,
    paidDate: row.paid_date,
    custName: row.cust_name,
    meter: row.meter,
    group: row.grp,
    photo: row.reading_photo || null,
  }
}

async function listReadings(db, filters = {}) {
  const { custId, period, limit = 50 } = filters
  let sql = `SELECT r.*, c.name as cust_name, c.meter,
           b.id as bill_id, b.status as bill_status, b.total as bill_total
           FROM readings r
           JOIN customers c ON c.id = r.cust_id
           LEFT JOIN bills b ON b.cust_id = r.cust_id AND b.period_key = r.period
           WHERE 1=1`
  const params = []
  if (custId) { sql += ' AND r.cust_id = ?'; params.push(custId) }
  if (period) { sql += ' AND r.period = ?'; params.push(period) }
  sql += ' ORDER BY r.id DESC LIMIT ?'
  params.push(parseInt(limit))
  const rows = await db.all(sql, params)
  return rows.map(mapReading)
}

async function getReadingRowById(db, id) {
  return await db.get('SELECT * FROM readings WHERE id = ?', [id])
}

async function getCustomerRowById(db, id) {
  return await db.get('SELECT * FROM customers WHERE id = ?', [id])
}

async function getBillByCustomerPeriod(db, custId, periodKey) {
  return await db.get('SELECT * FROM bills WHERE cust_id = ? AND period_key = ?', [custId, periodKey])
}

async function getJoinedReadingById(db, id) {
  const row = await db.get(`
    SELECT r.*, c.name as cust_name, c.meter,
           b.id as bill_id, b.status as bill_status, b.total as bill_total
    FROM readings r
    JOIN customers c ON c.id = r.cust_id
    LEFT JOIN bills b ON b.cust_id = r.cust_id AND b.period_key = r.period
    WHERE r.id = ?`, [id])
  return row ? mapReading(row) : null
}

async function createReadingWithBill(db, payload) {
  let readingId = null
  let bill = null

  await db.transaction(async (tx) => {
    const readingResult = await tx.run(`
      INSERT INTO readings (cust_id, last_stand, current_stand, usage, date, note, period, photo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [payload.custId, payload.lastStand, payload.currentStand, payload.usage, payload.date, payload.note || '', payload.period, payload.photo || null])

    const billResult = await tx.run(`
      INSERT INTO bills (cust_id, invoice_no, period, period_key, usage, water_cost, admin, ppj, total, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [payload.custId, `_TMP_${Date.now()}`, payload.periodName, payload.period, payload.usage, payload.cost, payload.admin, payload.ppj, payload.total, payload.dueDate])

    const billId = billResult.lastInsertRowid
    const invoiceNo = `INV-${new Date().getFullYear()}-${String(billId).padStart(4, '0')}`
    await tx.run('UPDATE bills SET invoice_no = ? WHERE id = ?', [invoiceNo, billId])
    await tx.run('UPDATE customers SET last_stand = ? WHERE id = ?', [payload.currentStand, payload.custId])

    readingId = readingResult.lastInsertRowid
    bill = await tx.get('SELECT * FROM bills WHERE id = ?', [billId])
  })

  return {
    reading: await getJoinedReadingById(db, readingId),
    bill: mapBill(bill),
    rawBill: bill,
  }
}

async function updateReadingAndBill(db, payload) {
  await db.transaction(async (tx) => {
    await tx.run('UPDATE readings SET current_stand=?, usage=?, date=?, note=? WHERE id=?', [
      payload.newStand,
      payload.usage,
      payload.date || payload.reading.date,
      payload.note ?? payload.reading.note,
      payload.reading.id,
    ])

    if (payload.bill) {
      await tx.run('UPDATE bills SET usage=?, water_cost=?, ppj=?, total=? WHERE id=?', [
        payload.usage,
        payload.cost,
        payload.ppj,
        payload.total,
        payload.bill.id,
      ])
    }

    const latest = await tx.get('SELECT id FROM readings WHERE cust_id = ? ORDER BY id DESC LIMIT 1', [payload.reading.cust_id])
    if (latest?.id === payload.reading.id) {
      await tx.run('UPDATE customers SET last_stand=? WHERE id=?', [payload.newStand, payload.reading.cust_id])
    }
  })

  return await getJoinedReadingById(db, payload.reading.id)
}

async function listBills(db, filters = {}) {
  const { status, periodKey, custId, limit = 100 } = filters
  let sql = `SELECT b.*, c.name as cust_name, c.meter, c.grp,
           r.photo as reading_photo
           FROM bills b
           JOIN customers c ON c.id = b.cust_id
           LEFT JOIN readings r ON r.cust_id = b.cust_id AND r.period = b.period_key
           WHERE 1=1`
  const params = []
  if (status) { sql += ' AND b.status = ?'; params.push(status) }
  if (periodKey) { sql += ' AND b.period_key = ?'; params.push(periodKey) }
  if (custId) { sql += ' AND b.cust_id = ?'; params.push(custId) }
  sql += ' ORDER BY b.id DESC LIMIT ?'
  params.push(parseInt(limit))
  const rows = await db.all(sql, params)
  return rows.map(mapBill)
}

async function getBillDetailById(db, id) {
  const row = await db.get(`SELECT b.*, c.name as cust_name, c.meter, c.grp, c.address
    FROM bills b JOIN customers c ON c.id = b.cust_id WHERE b.id = ?`, [id])
  return row ? mapBill(row) : null
}

async function getBillRowWithCustomerById(db, id) {
  return await db.get(`
    SELECT b.*, c.name as cust_name, c.meter
    FROM bills b JOIN customers c ON c.id = b.cust_id
    WHERE b.id = ?
  `, [id])
}

async function markBillPaid(db, billId, today) {
  const bill = await getBillRowWithCustomerById(db, billId)
  if (!bill) return null

  await db.transaction(async (tx) => {
    await tx.run("UPDATE bills SET status='paid', paid_date=? WHERE id=?", [today, bill.id])
    const existing = await tx.get(
      "SELECT id FROM transactions WHERE ref_bill_id = ? AND type = 'income'",
      [bill.id]
    )
    if (!existing) {
      await tx.run(`
        INSERT INTO transactions (date, type, category, description, amount, ref_bill_id)
        VALUES (?, 'income', 'Pembayaran Tagihan Air', ?, ?, ?)
      `, [today, `Pembayaran ${bill.period} - ${bill.cust_name} (${bill.meter})`, bill.total, bill.id])
    }
  })

  return await db.get('SELECT * FROM bills WHERE id=?', [bill.id])
}

async function markBillUnpaid(db, billId) {
  await db.transaction(async (tx) => {
    await tx.run("UPDATE bills SET status='unpaid', paid_date=NULL WHERE id=?", [billId])
    await tx.run("DELETE FROM transactions WHERE ref_bill_id = ? AND type = 'income'", [billId])
  })
  return await db.get('SELECT * FROM bills WHERE id=?', [billId])
}

module.exports = {
  listReadings,
  getReadingRowById,
  getCustomerRowById,
  getBillByCustomerPeriod,
  createReadingWithBill,
  updateReadingAndBill,
  listBills,
  getBillDetailById,
  getBillRowWithCustomerById,
  markBillPaid,
  markBillUnpaid,
}
