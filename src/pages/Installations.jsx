import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { installationAPI, settingsAPI } from '../utils/api'
import { getUser } from '../utils/auth'
import { Card, Badge, Button, Tabs, Modal, FormInput, FormSelect, SearchInput, EmptyState, ConfirmDialog } from '../components/UI'
import { fmtRupiah } from '../utils/tariff'

const STATUS_LABEL = {
  pending:   { text: 'Menunggu',   variant: 'warning' },
  invoiced:  { text: 'Invoice',    variant: 'info' },
  paid:      { text: 'Lunas',      variant: 'success' },
  installed: { text: 'Terpasang',  variant: 'success' },
  cancelled: { text: 'Dibatalkan', variant: 'danger' },
}

const STATUS_STEPS = [
  { key: 'pending',   label: '① Daftar',     icon: '📋' },
  { key: 'invoiced',  label: '② Invoice',    icon: '🧾' },
  { key: 'paid',      label: '③ Lunas',      icon: '✅' },
  { key: 'installed', label: '④ Terpasang',  icon: '🔧' },
]

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const emptyForm = { name: '', ktp: '', address: '', phone: '', email: '', group: 'R1', notes: '' }

export default function Installations() {
  const { showToast } = useStore()
  const user    = getUser()
  const isAdmin = user?.role === 'admin'

  const [items,       setItems]       = useState([])
  const [settings,    setSettings]    = useState({})
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState('all')
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState(null)   // detail panel
  const [modalOpen,   setModalOpen]   = useState(false)
  const [form,        setForm]        = useState(emptyForm)
  const [errors,      setErrors]      = useState({})
  const [saving,      setSaving]      = useState(false)

  // Invoice modal
  const [invoiceModal, setInvoiceModal] = useState(false)
  const [invoiceForm,  setInvoiceForm]  = useState({ installFee: '', adminFee: '' })

  // Install modal
  const [installModal, setInstallModal] = useState(false)
  const [installForm,  setInstallForm]  = useState({ meterNo: '', lastStand: '0' })
  const [installErrors,setInstallErrors]= useState({})

  const [confirmCancel, setConfirmCancel] = useState(null)
  const [confirmPay,    setConfirmPay]    = useState(null)

  const loadedRef = useRef(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [data, sett] = await Promise.all([installationAPI.getAll(), settingsAPI.get()])
      setItems(data)
      setSettings(sett)
      setInvoiceForm({ installFee: sett.installFee || '500000', adminFee: sett.installAdminFee || '50000' })
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    loadData()
  }, [])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Nama wajib diisi'
    if (!form.phone.trim()) e.phone = 'Nomor HP wajib diisi'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await installationAPI.create(form)
      showToast('Pendaftaran berhasil disimpan!')
      setModalOpen(false)
      setForm(emptyForm)
      setErrors({})
      loadedRef.current = false
      await loadData()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const handleInvoice = async () => {
    setSaving(true)
    try {
      const updated = await installationAPI.invoice(selected.id, {
        installFee: parseFloat(invoiceForm.installFee),
        adminFee:   parseFloat(invoiceForm.adminFee),
      })
      showToast('Invoice berhasil dibuat!')
      setInvoiceModal(false)
      setSelected(updated)
      loadedRef.current = false
      await loadData()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const handlePay = async (inst) => {
    setSaving(true)
    try {
      const updated = await installationAPI.pay(inst.id)
      showToast('Pembayaran dikonfirmasi!')
      setConfirmPay(null)
      setSelected(updated)
      loadedRef.current = false
      await loadData()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const handleInstall = async () => {
    const e = {}
    if (!installForm.meterNo.trim()) e.meterNo = 'Nomor meter wajib diisi'
    setInstallErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const updated = await installationAPI.install(selected.id, {
        meterNo:   installForm.meterNo,
        lastStand: parseFloat(installForm.lastStand) || 0,
      })
      showToast('Pemasangan selesai! Pelanggan baru telah didaftarkan.')
      setInstallModal(false)
      setSelected(updated)
      loadedRef.current = false
      await loadData()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const handleCancel = async (inst) => {
    try {
      await installationAPI.cancel(inst.id)
      showToast('Pendaftaran dibatalkan')
      setConfirmCancel(null)
      if (selected?.id === inst.id) setSelected(null)
      loadedRef.current = false
      await loadData()
    } catch (e) { showToast(e.message, 'error') }
  }

  const tabs = [
    { id: 'all',       label: 'Semua',      count: items.length },
    { id: 'pending',   label: 'Menunggu',   count: items.filter(i => i.status === 'pending').length },
    { id: 'invoiced',  label: 'Invoice',    count: items.filter(i => i.status === 'invoiced').length },
    { id: 'paid',      label: 'Lunas',      count: items.filter(i => i.status === 'paid').length },
    { id: 'installed', label: 'Terpasang',  count: items.filter(i => i.status === 'installed').length },
  ]

  const filtered = items
    .filter(i => tab === 'all' || i.status === tab)
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.phone || '').includes(search) || (i.invoiceNo || '').includes(search))

  // Progress bar width
  const stepIdx = (status) => ['pending','invoiced','paid','installed'].indexOf(status)

  const isMobile = window.innerWidth <= 768

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* ── Left: list ── */}
      <div style={{ flex: 1, minWidth: 0, display: isMobile && selected ? 'none' : undefined }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Cari nama, HP, invoice..." />
          </div>
          <Button variant="primary" onClick={() => { setForm(emptyForm); setErrors({}); setModalOpen(true) }} icon="➕">
            Daftar Baru
          </Button>
        </div>

        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        <Card padding={0}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat data...</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon="🔧" title="Belum ada pendaftaran" description="Tambah pendaftaran pasang baru"
              action={<Button variant="primary" onClick={() => setModalOpen(true)}>Daftar Baru</Button>} />
          ) : (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Nama / No HP</th>
                    <th className="hide-mobile">Invoice</th>
                    <th className="hide-mobile">Total</th>
                    <th>Status</th>
                    <th className="hide-mobile">Tgl Daftar</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inst => {
                    const sl = STATUS_LABEL[inst.status] || STATUS_LABEL.pending
                    return (
                      <tr key={inst.id} style={{ cursor: 'pointer', background: selected?.id === inst.id ? 'var(--ocean-pale)' : undefined }}
                        onClick={() => setSelected(inst)}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{inst.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{inst.phone}</div>
                        </td>
                        <td className="hide-mobile" style={{ fontSize: 12 }}>{inst.invoiceNo || '—'}</td>
                        <td className="hide-mobile mono" style={{ fontSize: 12 }}>
                          {inst.totalFee ? fmtRupiah(inst.totalFee) : '—'}
                        </td>
                        <td><Badge variant={sl.variant}>{sl.text}</Badge></td>
                        <td className="hide-mobile" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(inst.createdAt?.split(' ')[0])}</td>
                        <td onClick={e => e.stopPropagation()}>
                          {isAdmin && inst.status !== 'installed' && inst.status !== 'cancelled' && (
                            <Button variant="danger" size="sm" onClick={() => setConfirmCancel(inst)}>✕</Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Right: detail panel ── */}
      {selected && (
        <div style={{ width: isMobile ? '100%' : 320, flexShrink: 0 }}>
          {isMobile && (
            <button
              onClick={() => setSelected(null)}
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              ← Kembali ke daftar
            </button>
          )}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="card-title">Detail Pendaftaran</div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-hint)' }}>✕</button>
            </div>

            {/* Progress steps */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 14, left: '10%', right: '10%', height: 3, background: 'var(--border)', borderRadius: 2 }}>
                <div style={{ height: '100%', background: 'var(--ocean)', borderRadius: 2, width: `${(stepIdx(selected.status) / 3) * 100}%`, transition: 'width 0.4s' }} />
              </div>
              {STATUS_STEPS.map((s, i) => {
                const done    = stepIdx(selected.status) >= i
                const current = stepIdx(selected.status) === i
                return (
                  <div key={s.key} style={{ textAlign: 'center', position: 'relative', zIndex: 1, flex: 1 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                      background: done ? 'var(--ocean)' : 'var(--surface-2)', color: done ? '#fff' : 'var(--text-hint)',
                      border: current ? '2px solid var(--ocean)' : '2px solid transparent', fontWeight: 700 }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 10, color: done ? 'var(--ocean)' : 'var(--text-hint)' }}>{s.icon}</div>
                  </div>
                )
              })}
            </div>

            {/* Info rows */}
            {[
              ['Nama',        selected.name],
              ['No. HP',      selected.phone || '—'],
              ['KTP',         selected.ktp || '—'],
              ['Alamat',      selected.address || '—'],
              ['Grup Tarif',  selected.group],
              ['Catatan',     selected.notes || '—'],
              ['Invoice',     selected.invoiceNo || '—'],
              ['Tgl Invoice', fmtDate(selected.invoiceDate)],
              ['Biaya Pasang',selected.installFee ? fmtRupiah(selected.installFee) : '—'],
              ['Biaya Admin', selected.adminFee ? fmtRupiah(selected.adminFee) : '—'],
              ['Total',       selected.totalFee ? fmtRupiah(selected.totalFee) : '—'],
              ['Tgl Bayar',   fmtDate(selected.paidDate)],
              ['No. Meter',   selected.meterNo || '—'],
              ['Tgl Pasang',  fmtDate(selected.installedDate)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-hint)' }}>{label}</span>
                <span style={{ fontWeight: 600, textAlign: 'right', maxWidth: '55%', wordBreak: 'break-word' }}>{value}</span>
              </div>
            ))}

            {/* Action buttons */}
            {isAdmin && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.status === 'pending' && (
                  <Button variant="primary" icon="🧾"
                    onClick={() => { setInvoiceForm({ installFee: settings.installFee || '500000', adminFee: settings.installAdminFee || '50000' }); setInvoiceModal(true) }}>
                    Buat Invoice
                  </Button>
                )}
                {selected.status === 'invoiced' && (
                  <Button variant="primary" icon="✅" style={{ background: 'var(--mint)', border: 'none' }}
                    onClick={() => setConfirmPay(selected)}>
                    Konfirmasi Pembayaran Lunas
                  </Button>
                )}
                {selected.status === 'paid' && (
                  <Button variant="primary" icon="🔧"
                    onClick={() => { setInstallForm({ meterNo: '', lastStand: '0' }); setInstallErrors({}); setInstallModal(true) }}>
                    Tandai Terpasang
                  </Button>
                )}
                {selected.status === 'installed' && (
                  <div style={{ padding: '10px 12px', background: 'var(--ocean-pale)', borderRadius: 8, fontSize: 12, color: 'var(--ocean)', textAlign: 'center' }}>
                    🎉 Sudah jadi pelanggan aktif
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Invoice preview card */}
          {selected.status !== 'pending' && selected.status !== 'cancelled' && (
            <Card style={{ marginTop: 12 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>🧾 Invoice Pasang Baru</div>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 16 }}>{settings.companyName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{settings.companyAddress}</div>
              </div>
              <div style={{ borderTop: '1px dashed var(--border)', borderBottom: '1px dashed var(--border)', padding: '10px 0', marginBottom: 8 }}>
                {[
                  ['No. Invoice', selected.invoiceNo],
                  ['Tanggal',     fmtDate(selected.invoiceDate)],
                  ['Nama',        selected.name],
                  ['Alamat',      selected.address || '—'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                    <span style={{ color: 'var(--text-hint)' }}>{l}</span><span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              {[
                ['Biaya Pasang', selected.installFee],
                ['Biaya Admin',  selected.adminFee],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span>{l}</span><span>{v ? fmtRupiah(v) : '—'}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14, marginTop: 8, padding: '8px 0', borderTop: '2px solid var(--border)' }}>
                <span>TOTAL</span>
                <span style={{ color: 'var(--ocean)' }}>{selected.totalFee ? fmtRupiah(selected.totalFee) : '—'}</span>
              </div>
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <Badge variant={STATUS_LABEL[selected.status]?.variant}>{STATUS_LABEL[selected.status]?.text}</Badge>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Modal: Daftar Baru ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="➕ Pendaftaran Pasang Baru" width={520}>
        <div className="form-grid">
          <FormInput label="Nama Lengkap *" value={form.name} onChange={e => setField('name', e.target.value)} error={errors.name} />
          <FormInput label="No KTP" value={form.ktp} onChange={e => setField('ktp', e.target.value)} />
        </div>
        <FormInput label="Alamat" value={form.address} onChange={e => setField('address', e.target.value)} />
        <div className="form-grid">
          <FormInput label="No HP / WhatsApp *" value={form.phone} onChange={e => setField('phone', e.target.value)} error={errors.phone} placeholder="08xxxxxxxxxx" />
          <FormInput label="Email" type="email" value={form.email} onChange={e => setField('email', e.target.value)} />
        </div>
        <FormSelect label="Grup Tarif" value={form.group} onChange={e => setField('group', e.target.value)}>
          {['R1','R2','R3','K1','K2','I1'].map(g => <option key={g} value={g}>{g}</option>)}
        </FormSelect>
        <FormInput label="Catatan" value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Lokasi, permintaan khusus, dll" />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Batal</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Pendaftaran'}
          </Button>
        </div>
      </Modal>

      {/* ── Modal: Buat Invoice ── */}
      <Modal open={invoiceModal} onClose={() => setInvoiceModal(false)} title="🧾 Buat Invoice Pasang Baru" width={400}>
        <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 16 }}>
          Invoice untuk <b>{selected?.name}</b>
        </p>
        <FormInput label="Biaya Pasang (Rp)" type="number" addon="Rp"
          value={invoiceForm.installFee} onChange={e => setInvoiceForm(f => ({ ...f, installFee: e.target.value }))} />
        <FormInput label="Biaya Admin (Rp)" type="number" addon="Rp"
          value={invoiceForm.adminFee} onChange={e => setInvoiceForm(f => ({ ...f, adminFee: e.target.value }))} />
        <div style={{ padding: '10px 12px', background: 'var(--ocean-pale)', borderRadius: 8, fontSize: 13, marginBottom: 4 }}>
          Total: <b style={{ color: 'var(--ocean)' }}>
            {fmtRupiah((parseFloat(invoiceForm.installFee) || 0) + (parseFloat(invoiceForm.adminFee) || 0))}
          </b>
        </div>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setInvoiceModal(false)}>Batal</Button>
          <Button variant="primary" onClick={handleInvoice} disabled={saving}>
            {saving ? 'Menyimpan...' : 'Terbitkan Invoice'}
          </Button>
        </div>
      </Modal>

      {/* ── Modal: Tandai Terpasang ── */}
      <Modal open={installModal} onClose={() => setInstallModal(false)} title="🔧 Konfirmasi Pemasangan" width={400}>
        <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 16 }}>
          Setelah dikonfirmasi, <b>{selected?.name}</b> akan otomatis terdaftar sebagai pelanggan aktif.
        </p>
        <FormInput label="Nomor Meter *" value={installForm.meterNo}
          onChange={e => setInstallForm(f => ({ ...f, meterNo: e.target.value }))}
          placeholder="MET-0009" error={installErrors.meterNo} />
        <FormInput label="Stand Awal (m³)" type="number" value={installForm.lastStand}
          onChange={e => setInstallForm(f => ({ ...f, lastStand: e.target.value }))} />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setInstallModal(false)}>Batal</Button>
          <Button variant="primary" onClick={handleInstall} disabled={saving}>
            {saving ? 'Memproses...' : '✅ Konfirmasi Terpasang'}
          </Button>
        </div>
      </Modal>

      {/* Confirm: Lunas */}
      <ConfirmDialog
        open={!!confirmPay}
        onClose={() => setConfirmPay(null)}
        onConfirm={() => handlePay(confirmPay)}
        title="Konfirmasi Pembayaran"
        message={`Tandai pembayaran dari ${confirmPay?.name} sebagai LUNAS?\nTotal: ${confirmPay?.totalFee ? fmtRupiah(confirmPay.totalFee) : '—'}`}
        confirmLabel="Ya, Lunas"
      />

      {/* Confirm: Batalkan */}
      <ConfirmDialog
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={() => handleCancel(confirmCancel)}
        title="Batalkan Pendaftaran"
        message={`Yakin batalkan pendaftaran atas nama "${confirmCancel?.name}"?`}
        confirmLabel="Ya, Batalkan"
        danger
      />
    </div>
  )
}
