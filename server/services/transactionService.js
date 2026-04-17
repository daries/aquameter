function mapTransaction(row) {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    category: row.category,
    description: row.description,
    amount: row.amount,
    refBillId: row.ref_bill_id,
    createdAt: row.created_at,
  }
}

// Returns [sql_fragment, params] for filtering a DATE column by YYYY-MM month.
// Uses >= / < range so it works on DATE columns in PostgreSQL, MySQL, and SQLite.
function monthRangeFilter(col, month) {
  const [y, m] = month.split('-').map(Number)
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const end   = `${nextY}-${String(nextM).padStart(2, '0')}-01`
  return { sql: ` AND ${col} >= ? AND ${col} < ?`, params: [start, end] }
}

async function listTransactions(db, filters = {}) {
  const { type, month, limit = 200 } = filters
  let sql = 'SELECT * FROM transactions WHERE 1=1'
  const params = []
  if (type) {
    sql += ' AND type = ?'
    params.push(type)
  }
  if (month) {
    const f = monthRangeFilter('date', month)
    sql += f.sql
    params.push(...f.params)
  }
  sql += ' ORDER BY date DESC, id DESC LIMIT ?'
  params.push(parseInt(limit))
  const rows = await db.all(sql, params)
  return rows.map(mapTransaction)
}

async function getTransactionSummary(db, filters = {}) {
  const { month } = filters
  let where = '1=1'
  const params = []
  if (month) {
    const f = monthRangeFilter('date', month)
    where += f.sql
    params.push(...f.params)
  }
  return await db.get(`
    SELECT
      SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as total_expense,
      COUNT(CASE WHEN type='income'  THEN 1 END) as count_income,
      COUNT(CASE WHEN type='expense' THEN 1 END) as count_expense
    FROM transactions WHERE ${where}
  `, params)
}

async function createTransaction(db, payload) {
  const result = await db.run(`
    INSERT INTO transactions (date, type, category, description, amount, ref_bill_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [payload.date, payload.type, payload.category, payload.description, parseFloat(payload.amount), payload.refBillId || null])
  const row = await db.get('SELECT * FROM transactions WHERE id = ?', [result.lastInsertRowid])
  return mapTransaction(row)
}

async function getTransactionById(db, id) {
  return await db.get('SELECT * FROM transactions WHERE id = ?', [id])
}

async function deleteTransaction(db, id) {
  await db.run('DELETE FROM transactions WHERE id = ?', [id])
  return { success: true }
}

module.exports = {
  listTransactions,
  getTransactionSummary,
  createTransaction,
  getTransactionById,
  deleteTransaction,
}
