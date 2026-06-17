import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { Card, Button } from '../components/UI'
import { InvoiceModal } from '../components/InvoiceModal'
import { fmtRupiah } from '../utils/tariff'
import { readingAPI, settingsAPI, tariffAPI, customerAPI } from '../utils/api'

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

// ─── Customer Search — server-side search, hanya pelanggan belum dibaca ───
function CustomerSearch({ readIds, onSelect }) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const wrapRef    = useRef(null)
  const debounceRef = useRef(null)

  const doSearch = useCallback(async (q) => {
    setLoading(true)
    try {
      const res = await customerAPI.getAll({ status: 'active', search: q, limit: 15, page: 1 })
      const list = res.data || res
      // Saring yang sudah dibaca bulan ini
      setResults(list.filter(c => !readIds.has(c.id)).slice(0, 8))
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [readIds])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, doSearch])

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (c) => { setQuery(c.name); setOpen(false); onSelect(c) }
  const clear  = () => { setQuery(''); setOpen(false); onSelect(null) }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label className="form-label">Cari Pelanggan Belum Dibaca</label>
      <div className="search-input-wrap">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="form-input search-with-icon"
          placeholder="Ketik nama atau nomor meter..."
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {query && <button className="search-clear" onClick={clear}>✕</button>}
      </div>

      {open && (
        <div className="search-dropdown">
          {loading ? (
            <div style={{ padding: '14px 16px', color: 'var(--text-hint)', fontSize: 13, textAlign: 'center' }}>
              Mencari...
            </div>
          ) : results.length > 0 ? results.map(c => (
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
              {query ? 'Tidak ada pelanggan yang cocok' : 'Ketik untuk mencari pelanggan'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Compress image ke JPEG dengan resize ───
const MAX_DIM  = 1024
const QUALITY  = 0.78

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
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function sizeKb(dataUrl) {
  return Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4 / 1024)
}

// ─── Camera capture ───
function CameraCapture({ onCapture }) {
  const videoRef     = useRef(null)
  const canvasRef    = useRef(null)
  const fileInputRef = useRef(null)
  const streamRef    = useRef(null)
  const [stream,      setStream]      = useState(null)
  const [photo,       setPhoto]       = useState(null)
  const [photoInfo,   setPhotoInfo]   = useState(null)
  const [camError,    setCamError]    = useState(null)
  const [camReady,    setCamReady]    = useState(false)
  const [compressing, setCompressing] = useState(false)

  const stopCamera = useCallback(() => {
    const s = streamRef.current
    if (s) { s.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setStream(null); setCamReady(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCamError(null); setCamReady(false)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = s
      setStream(s)
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.onloadedmetadata = () => setCamReady(true)
      }
    } catch {
      setCamError('Tidak dapat mengakses kamera. Gunakan tombol upload di bawah.')
    }
  }, [])

  useEffect(() => { startCamera() }, [])
  useEffect(() => () => stopCamera(), [])

  const capturePhoto = async () => {
    const video = videoRef.current, canvas = canvasRef.current
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

  const openGallery = () => {
    if (compressing) return
    stopCamera()
    setTimeout(() => { fileInputRef.current?.click() }, 150)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    const origKb = Math.round(file.size / 1024)
    setCompressing(true)
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
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />

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
            <button
              className={`btn btn-ghost${compressing ? ' disabled' : ''}`}
              style={{ cursor: compressing ? 'not-allowed' : 'pointer' }}
              onClick={openGallery}
              disabled={compressing}
            >
              📁 Upload dari Galeri
            </button>
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
  const [stand,   setStand]   = useState(String(reading.currentStand))
  const [date,    setDate]    = useState(reading.date)
  const [note,    setNote]    = useState(reading.note || '')
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState(false)

  // Photo state
  const [currentPhoto,  setCurrentPhoto]  = useState(reading.photo || null)
  const [newPhoto,      setNewPhoto]      = useState(null)   // null = tidak ganti
  const [showCamera,    setShowCamera]    = useState(false)
  const [fetchingPhoto, setFetchingPhoto] = useState(false)

  // Lazy-load foto yang ada jika hanya ada flag hasPhoto
  useEffect(() => {
    if (!reading.photo && reading.hasPhoto) {
      setFetchingPhoto(true)
      readingAPI.getPhoto(reading.id)
        .then(r => setCurrentPhoto(r.photo))
        .catch(() => {})
        .finally(() => setFetchingPhoto(false))
    }
  }, [])

  const handleReplacePhoto = (dataUrl) => {
    if (dataUrl) {
      setNewPhoto(dataUrl)
      setShowCamera(false)
    }
  }

  const cancelPhotoReplace = () => {
    setNewPhoto(null)
    setShowCamera(false)
  }

  const handleSave = async () => {
    const val = parseFloat(stand)
    if (isNaN(val) || val < reading.lastStand) {
      setError(`Stand baru tidak boleh kurang dari stand lama (${reading.lastStand} m³)`)
      return
    }
    setSaving(true)
    try {
      const payload = { currentStand: val, date, note }
      if (newPhoto !== null) payload.photo = newPhoto
      const updated = await readingAPI.update(reading.id, payload)
      onSave(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const displayPhoto = newPhoto || currentPhoto

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: '100%', maxWidth: 480 }}>
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
                min={reading.lastStand}
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

        {/* ─── Bagian foto ─── */}
        <div style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
            Foto Meter
            {newPhoto && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ocean)', fontWeight: 600 }}>· Foto baru</span>}
          </label>

          {/* Tampilkan foto saat ini atau baru */}
          {fetchingPhoto ? (
            <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 8 }}>Memuat foto...</div>
          ) : displayPhoto ? (
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <img
                src={displayPhoto}
                alt="Foto meter"
                style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, display: 'block' }}
              />
              {newPhoto && (
                <div style={{ position: 'absolute', top: 6, left: 6, background: 'var(--ocean)', color: '#fff',
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>
                  FOTO BARU
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 8, padding: '10px 0' }}>
              Belum ada foto
            </div>
          )}

          {/* Tombol / kamera ganti foto */}
          {!showCamera ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCamera(true)}>
                📷 {displayPhoto ? 'Ganti Foto' : 'Tambah Foto'}
              </button>
              {newPhoto && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={cancelPhotoReplace}>
                  ✕ Batalkan
                </button>
              )}
            </div>
          ) : (
            <div>
              <CameraCapture onCapture={handleReplacePhoto} />
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowCamera(false)}>
                Tutup Kamera
              </button>
            </div>
          )}
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

// ─── Komponen pagination sederhana ───
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }}>
      <button
        className="btn btn-ghost btn-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        style={{ minWidth: 32 }}
      >‹</button>
      <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>
        {page} / {totalPages}
      </span>
      <button
        className="btn btn-ghost btn-sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        style={{ minWidth: 32 }}
      >›</button>
    </div>
  )
}

