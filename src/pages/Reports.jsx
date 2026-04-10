import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { useStore } from '../store'
import { reportAPI, billAPI, customerAPI, settingsAPI } from '../utils/api'
import { Card, Badge, Button, Tabs, ProgressBar, StatCard } from '../components/UI'
import { fmtRupiah, fmtShort, getBillStatus } from '../utils/tariff'
import { generateMonthlyReportPDF } from '../utils/pdfGenerator'

const COLORS = ['#0B4F6C', '#3AAFDA', '#52B788', '#F4A261', '#D62828', '#1A7FAD']

const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTH_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

function monthLabel(periodKey) {
  const [y, m] = periodKey.split('-')
  return MONTH_ID[parseInt(m) - 1] + ' ' + y
}
function monthFull(periodKey) {
  const [y, m] = periodKey.split('-')
  return MONTH_FULL[parseInt(m) - 1] + ' ' + y
}

const CustomTooltip = ({ active, payload, label, money }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.fill || p.stroke, marginBottom: 2 }}>
          {p.name}: <b>{money ? fmtShort(p.value) : p.value.toLocaleString('id-ID')}</b>
        </div>
      ))}
    </div>
  )
}

export default function Reports() {
  const { showToast } = useStore()
  const [tab, setTab] = useState('summary')
  const [year, setYear] = useState(new Date().getFullYear())

  // Data from API
  const [summary,   setSummary]   = useState(null)
  const [monthly,   setMonthly]   = useState([])
  const [bills,     setBills]     = useState([])
  const [customers, setCustomers] = useState([])
  const [settings,  setSettings]  = useState({})
  const [loading,   setLoading]   = useState(true)

  // Monthly tab state
  const [selectedPeriod, setSelectedPeriod] = useState('')

  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    loadAll(year)
  }, [])

  const loadAll = async (y) => {
    setLoading(true)
    try {
      const [sum, mon, bl, cust, sett] = await Promise.all([
        reportAPI.summary(),
        reportAPI.monthly(y),
        billAPI.getAll({ limit: 2000 }),
        customerAPI.getAll({ status: 'active' }),
        settingsAPI.get(),
      ])
      setSummary(sum)
      setMonthly(mon)
      setBills(bl)
      setCustomers(cust)
      setSettings(sett)
      // Default ke periode terakhir yang ada
      if (mon.length > 0 && !selectedPeriod) {
        setSelectedPeriod(mon[mon.length - 1].period_key)
      }
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleYearChange = (y) => {
    setYear(y)
    setSelectedPeriod('')
    loadedRef.current = false
    loadAll(y)
  }

  // ── Derived data ──
  const chartData = monthly.map(m => ({
    month: monthLabel(m.period_key),
    volume:   Math.round(m.total_volume || 0),
    tagihan:  Math.round(m.total_billed || 0),
    terbayar: Math.round(m.total_paid || 0),
  }))

  const groupDist = ['R1', 'R2', 'R3', 'K1', 'K2', 'S1'].map(g => ({
    name: g,
    value: customers.filter(c => c.group === g).length,
  })).filter(g => g.value > 0)

  const avgPayRate = monthly.length
    ? monthly.reduce((s, m) => s + (m.pay_rate || 0), 0) / monthly.length
    : 0

  // Bills for selected period (monthly tab)
  const periodBills = bills.filter(b => b.periodKey === selectedPeriod)

  // Per-customer aggregation
  const custStats = customers.map(c => {
    const cb    = bills.filter(b => b.custId === c.id)
    const paid  = cb.filter(b => b.status === 'paid')
    const totalV = cb.reduce((s, b) => s + b.usage, 0)
    const totalT = cb.reduce((s, b) => s + b.total, 0)
    const totalP = paid.reduce((s, b) => s + b.total, 0)
    const pct    = totalT > 0 ? Math.round(totalP / totalT * 100) : 0
    return { ...c, billCount: cb.length, totalV, totalT, totalP, pct }
  }).filter(c => c.billCount > 0)
    .sort((a, b) => b.totalT - a.totalT)

  const handleExportPDF = () => {
    const period = selectedPeriod || (monthly.length ? monthly[monthly.length - 1].period_key : '')
    const pb = bills.filter(b => b.periodKey === period)
    generateMonthlyReportPDF({
      totalVolume:  pb.reduce((s, b) => s + b.usage, 0),
      totalBilled:  pb.reduce((s, b) => s + b.total, 0),
      totalPaid:    pb.filter(b => b.status === 'paid').reduce((s, b) => s + b.total, 0),
      totalUnpaid:  pb.filter(b => b.status !== 'paid').reduce((s, b) => s + b.total, 0),
      payRate: pb.length ? Math.round(pb.filter(b => b.status === 'paid').length / pb.length * 100) : 0,
      rows: pb.map(b => ({
        name: b.custName, meter: b.meter, group: b.group,
        usage: b.usage, total: b.total, status: b.status, paidDate: b.paidDate,
      })),
    }, settings, monthFull(period) || period)
    showToast('Laporan PDF berhasil diunduh!')
  }

  const tabs = [
    { id: 'summary',  label: '📊 Ringkasan' },
    { id: 'monthly',  label: '📅 Bulanan' },
    { id: 'customer', label: '👥 Per Pelanggan' },
  ]

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-sec)' }}>Memuat laporan...</div>
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>Tahun:</span>
          {[year - 1, year, year + 1 > new Date().getFullYear() ? null : year + 1].filter(Boolean).map(y => (
            <button key={y} onClick={() => handleYearChange(y)}
              className={`btn btn-sm ${y === year ? 'btn-primary' : 'btn-ghost'}`}>{y}</button>
          ))}
        </div>
        <Button variant="primary" onClick={handleExportPDF} icon="📥">Export PDF</Button>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ─── Summary Tab ─── */}
      {tab === 'summary' && (
        <div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 18 }}>
            <StatCard icon="💧" value={(summary?.total_volume || 0).toLocaleString('id-ID')} label="Total Volume (m³)" color="blue" />
            <StatCard icon="💰" value={fmtShort(summary?.total_billed || 0)} label="Total Tagihan" color="coral" />
            <StatCard icon="✅" value={avgPayRate.toFixed(1) + '%'} label="Rata-rata Tingkat Bayar" color="mint" />
          </div>

          <div className="grid-2">
            <Card>
              <div className="card-title" style={{ marginBottom: 16 }}>Volume & Pendapatan Bulanan</div>
              {chartData.length === 0 ? (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-hint)', fontSize: 13 }}>
                  Belum ada data untuk tahun {year}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} width={38} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-hint)' }} axisLine={false} tickLine={false} width={48} tickFormatter={v => fmtShort(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="volume" name="Volume (m³)" fill="var(--ocean-light)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="terbayar" name="Terbayar" fill="var(--mint)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <div className="card-title" style={{ marginBottom: 16 }}>Distribusi Pelanggan per Golongan</div>
              {groupDist.length === 0 ? (
                <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-hint)', fontSize: 13 }}>
                  Belum ada data pelanggan
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart>
                      <Pie data={groupDist} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                        {groupDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v + ' pelanggan', n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {groupDist.map((g, i) => (
                      <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontSize: 13, flex: 1 }}>{g.name}</span>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{g.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Monthly table */}
          <Card>
            <div className="card-title" style={{ marginBottom: 16 }}>Laporan Keuangan Bulanan {year}</div>
            {monthly.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-hint)', fontSize: 13 }}>
                Belum ada data tagihan untuk tahun {year}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Periode</th>
                      <th style={{ textAlign: 'center' }} className="hide-mobile">Jml Tagihan</th>
                      <th style={{ textAlign: 'center' }} className="hide-mobile">Volume (m³)</th>
                      <th style={{ textAlign: 'right' }}>Total Tagihan</th>
                      <th style={{ textAlign: 'right' }}>Terbayar</th>
                      <th style={{ textAlign: 'right' }} className="hide-mobile">Piutang</th>
                      <th style={{ textAlign: 'center' }}>Tingkat Bayar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map(m => {
                      const piutang = (m.total_unpaid || 0)
                      const pct     = Math.round(m.pay_rate || 0)
                      return (
                        <tr key={m.period_key}>
                          <td><b>{monthFull(m.period_key)}</b></td>
                          <td className="mono hide-mobile" style={{ textAlign: 'center' }}>{m.bill_count}</td>
                          <td className="mono hide-mobile" style={{ textAlign: 'center' }}>{Math.round(m.total_volume || 0).toLocaleString('id-ID')}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{fmtShort(m.total_billed || 0)}</td>
                          <td className="mono" style={{ textAlign: 'right', color: 'var(--mint)', fontWeight: 600 }}>{fmtShort(m.total_paid || 0)}</td>
                          <td className="mono hide-mobile" style={{ textAlign: 'right', color: piutang > 0 ? 'var(--danger)' : 'var(--mint)', fontWeight: 600 }}>{fmtShort(piutang)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <ProgressBar value={pct} />
                              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 32 }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {/* Total row */}
                    <tr style={{ background: 'var(--ocean-pale)', fontWeight: 700 }}>
                      <td><b>TOTAL</b></td>
                      <td className="mono hide-mobile" style={{ textAlign: 'center' }}>{monthly.reduce((s, m) => s + (m.bill_count || 0), 0)}</td>
                      <td className="mono hide-mobile" style={{ textAlign: 'center' }}>{Math.round(monthly.reduce((s, m) => s + (m.total_volume || 0), 0)).toLocaleString('id-ID')}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmtShort(monthly.reduce((s, m) => s + (m.total_billed || 0), 0))}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--mint)' }}>{fmtShort(monthly.reduce((s, m) => s + (m.total_paid || 0), 0))}</td>
                      <td className="mono hide-mobile" style={{ textAlign: 'right', color: 'var(--danger)' }}>{fmtShort(monthly.reduce((s, m) => s + (m.total_unpaid || 0), 0))}</td>
                      <td style={{ fontSize: 13, fontWeight: 700 }}>{avgPayRate.toFixed(1)}% avg</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── Monthly Tab ─── */}
      {tab === 'monthly' && (
        <div>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {monthly.map(m => (
              <button
                key={m.period_key}
                onClick={() => setSelectedPeriod(m.period_key)}
                className={`btn btn-sm ${selectedPeriod === m.period_key ? 'btn-primary' : 'btn-ghost'}`}
              >
                {monthLabel(m.period_key)}
              </button>
            ))}
          </div>

          {selectedPeriod ? (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div className="card-title">Tagihan {monthFull(selectedPeriod)}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Badge variant="info">{periodBills.length} tagihan</Badge>
                  <Badge variant="success">{periodBills.filter(b => b.status === 'paid').length} lunas</Badge>
                  <Badge variant="warning">{periodBills.filter(b => b.status !== 'paid').length} belum</Badge>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>No. Tagihan</th>
                      <th>Pelanggan</th>
                      <th>Gol.</th>
                      <th style={{ textAlign: 'center' }} className="hide-mobile">Pemakaian</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th>Status</th>
                      <th className="hide-mobile">Tgl Bayar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodBills.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-hint)', padding: 24 }}>Tidak ada tagihan</td></tr>
                    ) : periodBills.map(b => {
                      const status = getBillStatus(b)
                      return (
                        <tr key={b.id}>
                          <td className="mono" style={{ fontSize: 11 }}>{b.invoiceNo}</td>
                          <td>
                            <b style={{ fontSize: 13 }}>{b.custName}</b>
                            <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{b.meter}</div>
                          </td>
                          <td><Badge variant="info">{b.group}</Badge></td>
                          <td className="mono hide-mobile" style={{ textAlign: 'center' }}>{b.usage} m³</td>
                          <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtRupiah(b.total)}</td>
                          <td><Badge variant={b.status === 'paid' ? 'success' : b.status === 'overdue' ? 'danger' : 'warning'}>{status.label}</Badge></td>
                          <td className="hide-mobile" style={{ fontSize: 12, color: 'var(--mint)' }}>{b.paidDate || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {periodBills.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 12, padding: '10px 4px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>
                    Total Tagihan: <b>{fmtRupiah(periodBills.reduce((s, b) => s + b.total, 0))}</b>
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--mint)' }}>
                    Terbayar: <b>{fmtRupiah(periodBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.total, 0))}</b>
                  </span>
                </div>
              )}
            </Card>
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-hint)', fontSize: 13 }}>
              Pilih periode di atas
            </div>
          )}
        </div>
      )}

      {/* ─── Per Customer Tab ─── */}
      {tab === 'customer' && (
        <Card>
          <div className="card-title" style={{ marginBottom: 16 }}>Riwayat Tagihan Per Pelanggan</div>
          {custStats.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-hint)', fontSize: 13 }}>
              Belum ada data tagihan
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pelanggan</th>
                    <th>Gol.</th>
                    <th style={{ textAlign: 'center' }} className="hide-mobile">Jml Tagihan</th>
                    <th style={{ textAlign: 'center' }} className="hide-mobile">Total Volume</th>
                    <th style={{ textAlign: 'right' }}>Total Tagihan</th>
                    <th style={{ textAlign: 'right' }} className="hide-mobile">Terbayar</th>
                    <th style={{ textAlign: 'center' }}>Tingkat Bayar</th>
                  </tr>
                </thead>
                <tbody>
                  {custStats.map(c => (
                    <tr key={c.id}>
                      <td>
                        <b style={{ display: 'block', fontSize: 13 }}>{c.name}</b>
                        <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{c.meter}</span>
                      </td>
                      <td><Badge variant="info">{c.group}</Badge></td>
                      <td className="mono hide-mobile" style={{ textAlign: 'center' }}>{c.billCount}</td>
                      <td className="mono hide-mobile" style={{ textAlign: 'center' }}>{c.totalV.toLocaleString('id-ID')} m³</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmtShort(c.totalT)}</td>
                      <td className="mono hide-mobile" style={{ textAlign: 'right', color: 'var(--mint)', fontWeight: 600 }}>{fmtShort(c.totalP)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ProgressBar value={c.pct} color={c.pct >= 80 ? 'var(--mint)' : c.pct >= 50 ? 'var(--warning)' : 'var(--danger)'} />
                          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 32 }}>{c.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
