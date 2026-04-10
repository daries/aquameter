// Tariff structure per golongan
export const TARIFFS = {
  R1: {
    name: 'R1 - Rumah Tangga Kecil',
    description: 'Keluarga tidak mampu / MBR',
    blocks: [
      { limit: 10, price: 1600 },
      { limit: 20, price: 2000 },
      { limit: 30, price: 2500 },
      { limit: Infinity, price: 3000 },
    ],
  },
  R2: {
    name: 'R2 - Rumah Tangga Sedang',
    description: 'Keluarga menengah',
    blocks: [
      { limit: 10, price: 2100 },
      { limit: 20, price: 2625 },
      { limit: 30, price: 3000 },
      { limit: Infinity, price: 3500 },
    ],
  },
  R3: {
    name: 'R3 - Rumah Tangga Besar',
    description: 'Rumah tangga mewah',
    blocks: [
      { limit: 10, price: 2700 },
      { limit: 20, price: 3375 },
      { limit: 30, price: 3750 },
      { limit: Infinity, price: 4200 },
    ],
  },
  K1: {
    name: 'K1 - Usaha Kecil',
    description: 'Toko, warung, usaha kecil',
    blocks: [
      { limit: 10, price: 3000 },
      { limit: 20, price: 3750 },
      { limit: 30, price: 4200 },
      { limit: Infinity, price: 4800 },
    ],
  },
  K2: {
    name: 'K2 - Usaha Besar',
    description: 'Perusahaan, industri',
    blocks: [
      { limit: 10, price: 4500 },
      { limit: 20, price: 5625 },
      { limit: 30, price: 6000 },
      { limit: Infinity, price: 7200 },
    ],
  },
  S1: {
    name: 'S1 - Sosial Umum',
    description: 'Masjid, gereja, yayasan sosial',
    blocks: [
      { limit: 10, price: 800 },
      { limit: 20, price: 1000 },
      { limit: Infinity, price: 1500 },
    ],
  },
}

/**
 * Calculate water cost based on group and usage
 * Returns { cost, blocks }
 */
export function calcWaterCost(group, usage) {
  const tariff = TARIFFS[group] || TARIFFS.R1
  let cost = 0
  let prev = 0
  const blocks = []

  for (const block of tariff.blocks) {
    if (usage <= prev) break
    const blockLimit = block.limit === Infinity ? usage : block.limit
    const vol = Math.min(usage - prev, blockLimit - prev)
    if (vol > 0) {
      const sub = vol * block.price
      cost += sub
      blocks.push({
        vol,
        price: block.price,
        sub,
        label: block.limit === Infinity
          ? `> ${prev} m³`
          : `${prev + 1}–${block.limit} m³`,
      })
    }
    prev = blockLimit
    if (block.limit === Infinity) break
  }

  return { cost, blocks }
}

/**
 * Calculate full bill breakdown
 */
export function calcFullBill(group, usage, adminFee = 5000, ppjRate = 10) {
  const { cost, blocks } = calcWaterCost(group, usage)
  const ppj = Math.round(cost * ppjRate / 100)
  const total = cost + adminFee + ppj
  return { waterCost: cost, blocks, admin: adminFee, ppj, total }
}

/**
 * Format number as Indonesian Rupiah
 */
export function fmtRupiah(n) {
  if (n === undefined || n === null) return 'Rp 0'
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

/**
 * Short format: 1.5jt, 250rb, etc.
 */
export function fmtShort(n) {
  if (!n) return 'Rp 0'
  if (n >= 1_000_000) return 'Rp ' + (n / 1_000_000).toFixed(1) + 'jt'
  if (n >= 1_000) return 'Rp ' + Math.round(n / 1_000) + 'rb'
  return 'Rp ' + n
}

/**
 * Calculate due date
 */
export function calcDueDate(dateStr, dueDays = 20) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + dueDays)
  return d.toISOString().split('T')[0]
}

/**
 * Generate invoice number
 */
export function generateInvoiceNumber(id) {
  const year = new Date().getFullYear()
  return `INV-${year}-${String(id).padStart(4, '0')}`
}

/**
 * Get status info (label, color class)
 */
export function getBillStatus(bill) {
  const today = new Date()
  const due = new Date(bill.dueDate)
  if (bill.status === 'paid') return { label: 'Lunas', cls: 'badge-success', color: '#52B788' }
  if (today > due) return { label: 'Terlambat', cls: 'badge-danger', color: '#D62828' }
  return { label: 'Belum Lunas', cls: 'badge-warning', color: '#F4A261' }
}

/**
 * Format date to Indonesian format
 */
export function fmtDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

export function fmtDateShort(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

export const GOLONGAN_OPTIONS = Object.entries(TARIFFS).map(([k, v]) => ({
  value: k, label: v.name, description: v.description
}))
