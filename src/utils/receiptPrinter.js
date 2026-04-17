import { fmtRupiah, fmtDate } from './tariff'

// ─── Helpers ───────────────────────────────────────────────────────────────

function row2(left, right, cols) {
  const l = String(left)
  const r = String(right)
  const spaces = cols - l.length - r.length
  if (spaces <= 0) {
    // Truncate left to fit
    return l.substring(0, cols - r.length - 1) + ' ' + r
  }
  return l + ' '.repeat(spaces) + r
}

function center(text, cols) {
  const t = String(text)
  const pad = Math.max(0, Math.floor((cols - t.length) / 2))
  return ' '.repeat(pad) + t
}

function wordWrap(text, cols) {
  if (!text) return ['']
  if (text.length <= cols) return [text]
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    if (!cur) { cur = w; continue }
    if (cur.length + 1 + w.length <= cols) {
      cur += ' ' + w
    } else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text.substring(0, cols)]
}

function hr(char, cols) { return char.repeat(cols) }

// ─── Receipt text generator ─────────────────────────────────────────────────

function buildReceiptText(bill, customer, settings, blocks, cols) {
  const lines = []
  const dbl = hr('=', cols)
  const sgl = hr('-', cols)

  const companyName    = settings?.companyName    || 'PAMSIMAS'
  const companyAddress = settings?.companyAddress || ''
  const companyPhone   = settings?.companyPhone   || ''

  // ── Header perusahaan
  lines.push(center(companyName, cols))
  wordWrap(companyAddress, cols).forEach(l => lines.push(center(l, cols)))
  if (companyPhone) lines.push(center('Telp: ' + companyPhone, cols))
  lines.push(dbl)
  lines.push(center('TAGIHAN AIR MINUM', cols))
  lines.push(dbl)

  // ── Info invoice
  lines.push(row2('No.Invoice', bill.invoiceNo || '-', cols))
  lines.push(row2('Periode', bill.period || '-', cols))
  lines.push(row2('Tgl.Cetak', new Date().toLocaleDateString('id-ID'), cols))
  lines.push(sgl)

  // ── Info pelanggan
  const custName = (customer?.name || bill?.custName || '-')
  const maxNameLen = cols - 11 // "Pelanggan: " = 11 chars
  lines.push(row2('Pelanggan', custName.length > maxNameLen ? custName.substring(0, maxNameLen - 1) + '.' : custName, cols))
  lines.push(row2('No.Meter',  customer?.meter || bill?.meter || '-', cols))
  lines.push(row2('Golongan',  customer?.group || bill?.group || '-', cols))
  lines.push(row2('Pemakaian', (bill.usage || 0) + ' m\u00b3', cols))
  lines.push(sgl)

  // ── Rincian biaya
  lines.push('Rincian Biaya:')
  if (blocks && blocks.length) {
    blocks.forEach(b => {
      const desc = `  ${b.label} (${b.vol}m\u00b3)`
      lines.push(row2(desc, fmtRupiah(b.sub), cols))
    })
  } else {
    // Fallback: just show water cost
    lines.push(row2('  Biaya Air', fmtRupiah(bill.waterCost || 0), cols))
  }
  lines.push(row2('  Adm.', fmtRupiah(bill.admin || 0), cols))
  if (bill.ppj) lines.push(row2('  PPJ', fmtRupiah(bill.ppj || 0), cols))
  lines.push(dbl)

  // ── Total
  lines.push(row2('TOTAL', fmtRupiah(bill.total), cols))
  lines.push(dbl)

  // ── Jatuh tempo & status
  lines.push(row2('Jatuh Tempo', fmtDate(bill.dueDate), cols))

  if (bill.status === 'paid') {
    lines.push(sgl)
    lines.push(center('*** S U D A H   L U N A S ***', cols))
    if (bill.paidDate) lines.push(row2('Tgl.Bayar', fmtDate(bill.paidDate), cols))
  } else if (bill.status === 'overdue') {
    lines.push(sgl)
    lines.push(center('! LEWAT JATUH TEMPO !', cols))
  }

  lines.push('')
  lines.push(center('Terima kasih!', cols))
  lines.push(center('Bayar sebelum jatuh tempo.', cols))
  lines.push('')
  lines.push('')

  return lines.join('\n')
}

// ─── Build HTML untuk iframe ────────────────────────────────────────────────

function buildReceiptHTML(receiptText, paperWidthMm) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Struk</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 8.5pt;
    line-height: 1.35;
    width: ${paperWidthMm}mm;
    color: #000;
    background: #fff;
  }
  body { padding: 3mm 2mm; }
  pre {
    white-space: pre;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }
  @media print {
    @page { size: ${paperWidthMm}mm auto; margin: 0; }
    html, body { width: ${paperWidthMm}mm; }
    body { padding: 2mm 1mm; }
  }
</style>
</head>
<body>
<pre>${receiptText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body>
</html>`
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Print thermal receipt via hidden iframe (tidak perlu popup window)
 *
 * @param {object} bill       - Data tagihan dari API
 * @param {object} customer   - Data pelanggan (bisa {} jika tidak tersedia)
 * @param {object} settings   - Pengaturan perusahaan
 * @param {array}  blocks     - Blok pemakaian dari calcWaterCost
 */
export function printReceiptThermal(bill, customer = {}, settings = {}, blocks = []) {
  const paperWidthMm = parseInt(settings?.thermalPaperWidth || 58, 10)
  const cols = paperWidthMm >= 80 ? 42 : 32

  const receiptText = buildReceiptText(bill, customer, settings, blocks, cols)
  const html = buildReceiptHTML(receiptText, paperWidthMm)

  // Gunakan hidden iframe agar tidak terblokir popup blocker
  const FRAME_ID = '__thermal_receipt_frame__'
  let iframe = document.getElementById(FRAME_ID)
  if (!iframe) {
    iframe = document.createElement('iframe')
    iframe.id = FRAME_ID
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = [
      'position:fixed', 'top:-9999px', 'left:-9999px',
      'width:1px', 'height:1px', 'border:none', 'opacity:0',
    ].join(';')
    document.body.appendChild(iframe)
  }

  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  // Delay kecil agar browser selesai render sebelum print dialog
  setTimeout(() => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
  }, 250)
}
