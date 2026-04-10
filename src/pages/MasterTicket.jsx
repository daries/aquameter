import { useState, useEffect } from 'react'
import { getUser } from '../utils/auth'
import { useStore } from '../store'
import { ticketCategoryAPI, ticketStatusAPI } from '../utils/api'
import { Card, Button, Tabs, Modal, FormInput, FormSelect, ConfirmDialog } from '../components/UI'

const VARIANT_OPTIONS = [
  { value: 'warning', label: '🟡 Kuning (Baru/Pending)' },
  { value: 'info',    label: '🔵 Biru (Diproses)' },
  { value: 'success', label: '🟢 Hijau (Selesai)' },
  { value: 'danger',  label: '🔴 Merah (Kritis/Ditolak)' },
  { value: 'gray',    label: '⚪ Abu-abu (Tutup/Nonaktif)' },
]

export default function MasterTicket() {
  const user = getUser()
  const [tab, setTab] = useState('kategori')

  if (user?.role !== 'admin') {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-hint)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Akses Ditolak</div>
          <div style={{ fontSize: 13 }}>Halaman ini hanya untuk Administrator.</div>
        </div>
      </Card>
    )
  }

  const tabs = [
    { id: 'kategori', label: '🏷️ Kategori Pengaduan' },
    { id: 'status',   label: '🔄 Status Tiket' },
  ]

  return (
    <div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div style={{ marginTop: 16 }}>
        {tab === 'kategori' && <KategoriPanel />}
        {tab === 'status'   && <StatusPanel />}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════
   Panel Kategori
══════════════════════════════════════ */
function KategoriPanel() {
  const { showToast } = useStore()
  const [cats, setCats]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [newName, setNewName]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState(null)
  const [editName, setEditName] = useState('')
  const [deleteId, setDeleteId] = useState(null)

  const load = () => {
    setLoading(true)
    ticketCategoryAPI.getAll()
      .then(setCats).catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      await ticketCategoryAPI.create({ name: newName.trim() })
      showToast('Kategori ditambahkan')
      setNewName(''); load()
    } catch (err) { showToast(err.message, 'error') }
    finally { setSaving(false) }
  }

  const handleEdit = async (id) => {
    if (!editName.trim()) return
    try {
      await ticketCategoryAPI.update(id, { name: editName.trim() })
      showToast('Kategori diperbarui')
      setEditId(null); load()
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleDelete = async () => {
    try {
      await ticketCategoryAPI.remove(deleteId)
      showToast('Kategori dihapus')
      setDeleteId(null); load()
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleToggle = async (cat) => {
    try {
      await ticketCategoryAPI.update(cat.id, { is_active: cat.is_active ? 0 : 1 })
      load()
    } catch (err) { showToast(err.message, 'error') }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <Card>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Kategori Pengaduan</div>
          <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>
            Kategori yang tersedia saat pelanggan mengisi formulir pengaduan atau via WhatsApp bot.
            Kategori nonaktif tidak akan muncul di pilihan.
          </div>
        </div>

        {/* Form tambah */}
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            className="form-input" style={{ flex: 1 }}
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Nama kategori baru..." required
          />
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? '...' : '+ Tambah'}
          </Button>
        </form>

        {/* Daftar */}
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat...</div>
        ) : cats.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-hint)' }}>Belum ada kategori</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cats.map(cat => (
              <div key={cat.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', background: 'var(--bg-alt)', borderRadius: 10,
                opacity: cat.is_active ? 1 : 0.5,
                border: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: cat.is_active ? 'var(--mint)' : 'var(--text-hint)',
                }} />
                {editId === cat.id ? (
                  <>
                    <input
                      className="form-input" style={{ flex: 1, padding: '4px 8px', fontSize: 13 }}
                      value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleEdit(cat.id); if (e.key === 'Escape') setEditId(null) }}
                      autoFocus
                    />
                    <Button size="sm" variant="primary" onClick={() => handleEdit(cat.id)}>✓ Simpan</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>✕</Button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{cat.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-hint)', marginRight: 4 }}>
                      {cat.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => handleToggle(cat)}
                      title={cat.is_active ? 'Nonaktifkan' : 'Aktifkan'}>
                      {cat.is_active ? '🟢' : '⚫'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditId(cat.id); setEditName(cat.name) }}>✏️</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(cat.id)}>🗑️</Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-hint)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          🟢 Aktif — muncul di form pengaduan &nbsp;|&nbsp; ⚫ Nonaktif — tersembunyi
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Hapus Kategori"
        message="Hapus kategori ini? Tiket yang sudah ada tidak terpengaruh."
        confirmLabel="Hapus"
        danger
      />
    </div>
  )
}

