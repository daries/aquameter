import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { Card, Button } from '../components/UI'
import { InvoiceModal } from '../components/InvoiceModal'
import { fmtRupiah } from '../utils/tariff'
import { readingAPI, settingsAPI, tariffAPI, customerAPI } from '../utils/api'

// Hitung preview tagihan dari tarif + settings yang diambil dari server
function calcPreview(liveTariffs, group, usage, liveSettings) {
  if (!liveTariffs || !liveTariffs[group] || usage <= 0) return null
  const blocks    = liveTariffs[group]
  const adminFee  = parseFloat(liveSettings.adminFee) || 5000
  const ppjActive = liveSettings.ppjEnabled !== 'false' && liveSettings.ppjEnabled !== false
  const ppjRate   = ppjActive ? (parseFloat(liveSettings.ppjRate) || 10) : 0

  let cost = 0, prev = 0, bkResult = []
  for (const b of blocks) {
    if (usage <= prev) break
    const lim = b.limit === null ? usage : b.limit
    const vol = Math.min(usage - prev, lim - prev)
    if (vol > 0) { cost += vol * b.price; bkResult.push({ vol, price: b.price, sub: vol * b.price }) }
    prev = lim
    if (b.limit === null) break
  }
  const ppj = Math.round(cost * ppjRate / 100)
  return { waterCost: cost, blocks: bkResult, admin: adminFee, ppj, ppjRate, ppjActive, total: cost + adminFee + ppj }
}

// ─── Step indicator ───
function StepBar({ step }) {
  const steps = ['Cari Pelanggan', 'Foto Meter', 'Catat Stand']
  return (
    <div className="step-bar">
      {steps.map((label, i) => {
        const n = i + 1
        const done    = n < step
        const current = n === step
        return (
          <div key={n} className="step-item">
            <div className={`step-circle ${done ? 'done' : current ? 'active' : ''}`}>
              {done ? '✓' : n}
            </div>
            <div className={`step-label ${current ? 'active' : ''}`}>{label}</div>
            {i < steps.length - 1 && <div className={`step-line ${done ? 'done' : ''}`} />}
          </div>
        )
      })}
    </div>
  )
}

