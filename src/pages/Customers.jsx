import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { customerAPI } from '../utils/api'
import { Card, Badge, Button, Modal, FormInput, FormSelect, SearchInput, EmptyState, ConfirmDialog } from '../components/UI'
import { GOLONGAN_OPTIONS } from '../utils/tariff'
import { useNavigate } from 'react-router-dom'

const empty = { name: '', ktp: '', meter: '', group: 'R1', address: '', phone: '', lastStand: 0 }

export default function Customers() {
  const { showToast } = useStore()
  const navigate = useNavigate()

  const [customers, setCustomers]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [editData, setEditData]     = useState(null)
  const [form, setForm]             = useState(empty)
  const [errors, setErrors]         = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [autoMeter, setAutoMeter]   = useState(true)
  const loadedRef = useRef(false)

  const loadCustomers = async () => {
    try {
      const data = await customerAPI.getAll({ status: 'active' })
      setCustomers(data)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    loadCustomers()
  }, [])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.meter.toLowerCase().includes(search.toLowerCase()) ||
    c.address.toLowerCase().includes(search.toLowerCase())
  )

  const openAdd  = () => {
    setEditData(null)
    setAutoMeter(true)
    setForm(empty)
    setErrors({})
    setModalOpen(true)
  }
  const openEdit = (c) => {
    setEditData(c)
    setAutoMeter(false)
    setForm({ name: c.name, ktp: c.ktp || '', meter: c.meter, group: c.group, address: c.address || '', phone: c.phone || '', lastStand: c.lastStand })
    setErrors({})
    setModalOpen(true)
  }

  const validate = () => {
    const errs = {}
    if (!form.name.trim())    errs.name    = 'Nama wajib diisi'
    if (!autoMeter && !form.meter.trim()) errs.meter = 'No. Meteran wajib diisi'
    if (!autoMeter) {
      const dup = customers.find(c => c.meter === form.meter && (!editData || c.id !== editData.id))
      if (dup) errs.meter = 'No. Meteran sudah digunakan'
    }
    if (!form.address.trim()) errs.address = 'Alamat wajib diisi'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      if (editData) {
        await customerAPI.update(editData.id, form)
        showToast('Data ' + form.name + ' berhasil diperbarui!')
      } else {
        await customerAPI.create({ ...form, meter: autoMeter ? '' : form.meter })
        showToast('Pelanggan ' + form.name + ' berhasil ditambahkan!')
      }
      setModalOpen(false)
      await loadCustomers()
    } catch (e) {
      if (e.message.includes('meter sudah digunakan') || e.message.includes('UNIQUE')) {
        setErrors(prev => ({ ...prev, meter: 'No. Meteran sudah digunakan' }))
      } else {
        showToast(e.message, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c) => {
    try {
      await customerAPI.remove(c.id)
      showToast('Pelanggan ' + c.name + ' dinonaktifkan')
      setConfirmDelete(null)
      await loadCustomers()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const groupCounts = ['R1', 'R2', 'R3', 'K1', 'K2'].map(g => ({
    g, count: customers.filter(c => c.group === g).length
  }))

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari nama, meteran, alamat..." />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-sec)', alignSelf: 'center' }}>
            {filtered.length} pelanggan
          </span>
          <Button variant="primary" onClick={openAdd} icon="➕">Tambah Pelanggan</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="group-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {groupCounts.map(({ g, count }) => (
          <Card key={g} style={{ padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit,sans-serif', color: 'var(--ocean)' }}>{count}</div>
            <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>{g}</div>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card padding={0}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat data...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="👥" title="Tidak ada pelanggan ditemukan" description="Coba ubah kata pencarian atau tambah pelanggan baru" action={<Button variant="primary" onClick={openAdd}>Tambah Pelanggan</Button>} />
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 'var(--radius)' }}>
            <table>
              <thead>
                <tr>
                  <th className="hide-mobile">No.</th><th>Nama Pelanggan</th><th>No. Meteran</th>
                  <th className="hide-mobile">Alamat</th><th>Gol.</th><th className="hide-mobile">Telp</th>
                  <th className="hide-mobile">Stand Terakhir</th><th className="hide-mobile">Status</th><th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id}>
                    <td className="hide-mobile" style={{ color: 'var(--text-hint)', fontSize: 12 }}>{i + 1}</td>
                    <td>
                      <b style={{ display: 'block' }}>{c.name}</b>
                      <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>Sejak {c.joinDate}</span>
                      <span className="mono hide-mobile" style={{ fontSize: 11, color: 'var(--text-hint)' }}>{c.lastStand.toLocaleString('id-ID')} m³</span>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{c.meter}</td>
                    <td className="hide-mobile" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={c.address}>{c.address}</td>
                    <td><Badge variant="info">{c.group}</Badge></td>
                    <td className="hide-mobile" style={{ fontSize: 12 }}>{c.phone}</td>
                    <td className="mono hide-mobile" style={{ fontWeight: 700 }}>{c.lastStand.toLocaleString('id-ID')} m³</td>
                    <td className="hide-mobile"><Badge variant="success">Aktif</Badge></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button variant="secondary" size="sm" onClick={() => navigate('/meters')} icon="💧">Baca</Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>✏️</Button>
                        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(c)}>🗑️</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editData ? '✏️ Edit Pelanggan' : '➕ Tambah Pelanggan Baru'} width={560}>
        <div className="form-grid">
          <FormInput label="Nama Lengkap" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Budi Santoso" error={errors.name} />
          <FormInput label="No. KTP" value={form.ktp} onChange={e => setForm({ ...form, ktp: e.target.value })} placeholder="16 digit" maxLength={16} />
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="form-label" style={{ margin: 0 }}>No. Meteran</label>
              {!editData && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-sec)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoMeter}
                    onChange={e => {
                      setAutoMeter(e.target.checked)
                      if (!e.target.checked) setForm(p => ({ ...p, meter: '' }))
                    }}
                    style={{ width: 14, height: 14 }}
                  />
                  Auto
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className={`form-input${errors.meter ? ' error' : ''}`}
                style={{ flex: 1, color: autoMeter && !editData ? 'var(--text-hint)' : undefined }}
                value={autoMeter && !editData ? form.meter : form.meter}
                onChange={e => setForm({ ...form, meter: e.target.value })}
                placeholder={autoMeter && !editData ? 'MET-xxxx (otomatis dari ID)' : 'MET-0001'}
                readOnly={autoMeter && !editData}
              />
            </div>
            {errors.meter && <div className="form-hint" style={{ color: 'var(--danger)' }}>{errors.meter}</div>}
          </div>
          <FormSelect label="Golongan" value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}>
            {GOLONGAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FormSelect>
        </div>
        <FormInput label="Alamat Lengkap" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Jl. Contoh No. 1, Kelurahan, Kecamatan" error={errors.address} />
        <div className="form-grid">
          <FormInput label="No. Telepon" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="08xx-xxxx-xxxx" />
          <FormInput label="Stand Meter Awal (m³)" type="number" value={form.lastStand} onChange={e => setForm({ ...form, lastStand: parseInt(e.target.value) || 0 })} addon="m³" hint={editData ? 'Stand terakhir tercatat' : 'Stand awal pemasangan'} />
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Batal</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan...' : editData ? 'Simpan Perubahan' : 'Tambah Pelanggan'}</Button>
        </div>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => handleDelete(confirmDelete)}
        title="Nonaktifkan Pelanggan"
        message={`Yakin ingin menonaktifkan pelanggan ${confirmDelete?.name}? Data tagihan tetap tersimpan.`}
        confirmLabel="Ya, nonaktifkan"
        danger
      />
    </div>
  )
}
