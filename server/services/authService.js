function mapSessionUser(row) {
  return {
    id: row.user_id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
  }
}

async function getUserByUsername(db, username) {
  return await db.get('SELECT * FROM users WHERE username = ?', [username])
}

async function createSession(db, token, userId) {
  await db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, userId])
}

async function deleteSession(db, token) {
  await db.run('DELETE FROM sessions WHERE token = ?', [token])
  return { success: true }
}

async function getSessionUser(db, token) {
  const row = await db.get(`
    SELECT s.user_id, u.username, u.full_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `, [token])
  return row ? mapSessionUser(row) : null
}

module.exports = {
  getUserByUsername,
  createSession,
  deleteSession,
  getSessionUser,
}