// ─── Customer Search — only unread customers ───
function CustomerSearch({ customers, readIds, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const wrapRef           = useRef(null)

  // Only show customers that haven't been read this period
  const unreadCustomers = customers.filter(c => !readIds.has(c.id))

  const filtered = query.length < 1
    ? unreadCustomers.slice(0, 8)
    : unreadCustomers.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.meter.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (c) => {
    setQuery(c.name)
    setOpen(false)
    onSelect(c)
  }

  const clear = () => {
    setQuery('')
    setOpen(false)
    onSelect(null)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label className="form-label">Cari Pelanggan Belum Dibaca</label>
      <div className="search-input-wrap">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="form-input search-with-icon"
          placeholder={unreadCustomers.length === 0 ? 'Semua pelanggan sudah dibaca!' : `${unreadCustomers.length} pelanggan belum dibaca...`}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          disabled={unreadCustomers.length === 0}
        />
        {query && <button className="search-clear" onClick={clear}>✕</button>}
      </div>

      {open && (
        <div className="search-dropdown">
          {filtered.length > 0 ? filtered.map(c => (
            <div key={c.id} className="search-dropdown-item" onClick={() => select(c)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>💧</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
                    {c.meter} · Gol. {c.group} · Stand: <b>{c.lastStand} m³</b>
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <div style={{ padding: '14px 16px', color: 'var(--text-hint)', fontSize: 13, textAlign: 'center' }}>
              Tidak ada pelanggan yang cocok
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Compress image ke JPEG dengan resize ───────────────────────────────────
const MAX_DIM  = 1024  // px — cukup untuk baca angka meter
const QUALITY  = 0.78  // JPEG 78% — jernih tapi ringan

function compressDataUrl(dataUrl, maxDim = MAX_DIM, quality = QUALITY) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim } }
      else        { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim } }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)   // fallback: kirim asli
    img.src = dataUrl
  })
}

function sizeKb(dataUrl) {
  // Base64 → estimasi byte: setiap 4 karakter ≈ 3 byte
  return Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4 / 1024)
}

// ─── Camera capture ───
function CameraCapture({ onCapture }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const [stream,      setStream]      = useState(null)
  const [photo,       setPhoto]       = useState(null)
  const [photoInfo,   setPhotoInfo]   = useState(null)   // { kb, origKb }
  const [camError,    setCamError]    = useState(null)
  const [camReady,    setCamReady]    = useState(false)
  const [compressing, setCompressing] = useState(false)

  const startCamera = useCallback(async () => {
    setCamError(null); setCamReady(false)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      setStream(s)
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.onloadedmetadata = () => setCamReady(true)
      }
    } catch {
      setCamError('Tidak dapat mengakses kamera. Gunakan tombol upload di bawah.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null) }
    setCamReady(false)
  }, [stream])

  useEffect(() => { startCamera() }, [])
  useEffect(() => () => { if (stream) stream.getTracks().forEach(t => t.stop()) }, [stream])

  const capturePhoto = async () => {
    const video = videoRef.current, canvas = canvasRef.current
    // Gambar ke canvas asli dulu untuk ukuran asli
    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0)
    const raw = canvas.toDataURL('image/jpeg', 1.0)
    const origKb = sizeKb(raw)

    setCompressing(true); stopCamera()
    const compressed = await compressDataUrl(raw)
    const kb = sizeKb(compressed)
    setPhoto(compressed); setPhotoInfo({ kb, origKb }); onCapture(compressed)
    setCompressing(false)
  }

  const retake = () => { setPhoto(null); setPhotoInfo(null); onCapture(null); startCamera() }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const origKb = Math.round(file.size / 1024)
    setCompressing(true); stopCamera()

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const compressed = await compressDataUrl(ev.target.result)
      const kb = sizeKb(compressed)
      setPhoto(compressed); setPhotoInfo({ kb, origKb }); onCapture(compressed)
      setCompressing(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="camera-wrap">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {photo ? (
        <div className="camera-preview-wrap">
          <img src={photo} alt="Foto meter" className="camera-preview-img" />
          <div className="camera-preview-badge">
            ✅ Foto berhasil diambil
            {photoInfo && (
              <span style={{ marginLeft: 6, opacity: 0.8, fontWeight: 400 }}>
                · {photoInfo.origKb > photoInfo.kb
                  ? `${photoInfo.origKb} KB → ${photoInfo.kb} KB`
                  : `${photoInfo.kb} KB`}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="camera-live-wrap">
          {camError
            ? <div className="camera-error">{camError}</div>
            : <video ref={videoRef} autoPlay playsInline muted className="camera-video" style={{ opacity: camReady ? 1 : 0 }} />
          }
          {!camReady && !camError && <div className="camera-loading">📷 Memuat kamera...</div>}
          {compressing && <div className="camera-loading">🗜️ Mengompres foto...</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {!photo ? (
          <>
            {!camError && (
              <Button variant="primary" onClick={capturePhoto} disabled={!camReady || compressing} icon="📷">
                {compressing ? 'Memproses...' : 'Ambil Foto'}
              </Button>
            )}
            <label className={`btn btn-ghost${compressing ? ' disabled' : ''}`} style={{ cursor: compressing ? 'not-allowed' : 'pointer' }}>
              📁 Upload dari Galeri
              <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} style={{ display: 'none' }} disabled={compressing} />
            </label>
          </>
        ) : (
          <Button variant="ghost" onClick={retake} icon="🔄">Ambil Ulang</Button>
        )}
      </div>
    </div>
  )
}

// ─── Edit Reading Modal ───
function EditReadingModal({ reading, onSave, onClose }) {
  const [stand, setStand] = useState(String(reading.currentStand))
  const [date,  setDate]  = useState(reading.date)
  const [note,  setNote]  = useState(reading.note || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const val = parseFloat(stand)
    if (isNaN(val) || val < reading.lastStand) {
      setError(`Stand baru tidak boleh kurang dari stand lama (${reading.lastStand} m³)`)
      return
    }
    setSaving(true)
    try {
      const updated = await readingAPI.update(reading.id, { currentStand: val, date, note })
      onSave(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: '100%', maxWidth: 440 }}>
        <div className="modal-title">✏️ Edit Pembacaan Meter</div>

        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>{reading.custName}</div>
          <div style={{ color: 'var(--text-hint)', fontSize: 11 }}>{reading.meter} · Periode {reading.period}</div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Stand Lama (m³)</label>
            <div className="input-group">
              <input type="number" className="form-input mono" value={reading.lastStand} readOnly
                style={{ background: 'var(--bg)', color: 'var(--text-sec)' }} />
              <span className="input-addon">m³</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Stand Baru (m³)</label>
            <div className="input-group">
              <input
                type="number"
                className={`form-input mono ${error ? 'error' : ''}`}
                value={stand}
                min={reading.lastStand + 1}
                onChange={e => { setStand(e.target.value); setError('') }}
                autoFocus
              />
              <span className="input-addon">m³</span>
            </div>
          </div>
        </div>

        {error && <div className="form-hint" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Tanggal Baca</label>
            <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Catatan</label>
            <input type="text" className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Normal, bocor, dll." />
          </div>
        </div>

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} icon="💾">
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Muat ulang readings dari API (centralized agar tidak ada double)
async function loadReadings(setApiReadings, setLoadingReadings) {
  try {
    const data = await readingAPI.getAll({ limit: 100 })
    setApiReadings(data)
  } catch (e) { /* ignore */ }
  finally { setLoadingReadings(false) }
}

// ─── Main page ───
export default function Meters() {
  const { showToast } = useStore()

  const [customers,      setCustomers]      = useState([])
  const [apiReadings,    setApiReadings]    = useState([])
  const [loadingReadings, setLoadingReadings] = useState(true)
  const [liveSettings,   setLiveSettings]   = useState({})
  const [liveTariffs,    setLiveTariffs]    = useState(null)
  const loadedRef = useRef(false)

  const [step, setStep]             = useState(1)
  const [customer, setCustomer]     = useState(null)
  const [photo, setPhoto]           = useState(null)
  const [currentStand, setCurrentStand] = useState('')
  const [date, setDate]             = useState(new Date().toISOString().split('T')[0])
  const [note, setNote]             = useState('')
  const [standError, setStandError] = useState('')
  const [saving, setSaving]         = useState(false)
  const [newBill, setNewBill]       = useState(null)
  const [editingReading, setEditingReading] = useState(null)
  const [photoPreview,   setPhotoPreview]   = useState(null)

  const thisMonth       = date.substring(0, 7)
  const readIds         = new Set(apiReadings.filter(r => r.period === thisMonth).map(r => r.custId))
  const historyReadings = apiReadings.slice(0, 15)

  const usage   = customer ? Math.max(0, parseFloat(currentStand || 0) - customer.lastStand) : 0
  const preview = calcPreview(liveTariffs, customer?.group, usage, liveSettings)

  const progress = {
    done:  readIds.size,
    total: customers.length,
    pct:   customers.length ? Math.round(readIds.size / customers.length * 100) : 0,
  }

  const refreshCustomers = () =>
    customerAPI.getAll({ status: 'active' }).then(setCustomers).catch(() => {})

  // Muat semua data dari server — satu kali
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    loadReadings(setApiReadings, setLoadingReadings)
    refreshCustomers()

    settingsAPI.get()
      .then(data => setLiveSettings(data))
      .catch(() => {})

    tariffAPI.getAll()
      .then(data => setLiveTariffs(data))
      .catch(() => {})
  }, [])

  const handleSelectCustomer = (c) => {
    setCustomer(c); setPhoto(null); setCurrentStand(''); setStandError('')
    setStep(c ? 2 : 1)
  }

  const handlePhotoCapture = (dataUrl) => {
    setPhoto(dataUrl)
    if (dataUrl) setStep(3)
  }

  const handleSave = async () => {
    if (!customer) return
    if (!photo) { showToast('Foto meter wajib diambil terlebih dahulu', 'error'); return }
    const val = parseFloat(currentStand)
    if (!currentStand || isNaN(val)) { setStandError('Masukkan angka stand meter'); return }
    if (val <= customer.lastStand) {
      setStandError(`Harus lebih besar dari stand lama (${customer.lastStand} m³)`)
      return
    }
    setStandError(''); setSaving(true)
    try {
      const { bill } = await readingAPI.create({
        custId: customer.id, currentStand: val, date, note, photo,
      })
      // Reload dari API agar riwayat akurat dan tidak double
      setLoadingReadings(true)
      await loadReadings(setApiReadings, setLoadingReadings)
      await refreshCustomers()
      setNewBill(bill)
      showToast(`Tagihan ${bill.invoiceNo} berhasil dibuat! Total: ${fmtRupiah(bill.total)}`)
      resetForm()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleEditSave = async () => {
    setEditingReading(null)
    setLoadingReadings(true)
    await loadReadings(setApiReadings, setLoadingReadings)
    await refreshCustomers()
    showToast('Pembacaan berhasil diperbarui')
  }

  const resetForm = () => {
    setCustomer(null); setPhoto(null); setCurrentStand(''); setNote('')
    setStandError(''); setStep(1)
  }

  return (
    <div>
      {/* Hero */}
      <div className="meter-display">
        <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 1.5 }}>
          Progress Baca Meter — {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        </div>
        <div className="meter-number">
          {progress.done}<span className="meter-unit"> / {progress.total}</span>
        </div>
        <div className="meter-meta">
          <div className="meter-meta-item">Sudah Dibaca<span>{progress.done} pelanggan</span></div>
          <div className="meter-meta-item">Belum Dibaca<span>{progress.total - progress.done} pelanggan</span></div>
          <div className="meter-meta-item">Persentase<span>{progress.pct}%</span></div>
        </div>
        <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.2)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#fff', borderRadius: 99, width: progress.pct + '%', transition: 'width 0.5s' }} />
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* ─── Left: Form catat meter ─── */}
        <div>
          <Card>
            <div className="card-header" style={{ marginBottom: 20 }}>
              <div className="card-title">Input Pembacaan Meteran</div>
            </div>

            <StepBar step={step} />

            {/* Step 1 */}
            <div className="step-section">
              <div className="step-section-label">1. Pilih Pelanggan</div>
              <CustomerSearch
                customers={customers}
                readIds={readIds}
                onSelect={handleSelectCustomer}
                selectedId={customer?.id}
              />
              {customer && (
                <div className="customer-info-card">
                  <div className="customer-info-row"><span>👤 Nama</span><b>{customer.name}</b></div>
                  <div className="customer-info-row"><span>🔢 Meter</span><b>{customer.meter} · Gol. {customer.group}</b></div>
                  {customer.address && (
                    <div className="customer-info-row"><span>📍 Alamat</span><span>{customer.address}</span></div>
                  )}
                  <div className="customer-info-row highlight">
                    <span>📊 Stand Lama</span>
                    <b className="mono" style={{ fontSize: 16, color: 'var(--ocean)' }}>{customer.lastStand} m³</b>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 */}
            {step >= 2 && customer && (
              <div className="step-section">
                <div className="step-section-label">
                  2. Foto Meter <span style={{ color: 'var(--danger)', fontSize: 11 }}>(wajib)</span>
                </div>
                <CameraCapture onCapture={handlePhotoCapture} />
              </div>
            )}

            {/* Step 3 */}
            {step >= 3 && photo && customer && (
              <div className="step-section">
                <div className="step-section-label">3. Catat Stand Akhir</div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Stand Lama (m³)</label>
                    <div className="input-group">
                      <input type="number" className="form-input mono" value={customer.lastStand} readOnly
                        style={{ background: 'var(--bg)', color: 'var(--text-sec)' }} />
                      <span className="input-addon">m³</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Stand Sekarang (m³)</label>
                    <div className="input-group">
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className={`form-input mono stand-input-lg ${standError ? 'error' : ''}`}
                        value={currentStand}
                        onChange={e => { setCurrentStand(e.target.value); setStandError('') }}
                        placeholder={String(customer.lastStand + 1)}
                        min={customer.lastStand + 1}
                        autoFocus
                      />
                      <span className="input-addon">m³</span>
                    </div>
                    {standError && <div className="form-hint" style={{ color: 'var(--danger)' }}>{standError}</div>}
                  </div>
                </div>

                {preview && (
                  <div className="tariff-block highlight" style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ocean)', marginBottom: 10 }}>
                      Preview Tagihan
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-sec)' }}>Pemakaian</span>
                      <span className="mono" style={{ fontWeight: 700 }}>{usage} m³</span>
                    </div>
                    {preview.blocks.map((b, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-hint)' }}>└ {b.vol} m³ × {fmtRupiah(b.price)}</span>
                        <span className="mono">{fmtRupiah(b.sub)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-sec)' }}>Biaya Air</span>
                      <span className="mono">{fmtRupiah(preview.waterCost)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-sec)' }}>Biaya Admin</span>
                      <span className="mono">{fmtRupiah(preview.admin)}</span>
                    </div>
                    {preview.ppjActive && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-sec)' }}>PPJ ({preview.ppjRate}%)</span>
                        <span className="mono">{fmtRupiah(preview.ppj)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px dashed var(--border)', margin: '8px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
                      <span>Total Tagihan</span>
                      <span className="mono" style={{ color: 'var(--ocean)' }}>{fmtRupiah(preview.total)}</span>
                    </div>
                  </div>
                )}

                <div className="form-grid" style={{ marginBottom: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Tanggal Baca</label>
                    <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Catatan</label>
                    <input type="text" className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Normal, bocor, dll." />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <Button variant="primary" onClick={handleSave} full icon="💾" disabled={saving}
                    className="btn-save-meter">
                    {saving ? 'Menyimpan...' : 'Simpan & Buat Tagihan'}
                  </Button>
                  <Button variant="ghost" onClick={resetForm}>Reset</Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ─── Right: Riwayat + Status ─── */}
        <div>
          <Card>
            <div className="card-header">
              <div className="card-title">Riwayat Pembacaan</div>
              <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>
                {loadingReadings ? 'Memuat...' : `${apiReadings.length} total`}
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pelanggan</th>
                    <th className="hide-mobile">Tgl Baca</th>
                    <th className="hide-mobile">Stand Lama</th>
                    <th className="hide-mobile">Stand Baru</th>
                    <th>Pakai</th>
                    <th>Status</th>
                    <th>Foto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {historyReadings.length === 0 && !loadingReadings && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-hint)', padding: 20 }}>Belum ada riwayat pembacaan</td></tr>
                  )}
                  {historyReadings.map(r => {
                    const c = customers.find(c => c.id === r.custId)
                    const canEdit = r.billStatus !== 'paid'
                    const statusColor = r.billStatus === 'paid'
                      ? 'var(--mint)' : r.billStatus === 'overdue' ? 'var(--danger)' : '#f59e0b'
                    const statusLabel = r.billStatus === 'paid'
                      ? 'Lunas' : r.billStatus === 'overdue' ? 'Terlambat' : 'Belum Lunas'
                    return (
                      <tr key={r.id}>
                        <td>
                          <b style={{ fontSize: 12 }}>{c?.name || r.custName || '—'}</b>
                          <br /><span style={{ fontSize: 10, color: 'var(--text-hint)' }}>{c?.meter || r.meter}</span>
                        </td>
                        <td className="hide-mobile" style={{ fontSize: 11, color: 'var(--text-sec)', whiteSpace: 'nowrap' }}>
                          {r.date ? new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                        <td className="mono hide-mobile" style={{ fontSize: 12 }}>{r.lastStand}</td>
                        <td className="mono hide-mobile" style={{ fontSize: 12 }}>{r.currentStand}</td>
                        <td className="mono"><b>{r.usage}</b></td>
                        <td>
                          {r.billStatus ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: statusColor }}>{statusLabel}</span>
                          ) : <span style={{ color: 'var(--text-hint)', fontSize: 10 }}>—</span>}
                        </td>
                        <td>
                          {r.photo
                            ? <button className="btn btn-ghost btn-sm" style={{ fontSize: 14, padding: '2px 6px' }} onClick={() => setPhotoPreview(r.photo)} title="Lihat foto">📷</button>
                            : <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>—</span>
                          }
                        </td>
                        <td>
                          {canEdit && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: '3px 8px' }}
                              onClick={() => setEditingReading(r)}
                            >
                              ✏️
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Status bulan ini */}
          <Card>
            <div className="card-header">
              <div className="card-title">Status Bulan Ini</div>
              <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>
                {progress.done} sudah · {progress.total - progress.done} belum
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              {customers.map(c => {
                const done = readIds.has(c.id)
                return (
                  <div
                    key={c.id}
                    style={{
                      padding: '9px 11px', borderRadius: 10, border: '1px solid',
                      borderColor: done ? 'var(--mint)' : 'var(--border)',
                      background: done ? 'var(--success-bg)' : 'var(--card)',
                      display: 'flex', alignItems: 'center', gap: 8,
                      cursor: !done ? 'pointer' : 'default',
                    }}
                    onClick={() => !done && handleSelectCustomer(c)}
                  >
                    <span style={{ fontSize: 16 }}>{done ? '✅' : '⏳'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-hint)' }}>{c.meter} · {c.group}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>

      {editingReading && (
        <EditReadingModal
          reading={editingReading}
          onSave={handleEditSave}
          onClose={() => setEditingReading(null)}
        />
      )}

      <InvoiceModal open={!!newBill} onClose={() => setNewBill(null)} bill={newBill} />

      {/* Photo preview modal */}
      {photoPreview && (
        <div
          onClick={() => setPhotoPreview(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📷 Foto Pembacaan Meter</span>
              <button onClick={() => setPhotoPreview(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <img src={photoPreview} alt="Foto meter" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
          </div>
        </div>
      )}
    </div>
  )
}