const HIST_LIMIT = 10

// ─── Main page ───
export default function Meters() {
  const { showToast } = useStore()

  // readIds — semua custId yang sudah dibaca bulan ini (tanpa foto, ringan)
  const [readIds,         setReadIds]         = useState(new Set())
  const [totalCustomers,  setTotalCustomers]  = useState(0)
  const [liveSettings,    setLiveSettings]    = useState({})
  const [liveTariffs,     setLiveTariffs]     = useState(null)
  const loadedRef = useRef(false)

  // Riwayat pembacaan — paginated dari backend
  const [histItems,    setHistItems]    = useState([])
  const [histTotal,    setHistTotal]    = useState(0)
  const [histPage,     setHistPage]     = useState(1)
  const [histSearch,   setHistSearch]   = useState('')
  const [histPeriod,   setHistPeriod]   = useState('')
  const [histLoading,  setHistLoading]  = useState(true)
  const histDebounceRef = useRef(null)

  // Status grid pelanggan (lazy load, bisa disembunyikan)
  const [statusCustomers,  setStatusCustomers]  = useState([])
  const [showStatusPanel,  setShowStatusPanel]  = useState(
    () => localStorage.getItem('meters_show_status') !== 'false'
  )

  // Form state
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
  const [loadingPhoto,   setLoadingPhoto]   = useState(false)

  const thisMonth = new Date().toLocaleDateString('sv-SE').substring(0, 7)

  // histPeriod default = bulan ini (setelah mount)
  const effectivePeriod = histPeriod || thisMonth

  const usage   = customer ? Math.max(0, parseFloat(currentStand || 0) - customer.lastStand) : 0
  const preview = calcPreview(liveTariffs, customer?.group, usage, liveSettings)

  const progress = {
    done:  readIds.size,
    total: totalCustomers,
    pct:   totalCustomers ? Math.round(readIds.size / totalCustomers * 100) : 0,
  }

  // Muat readIds — semua pembacaan bulan ini, tanpa foto (ringan)
  const loadReadIds = useCallback(async () => {
    try {
      const data = await readingAPI.getAll({ period: thisMonth, noPhoto: true, limit: 999 })
      const list = Array.isArray(data) ? data : (data.data || [])
      setReadIds(new Set(list.map(r => r.custId)))
    } catch { /* ignore */ }
  }, [thisMonth])

  // Muat total pelanggan aktif (untuk progress bar)
  const loadCustomerCount = useCallback(async () => {
    try {
      const res = await customerAPI.getAll({ status: 'active', page: 1, limit: 1 })
      if (res && typeof res.total === 'number') setTotalCustomers(res.total)
      else setTotalCustomers((res.data || res).length)
    } catch { /* ignore */ }
  }, [])

  // Muat status grid pelanggan (lazy, setelah data kritis siap)
  const loadStatusCustomers = useCallback(async () => {
    try {
      const data = await customerAPI.getAll({ status: 'active' })
      setStatusCustomers(Array.isArray(data) ? data : (data.data || []))
    } catch { /* ignore */ }
  }, [])

  // Muat riwayat pembacaan (paginated)
  const loadHistory = useCallback(async (page, search, period) => {
    setHistLoading(true)
    try {
      const res = await readingAPI.getAll({ period: period || thisMonth, page, limit: HIST_LIMIT, search: search || '' })
      if (res && res.data !== undefined) {
        setHistItems(res.data)
        setHistTotal(res.total)
      } else {
        setHistItems(Array.isArray(res) ? res : [])
        setHistTotal(0)
      }
    } catch { /* ignore */ }
    finally { setHistLoading(false) }
  }, [thisMonth])

  // Muat semua data awal — paralel, ringan
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    loadReadIds()
    loadCustomerCount()
    loadHistory(1, '', thisMonth)

    settingsAPI.get().then(setLiveSettings).catch(() => {})
    tariffAPI.getAll().then(setLiveTariffs).catch(() => {})

    // Status grid dimuat hanya jika panel sedang aktif ditampilkan
    if (localStorage.getItem('meters_show_status') !== 'false') {
      setTimeout(loadStatusCustomers, 800)
    }
  }, [])

  // Reload history saat filter berubah (debounce pada search)
  useEffect(() => {
    clearTimeout(histDebounceRef.current)
    histDebounceRef.current = setTimeout(() => {
      loadHistory(histPage, histSearch, effectivePeriod)
    }, histSearch ? 400 : 0)
    return () => clearTimeout(histDebounceRef.current)
  }, [histPage, histSearch, effectivePeriod])

  const histTotalPages = Math.max(1, Math.ceil(histTotal / HIST_LIMIT))

  const toggleStatusPanel = () => {
    const next = !showStatusPanel
    setShowStatusPanel(next)
    localStorage.setItem('meters_show_status', String(next))
    if (next && statusCustomers.length === 0) loadStatusCustomers()
  }

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
    if (val < customer.lastStand) {
      setStandError(`Stand baru tidak boleh kurang dari stand lama (${customer.lastStand} m³)`)
      return
    }
    setStandError(''); setSaving(true)
    try {
      const { bill } = await readingAPI.create({
        custId: customer.id, currentStand: val, date, note, photo,
      })
      await loadReadIds()
      await loadCustomerCount()
      await loadHistory(1, histSearch, effectivePeriod)
      setHistPage(1)
      // Reload status grid juga
      loadStatusCustomers()
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
    await loadReadIds()
    await loadHistory(histPage, histSearch, effectivePeriod)
    showToast('Pembacaan berhasil diperbarui')
  }

  const resetForm = () => {
    setCustomer(null); setPhoto(null); setCurrentStand(''); setNote('')
    setStandError(''); setStep(1)
  }

  // Buka foto — lazy load dari server
  const openPhoto = async (reading) => {
    if (reading.photo) {
      setPhotoPreview(reading.photo)
      return
    }
    setLoadingPhoto(true)
    try {
      const { photo: p } = await readingAPI.getPhoto(reading.id)
      setPhotoPreview(p)
    } catch {
      showToast('Gagal memuat foto', 'error')
    } finally {
      setLoadingPhoto(false)
    }
  }

  // Opsi bulan untuk filter riwayat (12 bulan ke belakang)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const val = d.toLocaleDateString('sv-SE').substring(0, 7)
    const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    return { val, label }
  })

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
                readIds={readIds}
                onSelect={handleSelectCustomer}
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
                        placeholder={String(customer.lastStand)}
                        min={customer.lastStand}
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
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div className="card-title">Riwayat Pembacaan</div>
              <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>
                {histLoading ? 'Memuat...' : `${histTotal} data`}
              </span>
            </div>

            {/* Filter & Search */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div className="search-input-wrap" style={{ flex: 1, minWidth: 140 }}>
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="form-input search-with-icon"
                  style={{ fontSize: 12 }}
                  placeholder="Cari nama / nomor meter..."
                  value={histSearch}
                  onChange={e => { setHistSearch(e.target.value); setHistPage(1) }}
                />
                {histSearch && (
                  <button className="search-clear" onClick={() => { setHistSearch(''); setHistPage(1) }}>✕</button>
                )}
              </div>
              <select
                className="form-input"
                style={{ fontSize: 12, minWidth: 140, flex: '0 0 auto' }}
                value={histPeriod}
                onChange={e => { setHistPeriod(e.target.value); setHistPage(1) }}
              >
                {monthOptions.map(m => (
                  <option key={m.val} value={m.val}>{m.label}</option>
                ))}
              </select>
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
                  {histLoading && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-hint)', padding: 20 }}>Memuat...</td></tr>
                  )}
                  {!histLoading && histItems.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-hint)', padding: 20 }}>
                      {histSearch ? 'Tidak ada hasil pencarian' : 'Belum ada riwayat pembacaan'}
                    </td></tr>
                  )}
                  {!histLoading && histItems.map(r => {
                    const canEdit = r.billStatus !== 'paid'
                    const statusColor = r.billStatus === 'paid'
                      ? 'var(--mint)' : r.billStatus === 'overdue' ? 'var(--danger)' : '#f59e0b'
                    const statusLabel = r.billStatus === 'paid'
                      ? 'Lunas' : r.billStatus === 'overdue' ? 'Terlambat' : 'Belum Lunas'
                    return (
                      <tr key={r.id}>
                        <td>
                          <b style={{ fontSize: 12 }}>{r.custName || '—'}</b>
                          <br /><span style={{ fontSize: 10, color: 'var(--text-hint)' }}>{r.meter}</span>
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
                          {(r.photo || r.hasPhoto)
                            ? <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 14, padding: '2px 6px' }}
                                onClick={() => openPhoto(r)}
                                title="Lihat foto"
                              >📷</button>
                            : <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>—</span>
                          }
                        </td>
                        <td>
                          {canEdit && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: '3px 8px' }}
                              onClick={() => setEditingReading(r)}
                            >✏️</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={histPage}
              totalPages={histTotalPages}
              onChange={p => setHistPage(p)}
            />
          </Card>

          {/* Status bulan ini */}
          <Card>
            <div className="card-header">
              <div className="card-title">Status Bulan Ini</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {showStatusPanel && (
                  <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>
                    {progress.done} sudah · {progress.total - progress.done} belum
                  </span>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={toggleStatusPanel}
                  style={{ fontSize: 11, padding: '3px 10px' }}
                >
                  {showStatusPanel ? '▲ Sembunyikan' : '▼ Tampilkan'}
                </button>
              </div>
            </div>

            {showStatusPanel && (
              statusCustomers.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-hint)', fontSize: 12, padding: '12px 0' }}>
                  Memuat data pelanggan...
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {statusCustomers.map(c => {
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
              )
            )}
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
      {(photoPreview || loadingPhoto) && (
        <div
          onClick={() => { if (!loadingPhoto) setPhotoPreview(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {loadingPhoto ? (
            <div style={{ color: '#fff', fontSize: 14 }}>Memuat foto...</div>
          ) : (
            <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 480, width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📷 Foto Pembacaan Meter</span>
                <button onClick={() => setPhotoPreview(null)}
                  style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
              <img src={photoPreview} alt="Foto meter" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
