import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { userAPI } from '../utils/api'
import { getUser } from '../utils/auth'
import { Card, Badge, Button, Modal, FormInput, FormSelect, EmptyState, ConfirmDialog } from '../components/UI'

const emptyForm = { username: '', fullName: '', role: 'petugas', password: '', passwordConfirm: '' }

const ROLE_LABEL = { admin: 'Admin', petugas: 'Petugas' }

export default function Users() {
  const { showToast } = useStore()
  const currentUser = getUser()
  const isAdmin     = currentUser?.role === 'admin'

  const [users,         setUsers]         = useState([])
  const [loading,       setLoading]       = useState(true)
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editData,      setEditData]      = useState(null)
  const [form,          setForm]          = useState(emptyForm)
  const [errors,        setErrors]        = useState({})
  const [saving,        setSaving]        = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const loadedRef = useRef(false)

  const loadUsers = async () => {
    try {
      const data = await userAPI.getAll()
      setUsers(data)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    loadUsers()
  }, [])

  // Jika bukan admin, tampilkan halaman akses ditolak
  if (!isAdmin) {
    return (
      <Card style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Akses Ditolak</div>
        <div style={{ color: 'var(--text-sec)', fontSize: 13 }}>
          Halaman ini hanya dapat diakses oleh <b>admin</b>.<br />
          Anda login sebagai <b>{currentUser?.role}</b>.
        </div>
      </Card>
    )
  }

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const errs = {}
    if (!form.fullName.trim()) errs.fullName = 'Nama lengkap wajib diisi'
    if (!editData && !form.username.trim()) errs.username = 'Username wajib diisi'
    if (!editData && !form.password) errs.password = 'Password wajib diisi'
    if (form.password && form.password.length < 6) errs.password = 'Password minimal 6 karakter'
    if (form.password && form.password !== form.passwordConfirm) errs.passwordConfirm = 'Konfirmasi password tidak cocok'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const openAdd = () => {
    setEditData(null)
    setForm(emptyForm)
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (u) => {
    setEditData(u)
    setForm({ username: u.username, fullName: u.fullName, role: u.role, password: '', passwordConfirm: '' })
    setErrors({})
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      if (editData) {
        const payload = { fullName: form.fullName, role: form.role }
        if (form.password) payload.password = form.password
        await userAPI.update(editData.id, payload)
        showToast('User ' + form.fullName + ' berhasil diperbarui!')
      } else {
        await userAPI.create({ username: form.username, fullName: form.fullName, role: form.role, password: form.password })
        showToast('User ' + form.fullName + ' berhasil ditambahkan!')
      }
      setModalOpen(false)
      loadedRef.current = false
      await loadUsers()
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (u) => {
    try {
      await userAPI.remove(u.id)
      showToast('User ' + u.fullName + ' berhasil dihapus')
      setConfirmDelete(null)
      loadedRef.current = false
      await loadUsers()
    } catch (e) {
      showToast(e.message, 'error')
      setConfirmDelete(null)
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>{users.length} user terdaftar</span>
        <Button variant="primary" onClick={openAdd} icon="➕">Tambah User</Button>
      </div>

      <Card padding={0}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat data...</div>
        ) : users.length === 0 ? (
          <EmptyState icon="👤" title="Belum ada user" description="Tambahkan user untuk mengakses sistem" action={<Button variant="primary" onClick={openAdd}>Tambah User</Button>} />
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 'var(--radius)' }}>
            <table>
              <thead>
                <tr>
                  <th className="hide-mobile">No.</th>
                  <th>Nama Lengkap</th>
                  <th className="hide-mobile">Username</th>
                  <th>Role</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id}>
                    <td className="hide-mobile" style={{ color: 'var(--text-hint)', fontSize: 12 }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: u.role === 'admin' ? 'var(--ocean)' : 'var(--ocean-pale)',
                          color: u.role === 'admin' ? '#fff' : 'var(--ocean)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 14, flexShrink: 0,
                        }}>
                          {u.fullName?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <b style={{ fontSize: 13 }}>{u.fullName}</b>
                          {u.id === currentUser?.id && (
                            <span style={{ fontSize: 10, color: 'var(--ocean)', marginLeft: 6, fontWeight: 600 }}>● Anda</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="mono hide-mobile" style={{ fontSize: 13 }}>{u.username}</td>
                    <td>
                      <Badge variant={u.role === 'admin' ? 'info' : 'gray'}>
                        {u.role === 'admin' ? '🔑 ' : '👤 '}{ROLE_LABEL[u.role]}
                      </Badge>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>✏️ Edit</Button>
                        {u.id !== currentUser?.id && (
                          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(u)}>🗑️</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Info roles */}
      <div className="grid-2" style={{ marginTop: 16 }}>
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 24 }}>🔑</span>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Admin</div>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.6 }}>
                Akses penuh — kelola pelanggan, tagihan, tarif, buku kas, pengaturan, dan manajemen user.
              </div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 24 }}>👤</span>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Petugas</div>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.6 }}>
                Akses operasional — baca meter, input pembayaran, dan lihat laporan. Tidak bisa ubah pengaturan atau kelola user.
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Modal Tambah / Edit */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editData ? '✏️ Edit User' : '➕ Tambah User Baru'} width={460}>
        <FormInput
          label="Nama Lengkap"
          value={form.fullName}
          onChange={e => setField('fullName', e.target.value)}
          placeholder="Nama lengkap user"
          error={errors.fullName}
        />
        <FormInput
          label="Username"
          value={form.username}
          onChange={e => setField('username', e.target.value)}
          placeholder="username (tidak bisa diubah)"
          readOnly={!!editData}
          error={errors.username}
          hint={editData ? 'Username tidak dapat diubah' : ''}
        />
        <FormSelect
          label="Role"
          value={form.role}
          onChange={e => setField('role', e.target.value)}
        >
          <option value="petugas">👤 Petugas</option>
          <option value="admin">🔑 Admin</option>
        </FormSelect>
        <FormInput
          label={editData ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password'}
          type="password"
          value={form.password}
          onChange={e => setField('password', e.target.value)}
          placeholder={editData ? 'Kosongkan jika tidak ingin mengubah' : 'Minimal 6 karakter'}
          error={errors.password}
        />
        {form.password && (
          <FormInput
            label="Konfirmasi Password"
            type="password"
            value={form.passwordConfirm}
            onChange={e => setField('passwordConfirm', e.target.value)}
            placeholder="Ulangi password"
            error={errors.passwordConfirm}
          />
        )}
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Batal</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Menyimpan...' : editData ? 'Simpan Perubahan' : 'Tambah User'}
          </Button>
        </div>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => handleDelete(confirmDelete)}
        title="Hapus User"
        message={`Yakin ingin menghapus user "${confirmDelete?.fullName}" (${confirmDelete?.username})? Semua sesi aktif user ini akan dihapus.`}
        confirmLabel="Ya, hapus"
        danger
      />
    </div>
  )
}
