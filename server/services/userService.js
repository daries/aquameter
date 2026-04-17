function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
  }
}

async function listUsers(db) {
  const rows = await db.all('SELECT id, username, full_name, role FROM users ORDER BY id')
  return rows.map(mapUser)
}

async function createUser(db, { username, passwordHash, fullName, role }) {
  await db.run(
    'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
    [username, passwordHash, fullName, role]
  )
  const row = await db.get('SELECT id, username, full_name, role FROM users WHERE username = ?', [username])
  return mapUser(row)
}

async function getUserById(db, id) {
  return await db.get('SELECT * FROM users WHERE id = ?', [id])
}

async function updateUser(db, id, { fullName, role, passwordHash }) {
  if (passwordHash) {
    await db.run('UPDATE users SET full_name = ?, role = ?, password = ? WHERE id = ?', [fullName, role, passwordHash, id])
  } else {
    await db.run('UPDATE users SET full_name = ?, role = ? WHERE id = ?', [fullName, role, id])
  }
  const row = await db.get('SELECT id, username, full_name, role FROM users WHERE id = ?', [id])
  return row ? mapUser(row) : null
}

async function deleteUser(db, id) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM sessions WHERE user_id = ?', [id])
    await tx.run('DELETE FROM users WHERE id = ?', [id])
  })
  return { success: true }
}

module.exports = {
  listUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
}