/* ══════════════════════════════════════
   Panel Status
══════════════════════════════════════ */
function StatusPanel() {
  const { showToast } = useStore()
  const [statuses, setStatuses]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [formOpen, setFormOpen]   = useState(false)
  const [editData, setEditData]   = useState(null)
  const [deleteId, setDeleteId]   = useState(null)

  const load = () => {
    setLoading(true)
    ticketStatusAPI.getAll()
      .then(setStatuses).catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleToggle = async (s) => {
    try {
      await ticketStatusAPI.update(s.id, { is_active: s.is_active ? 0 : 1 })
      load()
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleDelete = async () => {
    try {
      await ticketStatusAPI.remove(deleteId)
      showToast('Status dihapus')
      setDeleteId(null); load()
    } catch (err) { showToast(err.message, 'error') }
  }

  const variantStyle = {
    warning: { bg: 'var(--warning-bg)', color: '#b45309' },
    info:    { bg: 'var(--ocean-pale)',  color: 'var(--ocean)' },
    success: { bg: 'var(--success-bg)', color: 'var(--teal)' },
    danger:  { bg: 'var(--danger-bg)',  color: 'var(--danger)' },
    gray:    { bg: 'var(--bg-alt)',      color: 'var(--text-hint)' },
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Status Tiket</div>
            <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>
              Definisikan alur status pengaduan. Kolom <b>Transisi ke</b> menentukan status mana yang bisa dipilih berikutnya.
              Status default tidak dapat dihapus.
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => { setEditData(null); setFormOpen(true) }}>
            + Tambah Status
          </Button>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat...</div>
        ) : (
          <>
            {/* Header tabel */}
            <div style={{
              display: 'grid', gridTemplateColumns: '32px 120px 100px 1fr auto',
              gap: '0 12px', padding: '6px 10px',
              fontSize: 11, fontWeight: 700, color: 'var(--text-hint)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              borderBottom: '1px solid var(--border)', marginBottom: 6,
            }}>
              <span>#</span><span>Key</span><span>Label</span><span>Transisi ke</span><span>Aksi</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {statuses.map((s, i) => {
                const vs = variantStyle[s.variant] || variantStyle.gray
                const nextLabels = (s.next_keys || [])
                  .map(k => statuses.find(x => x.key === k)?.label || k)
                  .join(' → ')
                return (
                  <div key={s.id} style={{
                    display: 'grid', gridTemplateColumns: '32px 120px 100px 1fr auto',
                    gap: '0 12px', alignItems: 'center',
                    padding: '10px 10px', background: 'var(--bg-alt)',
                    borderRadius: 10, border: '1px solid var(--border)',
                    opacity: s.is_active ? 1 : 0.5,
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--text-hint)', fontFamily: 'JetBrains Mono,monospace' }}>
                      {i + 1}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: 'var(--text-sec)' }}>
                      {s.key}
                    </span>
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 99,
                      fontSize: 12, fontWeight: 600,
                      background: vs.bg, color: vs.color,
                    }}>
                      {s.label}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>
                      {nextLabels || <span style={{ color: 'var(--text-hint)', fontStyle: 'italic' }}>—</span>}
                    </span>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {s.is_default ? (
                        <span style={{ fontSize: 10, color: 'var(--text-hint)', padding: '2px 6px' }}>Default</span>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(s.id)}>🗑️</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleToggle(s)}
                        title={s.is_active ? 'Nonaktifkan' : 'Aktifkan'}>
                        {s.is_active ? '🟢' : '⚫'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditData(s); setFormOpen(true) }}>✏️</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-hint)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          💡 Urutan tampilan berdasarkan kolom <b>Urutan</b>. Status <b>Default</b> tidak dapat dihapus namun bisa diedit label dan warnanya.
        </div>
      </Card>

      <StatusFormModal
        open={formOpen}
        data={editData}
        statuses={statuses}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }}
        showToast={showToast}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Hapus Status"
        message="Hapus status ini? Tiket yang sudah menggunakan status ini tidak terpengaruh."
        confirmLabel="Hapus"
        danger
      />
    </div>
  )
}

