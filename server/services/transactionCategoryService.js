async function listTransactionCategories(db) {
  return await db.all('SELECT * FROM transaction_categories ORDER BY type, name')
}

async function getTransactionCategoryById(db, id) {
  return await db.get('SELECT * FROM transaction_categories WHERE id = ?', [id])
}

async function createTransactionCategory(db, { type, name }) {
  await db.run('INSERT INTO transaction_categories (type, name) VALUES (?, ?)', [type, name])
  return await db.get(
    'SELECT * FROM transaction_categories WHERE type = ? AND name = ? ORDER BY id DESC LIMIT 1',
    [type, name]
  )
}

async function updateTransactionCategory(db, id, { name }) {
  await db.run('UPDATE transaction_categories SET name = ? WHERE id = ?', [name, id])
  return await db.get('SELECT * FROM transaction_categories WHERE id = ?', [id])
}

async function countTransactionsByCategory(db, categoryName) {
  const row = await db.get('SELECT COUNT(*) as n FROM transactions WHERE category = ?', [categoryName])
  return row?.n || 0
}

async function deleteTransactionCategory(db, id) {
  await db.run('DELETE FROM transaction_categories WHERE id = ?', [id])
  return { success: true }
}

module.exports = {
  listTransactionCategories,
  getTransactionCategoryById,
  createTransactionCategory,
  updateTransactionCategory,
  countTransactionsByCategory,
  deleteTransactionCategory,
}
