import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { getUser } from '../utils/auth'
import { ticketAPI, ticketCategoryAPI, ticketStatusAPI, customerAPI } from '../utils/api'
import {
  Card, Badge, Button, Tabs, SearchInput, EmptyState,
  Modal, FormInput, FormSelect, ConfirmDialog,
} from '../components/UI'

const PRIORITY_LABEL   = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi', critical: 'Kritis' }
const PRIORITY_VARIANT = { low: 'gray', medium: 'warning', high: 'danger', critical: 'danger' }

// Fallback statis jika statuses belum dimuat
const FALLBACK_STATUS_LABEL   = { open: 'Baru', in_progress: 'Dikerjakan', resolved: 'Selesai', closed: 'Ditutup' }
const FALLBACK_STATUS_VARIANT = { open: 'warning', in_progress: 'info', resolved: 'success', closed: 'gray' }

function buildStatusMaps(statuses) {
  const label   = {}
  const variant = {}
  const next    = {}
  statuses.forEach(s => {
    label[s.key]   = s.label
    variant[s.key] = s.variant
    next[s.key]    = (s.next_keys || []).map(k => ({
      value: k,
      label: statuses.find(x => x.key === k)?.label || k,
    }))
  })
  return { label, variant, next }
}

export default function Tickets() {
  const { showToast } = useStore()
  const user = getUser()
  const [tickets, setTickets]         = useState([])
  const [statuses, setStatuses]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('all')
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState(null)
  const [detail, setDetail]           = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [formOpen, setFormOpen]           = useState(false)
  const [editOpen, setEditOpen]           = useState(false)
  const [statusModal, setStatusModal]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [catOpen, setCatOpen]             = useState(false)
  const loadedRef = useRef(false)

  const load = async () => {
    try {
      const [t, s] = await Promise.all([ticketAPI.getAll(), ticketStatusAPI.meta()])
      setTickets(t)
      setStatuses(s)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    load()
  }, [])

  const loadDetail = async (id) => {
    setLoadingDetail(true)
    try {
      setDetail(await ticketAPI.getById(id))
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleSelect = (t) => {
    setSelected(t)
    loadDetail(t.id)
  }

  const handleDelete = async () => {
    try {
      await ticketAPI.remove(detail.id)
      showToast('Tiket dihapus')
      setSelected(null); setDetail(null)
      load()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  // Build label/variant/next maps dari DB statuses
  const sm = buildStatusMaps(statuses)
  const statusLabel   = k => sm.label[k]   ?? FALLBACK_STATUS_LABEL[k]   ?? k
  const statusVariant = k => sm.variant[k] ?? FALLBACK_STATUS_VARIANT[k] ?? 'gray'
  const statusNext    = k => sm.next[k]    ?? []

  const tabs = [
    { id: 'all', label: 'Semua', count: tickets.length },
    ...statuses.map(s => ({
      id: s.key, label: s.label, count: tickets.filter(t => t.status === s.key).length
    })),
  ]

  const filtered = tickets.filter(t => {
    const matchTab = tab === 'all' || t.status === tab
    const matchSearch = !search ||
      t.ticketNo.toLowerCase().includes(search.toLowerCase()) ||
      t.reporterName.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      (t.custName || '').toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  const isMobile = window.innerWidth <= 768

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* ── List Panel ── */}
      <div style={{ flex: 1, minWidth: 0, display: isMobile && selected ? 'none' : undefined }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Cari no. tiket, nama, deskripsi..." />
          </div>
          {user?.role === 'admin' && (
            <Button variant="secondary" size="sm" onClick={() => setCatOpen(true)}>🏷️ Kategori</Button>
          )}
          <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>+ Tiket Baru</Button>
        </div>

        <Tabs tabs={tabs} active={tab} onChange={t => { setTab(t); setSelected(null); setDetail(null) }} />

        <Card padding={0}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat data...</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon="🎫" title="Tidak ada tiket" description="Tidak ada pengaduan yang cocok dengan filter" />
          ) : filtered.map(t => (
            <div
              key={t.id}
              onClick={() => handleSelect(t)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selected?.id === t.id ? 'var(--bg-alt)' : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-hint)' }}>{t.ticketNo}</span>
                    <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
                    <Badge variant={PRIORITY_VARIANT[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.reporterName}
                    {t.custName && <span style={{ fontWeight: 400, color: 'var(--text-hint)', fontSize: 12 }}> · {t.custName}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 1 }}>{t.category}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.description}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-hint)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                  {fmtDate(t.createdAt)}
                  {t.assignedTo && <div style={{ marginTop: 2, fontSize: 10 }}>👷 {t.assignedTo}</div>}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* ── Detail Panel ── */}
      {selected && (
        <div style={{ width: isMobile ? '100%' : 360, flexShrink: 0 }}>
          {isMobile && (
            <button
              onClick={() => { setSelected(null); setDetail(null) }}
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              ← Kembali ke daftar
            </button>
          )}
          <Card>
            {loadingDetail ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat...</div>
            ) : detail ? (
              <>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-hint)', marginBottom: 6 }}>{detail.ticketNo}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Badge variant={statusVariant(detail.status)}>{statusLabel(detail.status)}</Badge>
                      <Badge variant={PRIORITY_VARIANT[detail.priority]}>{PRIORITY_LABEL[detail.priority]}</Badge>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>✏️ Edit</Button>
                    {user?.role === 'admin' && (
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(true)}>🗑️</Button>
                    )}
                  </div>
                </div>

                {/* Info rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, fontSize: 13 }}>
                  <InfoRow label="Pelapor"    value={detail.reporterName} />
                  {detail.reporterPhone && <InfoRow label="Telepon"   value={detail.reporterPhone} />}
                  {detail.custName      && <InfoRow label="Pelanggan" value={`${detail.custName} (${detail.custMeter})`} />}
                  <InfoRow label="Kategori"   value={detail.category} />
                  <InfoRow label="Dibuat"     value={fmtDate(detail.createdAt)} />
                  {detail.assignedTo   && <InfoRow label="Ditangani" value={detail.assignedTo} />}
                  {detail.resolvedAt   && <InfoRow label="Selesai"   value={fmtDate(detail.resolvedAt)} />}
                </div>

                {/* Deskripsi */}
                <div style={{ fontSize: 11, color: 'var(--text-hint)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deskripsi</div>
                <div style={{ fontSize: 13, background: 'var(--bg-alt)', borderRadius: 8, padding: '10px 12px',
                  lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{detail.description}</div>

                {/* Catatan internal */}
                {detail.notes && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-hint)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catatan Internal</div>
                    <div style={{ fontSize: 12, background: 'var(--bg-alt)', borderRadius: 8, padding: '8px 12px',
                      lineHeight: 1.55, color: 'var(--text-sec)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{detail.notes}</div>
                  </>
                )}

                {/* Aksi status */}
                {statusNext(detail.status).length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    {statusNext(detail.status).map(s => (
                      <Button key={s.value} variant="primary" size="sm" onClick={() => setStatusModal(true)}>
                        {s.label}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Riwayat */}
                {detail.updates?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-hint)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Riwayat</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {detail.updates.map(u => (
                        <div key={u.id} style={{ fontSize: 12, borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Badge variant={statusVariant(u.status)}>{statusLabel(u.status)}</Badge>
                            <span style={{ color: 'var(--text-hint)', fontSize: 11 }}>{fmtDate(u.createdAt)}</span>
                          </div>
                          <div style={{ color: 'var(--text-hint)', fontSize: 11, marginTop: 2 }}>oleh {u.createdBy}</div>
                          {u.note && <div style={{ marginTop: 3, color: 'var(--text-sec)', fontStyle: 'italic' }}>{u.note}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </Card>
        </div>
      )}

      {/* ── Modals ── */}
      <TicketFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }}
        showToast={showToast}
      />

      {detail && (
        <EditTicketModal
          open={editOpen}
          ticket={detail}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); load(); loadDetail(detail.id) }}
          showToast={showToast}
        />
      )}

      {detail && (
        <StatusModal
          open={statusModal}
          ticket={detail}
          statuses={statuses}
          onClose={() => setStatusModal(false)}
          onSaved={() => { setStatusModal(false); load(); loadDetail(detail.id) }}
          showToast={showToast}
        />
      )}

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Hapus Tiket"
        message={`Hapus tiket ${detail?.ticketNo}? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        danger
      />

      {catOpen && (
        <CategoryMasterModal
          onClose={() => setCatOpen(false)}
          showToast={showToast}
        />
      )}
    </div>
  )
}

/* ── Info Row ── */
function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: 'var(--text-hint)', minWidth: 84, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}

/* ── Tiket Baru ── */
function TicketFormModal({ open, onClose, onSaved, showToast }) {
  const blank = { reporterName: '', reporterPhone: '', custId: '', category: '', description: '', priority: 'medium' }
  const [form, setForm]         = useState(blank)
  const [categories, setCategories] = useState([])
  const [customers, setCustomers]   = useState([])
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(blank)
    Promise.all([ticketAPI.categories(), customerAPI.getAll()])
      .then(([cats, custs]) => { setCategories(cats); setCustomers(custs) })
      .catch(() => {})
  }, [open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await ticketAPI.create({ ...form, custId: form.custId ? Number(form.custId) : undefined })
      showToast('Tiket berhasil dibuat')
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🎫 Tiket Pengaduan Baru" width={500}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormInput label="Nama Pelapor *" value={form.reporterName}
            onChange={e => set('reporterName', e.target.value)} required placeholder="Nama lengkap" />
          <FormInput label="No. Telepon" value={form.reporterPhone}
            onChange={e => set('reporterPhone', e.target.value)} placeholder="08xx / 62xx" />
        </div>

        <FormSelect label="Pelanggan (opsional)" value={form.custId} onChange={e => set('custId', e.target.value)}>
          <option value="">— Bukan pelanggan / tidak diketahui —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.meter}</option>)}
        </FormSelect>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormSelect label="Kategori *" value={form.category} onChange={e => set('category', e.target.value)} required>
            <option value="">— Pilih kategori —</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </FormSelect>
          <FormSelect label="Prioritas" value={form.priority} onChange={e => set('priority', e.target.value)}>
            <option value="low">Rendah</option>
            <option value="medium">Sedang</option>
            <option value="high">Tinggi</option>
            <option value="critical">Kritis</option>
          </FormSelect>
        </div>

        <div className="form-group">
          <label className="form-label">Deskripsi Keluhan *</label>
          <textarea className="form-input" rows={4} required style={{ resize: 'vertical' }}
            value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Jelaskan keluhan atau gangguan yang dialami..." />
        </div>

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose} type="button">Batal</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Buat Tiket'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Edit Tiket ── */
function EditTicketModal({ open, ticket, onClose, onSaved, showToast }) {
  const [form, setForm]             = useState({})
  const [categories, setCategories] = useState([])
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (!open || !ticket) return
    setForm({
      reporterName:  ticket.reporterName,
      reporterPhone: ticket.reporterPhone || '',
      category:      ticket.category,
      description:   ticket.description,
      priority:      ticket.priority,
      assignedTo:    ticket.assignedTo || '',
      notes:         ticket.notes || '',
    })
    ticketAPI.categories().then(setCategories).catch(() => {})
  }, [open, ticket])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await ticketAPI.update(ticket.id, form)
      showToast('Tiket diperbarui')
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`✏️ Edit Tiket ${ticket?.ticketNo}`} width={500}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormInput label="Nama Pelapor *" value={form.reporterName || ''}
            onChange={e => set('reporterName', e.target.value)} required />
          <FormInput label="No. Telepon" value={form.reporterPhone || ''}
            onChange={e => set('reporterPhone', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormSelect label="Kategori" value={form.category || ''} onChange={e => set('category', e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </FormSelect>
          <FormSelect label="Prioritas" value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)}>
            <option value="low">Rendah</option>
            <option value="medium">Sedang</option>
            <option value="high">Tinggi</option>
            <option value="critical">Kritis</option>
          </FormSelect>
        </div>

        <FormInput label="Ditangani Oleh" value={form.assignedTo || ''}
          onChange={e => set('assignedTo', e.target.value)} placeholder="Nama petugas yang menangani" />

        <div className="form-group">
          <label className="form-label">Deskripsi</label>
          <textarea className="form-input" rows={3} style={{ resize: 'vertical' }}
            value={form.description || ''} onChange={e => set('description', e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label">Catatan Internal</label>
          <textarea className="form-input" rows={2} style={{ resize: 'vertical' }}
            value={form.notes || ''} onChange={e => set('notes', e.target.value)}
            placeholder="Catatan untuk tim (tidak terlihat pelanggan)" />
        </div>

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose} type="button">Batal</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Ubah Status ── */
function StatusModal({ open, ticket, statuses, onClose, onSaved, showToast }) {
  const sm      = buildStatusMaps(statuses || [])
  const options = sm.next[ticket?.status] || []
  const [status, setStatus] = useState('')
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && options.length) { setStatus(options[0].value); setNote('') }
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await ticketAPI.updateStatus(ticket.id, { status, note })
      showToast(`Status diubah ke "${sm.label[status] ?? status}"`)
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🔄 Ubah Status Tiket" width={440}>
      <div style={{ background: 'var(--bg-alt)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
        <span style={{ color: 'var(--text-hint)' }}>Tiket: </span>
        <b>{ticket?.ticketNo}</b> — {ticket?.reporterName}
        <div style={{ marginTop: 2, color: 'var(--text-hint)', fontSize: 12 }}>{ticket?.category}</div>
      </div>
      <form onSubmit={handleSubmit}>
        <FormSelect label="Status Baru" value={status} onChange={e => setStatus(e.target.value)}>
          {options.map(o => <option key={o.value} value={o.value}>{sm.label[o.value] ?? o.label}</option>)}
        </FormSelect>
        <div className="form-group">
          <label className="form-label">Catatan Tindakan (opsional)</label>
          <textarea className="form-input" rows={3} style={{ resize: 'vertical' }}
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Tuliskan tindakan yang dilakukan atau alasan perubahan status..." />
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose} type="button">Batal</Button>
          <Button variant="primary" type="submit" disabled={saving || !status}>
            {saving ? 'Menyimpan...' : 'Ubah Status'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Master Kategori (admin) ── */
function CategoryMasterModal({ onClose, showToast }) {
  const [cats, setCats]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [newName, setNewName]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState(null)
  const [editName, setEditName]   = useState('')
  const [deleteId, setDeleteId]   = useState(null)

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

  const handleDelete = async (id) => {
    try {
      await ticketCategoryAPI.remove(id)
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
    <Modal open onClose={onClose} title="🏷️ Master Kategori Pengaduan" width={480}>
      {/* Form tambah */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="form-input" style={{ flex: 1 }} value={newName}
          onChange={e => setNewName(e.target.value)} placeholder="Nama kategori baru..." required />
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? '...' : '+ Tambah'}
        </Button>
      </form>

      {/* Daftar */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cats.map(cat => (
            <div key={cat.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: 'var(--bg-alt)', borderRadius: 8,
              opacity: cat.is_active ? 1 : 0.5,
            }}>
              {editId === cat.id ? (
                <>
                  <input className="form-input" style={{ flex: 1, padding: '4px 8px', fontSize: 13 }}
                    value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleEdit(cat.id); if (e.key === 'Escape') setEditId(null) }}
                    autoFocus />
                  <Button size="sm" variant="primary" onClick={() => handleEdit(cat.id)}>✓</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>✕</Button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{cat.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => handleToggle(cat)}
                    title={cat.is_active ? 'Nonaktifkan' : 'Aktifkan'}>
                    {cat.is_active ? '👁️' : '🚫'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(cat.id); setEditName(cat.name) }}>✏️</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteId(cat.id)}>🗑️</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-hint)' }}>
        👁️ Aktif / 🚫 Nonaktif — kategori nonaktif tidak muncul di form pengaduan
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => handleDelete(deleteId)}
        title="Hapus Kategori"
        message="Hapus kategori ini? Tiket yang sudah ada tidak terpengaruh."
        confirmLabel="Hapus"
        danger
      />
    </Modal>
  )
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
