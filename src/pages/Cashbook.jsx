import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { transactionAPI, categoryAPI } from '../utils/api'
import { getUser } from '../utils/auth'
import { Card, Badge, Button, Tabs, Modal, FormInput, FormSelect, SearchInput, EmptyState, ConfirmDialog } from '../components/UI'
import { fmtRupiah, fmtShort } from '../utils/tariff'

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const emptyCatForm = { name: '', type: 'expense' }

export default function Cashbook() {
  const { showToast } = useStore()
  const currentUser = getUser()
  const isAdmin = currentUser?.role === 'admin'

  const [transactions,  setTransactions]  = useState([])
  const [summary,       setSummary]       = useState(null)
  const [categories,    setCategories]    = useState([])
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState('all')
  const [search,        setSearch]        = useState('')
  const [month,         setMonth]         = useState(new Date().toISOString().substring(0, 7))

  // Transaction form state
  const [txModalOpen, setTxModalOpen] = useState(false)
  const [txForm,      setTxForm]      = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'expense', category: '', description: '', amount: '',
  })
  const [txErrors,      setTxErrors]      = useState({})
  const [txSaving,      setTxSaving]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Category management state (admin only)
  const [catListOpen,   setCatListOpen]   = useState(false)
  const [catEditOpen,   setCatEditOpen]   = useState(false)
  const [editCat,       setEditCat]       = useState(null)
  const [catForm,       setCatForm]       = useState(emptyCatForm)
  const [catErrors,     setCatErrors]     = useState({})
  const [catSaving,     setCatSaving]     = useState(false)
  const [confirmDelCat, setConfirmDelCat] = useState(null)
  const [catTab,        setCatTab]        = useState('expense')

  const loadedRef = useRef(false)

  const loadData = async (m) => {
    setLoading(true)
    try {
      const [txs, sum, cats] = await Promise.all([
        transactionAPI.getAll({ month: m, limit: 500 }),
        transactionAPI.getSummary({ month: m }),
        categoryAPI.getAll(),
      ])
      setTransactions(txs)
      setSummary(sum)
      setCategories(cats)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    loadData(month)
  }, [])

  const handleMonthChange = (m) => {
    setMonth(m)
    loadedRef.current = false
    loadData(m)
  }

  const incomeCategories  = categories.filter(c => c.type === 'income').map(c => c.name)
  const expenseCategories = categories.filter(c => c.type === 'expense').map(c => c.name)

  // ── Transaction form ──
  const setTxField = (key, val) => setTxForm(f => ({ ...f, [key]: val }))

  const handleTypeChange = (type) => {
    const cats = type === 'income' ? incomeCategories : expenseCategories
    setTxForm(f => ({ ...f, type, category: cats[0] || '' }))
  }

  const openAddTx = () => {
    const cats = expenseCategories
    setTxForm({
      date: new Date().toISOString().split('T')[0],
      type: 'expense', category: cats[0] || '', description: '', amount: '',
    })
    setTxErrors({})
    setTxModalOpen(true)
  }

  const validateTx = () => {
    const errs = {}
    if (!txForm.description.trim()) errs.description = 'Keterangan wajib diisi'
    if (!txForm.amount || parseFloat(txForm.amount) <= 0) errs.amount = 'Jumlah harus lebih dari 0'
    setTxErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSaveTx = async () => {
    if (!validateTx()) return
    setTxSaving(true)
    try {
      await transactionAPI.create({ ...txForm, amount: parseFloat(txForm.amount) })
      showToast('Transaksi berhasil disimpan!')
      setTxModalOpen(false)
      setTxErrors({})
      loadedRef.current = false
      await loadData(month)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setTxSaving(false)
    }
  }

  const handleDeleteTx = async (tx) => {
    try {
      await transactionAPI.remove(tx.id)
      showToast('Transaksi dihapus')
      setConfirmDelete(null)
      loadedRef.current = false
      await loadData(month)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  // ── Category management ──
  const openCatList = () => {
    setCatTab('expense')
    setCatListOpen(true)
  }

  const openAddCat = (type) => {
    setEditCat(null)
    setCatForm({ name: '', type })
    setCatErrors({})
    setCatEditOpen(true)
  }

  const openEditCat = (cat) => {
    setEditCat(cat)
    setCatForm({ name: cat.name, type: cat.type })
    setCatErrors({})
    setCatEditOpen(true)
  }

  const closeCatEdit = () => {
    setCatEditOpen(false)
    setEditCat(null)
    setCatForm(emptyCatForm)
    setCatErrors({})
  }

  const validateCat = () => {
    const errs = {}
    if (!catForm.name.trim()) errs.name = 'Nama kategori wajib diisi'
    setCatErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSaveCat = async () => {
    if (!validateCat()) return
    setCatSaving(true)
    try {
      if (editCat) {
        await categoryAPI.update(editCat.id, { name: catForm.name, type: catForm.type })
        showToast('Kategori berhasil diperbarui!')
      } else {
        await categoryAPI.create({ name: catForm.name, type: catForm.type })
        showToast('Kategori berhasil ditambahkan!')
      }
      closeCatEdit()
      loadedRef.current = false
      await loadData(month)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setCatSaving(false)
    }
  }

  const handleDeleteCat = async (cat) => {
    try {
      await categoryAPI.remove(cat.id)
      showToast('Kategori dihapus')
      setConfirmDelCat(null)
      loadedRef.current = false
      await loadData(month)
    } catch (e) {
      showToast(e.message, 'error')
      setConfirmDelCat(null)
    }
  }

  // ── Display ──
  const txTabs = [
    { id: 'all',     label: 'Semua',       count: transactions.length },
    { id: 'income',  label: 'Pemasukan',   count: transactions.filter(t => t.type === 'income').length },
    { id: 'expense', label: 'Pengeluaran', count: transactions.filter(t => t.type === 'expense').length },
  ]

  const filtered = transactions
    .filter(t => tab === 'all' || t.type === tab)
    .filter(t => !search ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
    )

  const totalIncome  = summary?.total_income  || 0
  const totalExpense = summary?.total_expense || 0
  const saldo        = totalIncome - totalExpense

  let running = saldo
  const withBalance = filtered.map(t => {
    const bal = running
    running = running - (t.type === 'income' ? t.amount : -t.amount)
    return { ...t, balance: bal }
  })

  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${now.getFullYear()}-${m}`
  })
  const monthLabel = (m) => {
    const [y, mo] = m.split('-')
    return new Date(`${y}-${mo}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }

  const currentCats = txForm.type === 'income' ? incomeCategories : expenseCategories
  const catTabList  = categories.filter(c => c.type === catTab)

  return (
    <div>
      {/* Month selector + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text-sec)', flexShrink: 0 }}>Periode:</span>
        <select
          className="form-select"
          style={{ width: 'auto', minWidth: 180 }}
          value={month}
          onChange={e => handleMonthChange(e.target.value)}
        >
          {months.map(m => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={openCatList} icon="🏷️">Kategori</Button>
        )}
        <Button variant="primary" onClick={openAddTx} icon="➕">Tambah Transaksi</Button>
      </div>

      {/* Summary cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <Card style={{ padding: '14px 16px', background: 'var(--ocean)', color: '#fff', border: 'none' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Total Pemasukan</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 22, fontWeight: 800, marginTop: 4 }}>{fmtShort(totalIncome)}</div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{summary?.count_income || 0} transaksi</div>
        </Card>
        <Card style={{ padding: '14px 16px', background: 'var(--danger)', color: '#fff', border: 'none' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Total Pengeluaran</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 22, fontWeight: 800, marginTop: 4 }}>{fmtShort(totalExpense)}</div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{summary?.count_expense || 0} transaksi</div>
        </Card>
        <Card style={{ padding: '14px 16px', background: saldo >= 0 ? 'var(--mint)' : 'var(--coral)', color: '#fff', border: 'none' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Saldo</div>
          <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 22, fontWeight: 800, marginTop: 4 }}>{fmtShort(Math.abs(saldo))}</div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{saldo >= 0 ? 'Surplus' : 'Defisit'}</div>
        </Card>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari keterangan, kategori..." />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>{filtered.length} transaksi</span>
      </div>

      <Tabs tabs={txTabs} active={tab} onChange={setTab} />

      <Card padding={0}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat data...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="📒" title="Belum ada transaksi" description="Tambahkan transaksi pemasukan atau pengeluaran kas" action={<Button variant="primary" onClick={openAddTx}>Tambah Transaksi</Button>} />
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 'var(--radius)' }}>
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Keterangan</th>
                  <th className="hide-mobile">Kategori</th>
                  <th>Tipe</th>
                  <th style={{ textAlign: 'right' }}>Jumlah</th>
                  <th style={{ textAlign: 'right' }} className="hide-mobile">Saldo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {withBalance.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{t.description}</span>
                      <div style={{ fontSize: 11, color: 'var(--text-hint)', display: 'none' }} className="cat-mobile">{t.category}</div>
                    </td>
                    <td className="hide-mobile" style={{ fontSize: 12, color: 'var(--text-sec)' }}>{t.category}</td>
                    <td>
                      <Badge variant={t.type === 'income' ? 'success' : 'danger'}>
                        {t.type === 'income' ? '▲ Masuk' : '▼ Keluar'}
                      </Badge>
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: t.type === 'income' ? 'var(--mint)' : 'var(--danger)' }}>
                      {t.type === 'income' ? '+' : '-'}{fmtRupiah(t.amount)}
                    </td>
                    <td className="mono hide-mobile" style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-sec)' }}>
                      {fmtRupiah(t.balance)}
                    </td>
                    <td>
                      <Button variant="danger" size="sm" onClick={() => setConfirmDelete(t)}>🗑️</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--ocean-pale)', fontWeight: 700 }}>
                  <td colSpan={2} style={{ padding: '10px 14px' }}><b>Total {monthLabel(month)}</b></td>
                  <td className="hide-mobile" />
                  <td />
                  <td className="mono" style={{ textAlign: 'right', padding: '10px 14px' }}>
                    <div style={{ color: 'var(--mint)', fontSize: 12 }}>+{fmtRupiah(totalIncome)}</div>
                    <div style={{ color: 'var(--danger)', fontSize: 12 }}>-{fmtRupiah(totalExpense)}</div>
                  </td>
                  <td className="mono hide-mobile" style={{ textAlign: 'right', fontWeight: 800, color: saldo >= 0 ? 'var(--mint)' : 'var(--danger)', padding: '10px 14px' }}>
                    {fmtRupiah(saldo)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* ── Add Transaction Modal ── */}
      <Modal open={txModalOpen} onClose={() => setTxModalOpen(false)} title="➕ Tambah Transaksi" width={480}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button
            onClick={() => handleTypeChange('income')}
            className={`btn ${txForm.type === 'income' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, justifyContent: 'center', background: txForm.type === 'income' ? 'var(--mint)' : undefined, borderColor: txForm.type === 'income' ? 'var(--mint)' : undefined }}
          >
            ▲ Pemasukan
          </button>
          <button
            onClick={() => handleTypeChange('expense')}
            className={`btn ${txForm.type === 'expense' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, justifyContent: 'center', background: txForm.type === 'expense' ? 'var(--danger)' : undefined, borderColor: txForm.type === 'expense' ? 'var(--danger)' : undefined }}
          >
            ▼ Pengeluaran
          </button>
        </div>

        <div className="form-grid">
          <FormInput
            label="Tanggal"
            type="date"
            value={txForm.date}
            onChange={e => setTxField('date', e.target.value)}
          />
          <FormSelect
            label="Kategori"
            value={txForm.category}
            onChange={e => setTxField('category', e.target.value)}
          >
            {currentCats.length === 0
              ? <option value="">— Belum ada kategori —</option>
              : currentCats.map(c => <option key={c} value={c}>{c}</option>)
            }
          </FormSelect>
        </div>

        <FormInput
          label="Keterangan"
          value={txForm.description}
          onChange={e => setTxField('description', e.target.value)}
          placeholder={txForm.type === 'income' ? 'mis. Pembayaran tagihan April - Budi Santoso' : 'mis. Beli token listrik 100rb'}
          error={txErrors.description}
        />

        <FormInput
          label="Jumlah (Rp)"
          type="number"
          value={txForm.amount}
          onChange={e => setTxField('amount', e.target.value)}
          placeholder="0"
          addon="Rp"
          error={txErrors.amount}
        />

        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setTxModalOpen(false)}>Batal</Button>
          <Button
            variant="primary"
            onClick={handleSaveTx}
            disabled={txSaving}
            style={{ background: txForm.type === 'income' ? 'var(--mint)' : 'var(--danger)', border: 'none' }}
          >
            {txSaving ? 'Menyimpan...' : txForm.type === 'income' ? 'Simpan Pemasukan' : 'Simpan Pengeluaran'}
          </Button>
        </div>
      </Modal>

      {/* ── Category List Modal ── */}
      <Modal open={catListOpen} onClose={() => setCatListOpen(false)} title="🏷️ Kelola Kategori Transaksi" width={500}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[{ id: 'expense', label: '▼ Pengeluaran' }, { id: 'income', label: '▲ Pemasukan' }].map(t => (
            <button
              key={t.id}
              onClick={() => setCatTab(t.id)}
              className={`btn ${catTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                flex: 1, justifyContent: 'center',
                background: catTab === t.id ? (t.id === 'income' ? 'var(--mint)' : 'var(--danger)') : undefined,
                borderColor: catTab === t.id ? (t.id === 'income' ? 'var(--mint)' : 'var(--danger)') : undefined,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {catTabList.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-hint)' }}>Belum ada kategori</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {catTabList.map(cat => (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{cat.name}</span>
                <Button variant="ghost" size="sm" onClick={() => openEditCat(cat)}>✏️</Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmDelCat(cat)}>🗑️</Button>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <Button variant="primary" size="sm" onClick={() => openAddCat(catTab)} icon="➕">
            Tambah Kategori {catTab === 'income' ? 'Pemasukan' : 'Pengeluaran'}
          </Button>
        </div>
      </Modal>

      {/* ── Add/Edit Category Modal ── */}
      <Modal
        open={catEditOpen}
        onClose={closeCatEdit}
        title={editCat ? '✏️ Edit Kategori' : '➕ Tambah Kategori'}
        width={400}
      >
        <FormSelect
          label="Tipe"
          value={catForm.type}
          onChange={e => setCatForm(f => ({ ...f, type: e.target.value }))}
        >
          <option value="expense">▼ Pengeluaran</option>
          <option value="income">▲ Pemasukan</option>
        </FormSelect>
        <FormInput
          label="Nama Kategori"
          value={catForm.name}
          onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
          placeholder="mis. Pemeliharaan Pompa"
          error={catErrors.name}
        />
        <div className="modal-actions">
          <Button variant="ghost" onClick={closeCatEdit}>Batal</Button>
          <Button variant="primary" onClick={handleSaveCat} disabled={catSaving}>
            {catSaving ? 'Menyimpan...' : editCat ? 'Simpan Perubahan' : 'Tambah Kategori'}
          </Button>
        </div>
      </Modal>

      {/* Confirm Delete Transaction */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => handleDeleteTx(confirmDelete)}
        title="Hapus Transaksi"
        message={`Yakin hapus transaksi "${confirmDelete?.description}"?`}
        confirmLabel="Ya, hapus"
        danger
      />

      {/* Confirm Delete Category */}
      <ConfirmDialog
        open={!!confirmDelCat}
        onClose={() => setConfirmDelCat(null)}
        onConfirm={() => handleDeleteCat(confirmDelCat)}
        title="Hapus Kategori"
        message={`Yakin hapus kategori "${confirmDelCat?.name}"? Kategori yang sedang digunakan tidak bisa dihapus.`}
        confirmLabel="Ya, hapus"
        danger
      />
    </div>
  )
}