/* ── Modal Form Status ── */
function StatusFormModal({ open, data, statuses, onClose, onSaved, showToast }) {
  const isEdit = !!data
  const blank  = { key: '', label: '', variant: 'gray', next_keys: [], sort_order: 99 }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(isEdit ? {
      key:        data.key,
      label:      data.label,
      variant:    data.variant,
      next_keys:  data.next_keys || [],
      sort_order: data.sort_order,
    } : blank)
  }, [open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleNext = (key) => {
    setForm(f => ({
      ...f,
      next_keys: f.next_keys.includes(key)
        ? f.next_keys.filter(k => k !== key)
        : [...f.next_keys, key],
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (isEdit) {
        await ticketStatusAPI.update(data.id, {
          label: form.label, variant: form.variant,
          next_keys: form.next_keys, sort_order: form.sort_order,
        })
        showToast('Status diperbarui')
      } else {
        await ticketStatusAPI.create(form)
        showToast('Status ditambahkan')
      }
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const otherStatuses = statuses.filter(s => !isEdit || s.id !== data?.id)

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `✏️ Edit Status "${data?.label}"` : '+ Tambah Status Baru'} width={480}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormInput
            label={isEdit ? 'Key (tidak bisa diubah)' : 'Key *'}
            value={form.key}
            onChange={e => set('key', e.target.value)}
            disabled={isEdit}
            required={!isEdit}
            placeholder="contoh: pending, review..."
            hint={isEdit ? 'Key adalah identifier unik, tidak dapat diubah' : 'Huruf kecil, underscore, tanpa spasi'}
          />
          <FormInput
            label="Label *"
            value={form.label}
            onChange={e => set('label', e.target.value)}
            required
            placeholder="Nama yang ditampilkan"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormSelect label="Warna Badge" value={form.variant} onChange={e => set('variant', e.target.value)}>
            {VARIANT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FormSelect>
          <FormInput
            label="Urutan"
            type="number" min="0" max="999"
            value={form.sort_order}
            onChange={e => set('sort_order', Number(e.target.value))}
            hint="Angka kecil tampil lebih awal"
          />
        </div>

        {/* Pilih transisi */}
        <div className="form-group">
          <label className="form-label">Transisi ke Status Berikutnya</label>
          <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 8 }}>
            Centang status yang bisa dipilih setelah status ini
          </div>
          {otherStatuses.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-hint)', padding: '8px 0' }}>Tidak ada status lain</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {otherStatuses.map(s => {
                const checked = form.next_keys.includes(s.key)
                return (
                  <label key={s.key} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${checked ? 'var(--ocean-mid)' : 'var(--border)'}`,
                    background: checked ? 'var(--ocean-pale)' : 'var(--bg-alt)',
                    fontSize: 12, fontWeight: checked ? 600 : 400,
                    transition: 'all 0.15s',
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleNext(s.key)}
                      style={{ display: 'none' }} />
                    {checked ? '☑' : '☐'} {s.label}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose} type="button">Batal</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah Status'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
