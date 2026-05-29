# 🚰 AquaMeter v2.0
**Sistem Manajemen Meteran Air PDAM — PWA Fullstack**

Aplikasi web modern berbasis PWA (Progressive Web App) untuk manajemen sistem meteran air PDAM, mencakup pembacaan meteran, perhitungan tagihan otomatis, dan laporan keuangan lengkap.

---

## ✨ Fitur Utama

| Modul | Fitur |
|---|---|
| **Dashboard** | Statistik real-time, grafik pemakaian & pendapatan, tagihan belum lunas |
| **Baca Meteran** | Input stand meter, preview tagihan otomatis, progress tracking bulanan |
| **Pelanggan** | CRUD pelanggan, golongan tarif, riwayat pemakaian |
| **Tagihan** | Daftar tagihan, filter status, invoice PDF, tandai lunas |
| **Tarif** | Struktur tarif 6 golongan (R1–R3, K1–K2, S1), kalkulator interaktif |
| **Laporan** | Ringkasan keuangan, laporan bulanan, per pelanggan, export PDF |
| **WhatsApp Bot** | Notifikasi otomatis + bot catat meter mandiri (Baileys QR / Fonnte API) |
| **Database** | Profil koneksi SQLite/MySQL/PostgreSQL, test koneksi, migrasi data lintas engine |
| **PWA** | Install di HP/desktop, offline support, shortcut app |

---

## 🗂 Struktur Proyek

```
aquameter/
├── public/              # Static assets, PWA manifest
│   ├── favicon.svg
│   ├── manifest.webmanifest
│   └── sw.js            # Service Worker
├── server/
│   ├── index.js         # Express API + route utama + webhook Fonnte
│   ├── whatsapp.js      # Driver WA: Baileys (QR) & Fonnte API, antrian pesan
│   ├── bot.js           # State machine bot pesan masuk (catat meter, tagihan, aduan)
│   ├── dbConfig.js      # Profil koneksi database
│   ├── dbMigration.js   # Tool migrasi lintas engine
│   └── migrate.js       # CLI migrasi database
├── src/
│   ├── components/
│   │   ├── Layout.jsx       # Sidebar + Topbar
│   │   ├── UI.jsx           # Shared components (Button, Modal, Badge, dll.)
│   │   └── InvoiceModal.jsx # Detail tagihan + cetak PDF
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Meters.jsx
│   │   ├── Customers.jsx
│   │   ├── Billing.jsx
│   │   ├── Tariff.jsx
│   │   ├── Reports.jsx
│   │   └── Settings.jsx
│   ├── store/
│   │   └── index.js     # Zustand store (state management + localStorage)
│   ├── styles/
│   │   └── components.css
│   ├── utils/
│   │   ├── tariff.js    # Kalkulasi tarif, format Rupiah
│   │   ├── api.js       # Axios API client
│   │   └── pdfGenerator.js  # jsPDF invoice & laporan
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env.example
├── package.json
└── vite.config.js
```

---

## 🚀 Cara Menjalankan

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
```

### 3. Jalankan Development (Frontend + Backend)
```bash
npm run dev:full
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### 4. Jalankan Terpisah
```bash
# Frontend saja (data dari localStorage)
npm run dev

# Backend saja
npm run server
```

### 5. Build Production
```bash
npm run build
NODE_ENV=production npm run server
```

### 6. Migrasi Database
```bash
# Gunakan profil di server/db-config.json
npm run db:migrate -- --from sqlite --to mysql
```

Profil koneksi juga bisa diatur dari menu `Settings -> Database & Migrasi`.

---

## 🏗 Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 18 + Vite 5 |
| State | Zustand (persist ke localStorage) |
| Router | React Router v6 |
| Charts | Recharts |
| PDF | jsPDF + jsPDF-autotable |
| Icons | Lucide React |
| PWA | vite-plugin-pwa + Workbox |
| Backend | Express.js |
| Database Runtime | SQLite via better-sqlite3 |
| Database Migration | SQLite, MySQL, PostgreSQL |
| CSS | Custom CSS Variables (no framework) |

---

## 💲 Struktur Tarif

| Golongan | 0–10 m³ | 11–20 m³ | 21–30 m³ | >30 m³ |
|---|---|---|---|---|
| R1 (RT Kecil) | 1.600 | 2.000 | 2.500 | 3.000 |
| R2 (RT Sedang) | 2.100 | 2.625 | 3.000 | 3.500 |
| R3 (RT Besar) | 2.700 | 3.375 | 3.750 | 4.200 |
| K1 (Usaha Kecil) | 3.000 | 3.750 | 4.200 | 4.800 |
| K2 (Usaha Besar) | 4.500 | 5.625 | 6.000 | 7.200 |
| S1 (Sosial) | 800 | 1.000 | – | 1.500 |

Harga dalam Rp/m³. Ditambah biaya admin Rp 5.000 + PPJ 10%.

---

## 📱 Install sebagai PWA

1. Buka aplikasi di browser Chrome/Edge
2. Klik ikon install di address bar, atau
3. Menu → "Add to Home Screen"
4. Aplikasi tersedia offline untuk fitur dasar

---

## 📲 WhatsApp Bot & Notifikasi

AquaMeter mendukung dua mode pengiriman WhatsApp yang bisa dipilih di **Settings → Notifikasi WhatsApp**.

### Mode yang Tersedia

| Mode | Keterangan | Kelebihan |
|---|---|---|
| **Baileys (QR Scan)** | Hubungkan nomor WA pribadi via scan QR | Gratis, tidak perlu akun tambahan |
| **Fonnte API** | Kirim via layanan API [fonnte.com](https://fonnte.com) | Stabil, tidak perlu HP selalu online, mendukung webhook |

---

### 🌐 Setup Fonnte API

#### Langkah 1 — Daftar & Hubungkan Perangkat
1. Buat akun di [fonnte.com](https://fonnte.com)
2. Tambah perangkat baru → scan QR dari dashboard Fonnte menggunakan HP/nomor WA yang akan digunakan
3. Pastikan status perangkat **Connected**

#### Langkah 2 — Salin Token
1. Di dashboard Fonnte, buka **Settings → Token**
2. Salin token (contoh: `AbCdEfGhIj1234567890`)

#### Langkah 3 — Konfigurasi di AquaMeter
1. Buka **Settings → Notifikasi WhatsApp**
2. Pilih provider **🌐 Fonnte API**
3. Paste token di kolom **Token API Fonnte**
4. Klik **🔌 Test Token** — pastikan muncul notifikasi "Fonnte terhubung"
5. Klik **Simpan Pengaturan WA**
6. Klik **🔌 Verifikasi Token** untuk mengaktifkan koneksi

#### Langkah 4 — Daftarkan Webhook (untuk bot pesan masuk)
1. Di Settings AquaMeter, salin URL dari kolom **URL Webhook**:
   ```
   https://domain-anda.com/webhook/fonnte
   ```
2. Di dashboard Fonnte → pilih perangkat → **Settings → Webhook URL**
3. Paste URL tersebut → Save
4. Setiap pesan masuk dari pelanggan akan diteruskan ke bot AquaMeter

> **Catatan:** URL webhook harus dapat diakses dari internet (bukan `localhost`).  
> Untuk development, gunakan layanan tunnel seperti [ngrok](https://ngrok.com):
> ```bash
> ngrok http 3001
> # Gunakan URL ngrok sebagai webhook, contoh: https://abc123.ngrok.io/webhook/fonnte
> ```

---

### 🔔 Notifikasi Otomatis

Pesan WA dikirim otomatis pada event berikut:

| Event | Penerima | Keterangan |
|---|---|---|
| Baca meter baru | Pelanggan | Konfirmasi stand + estimasi tagihan |
| **Revisi baca meter** | Pelanggan | Diawali header `📝 *REVISI BACA METER*` |
| Tagihan lunas | Pelanggan | Konfirmasi pembayaran diterima |
| Pasang baru — pendaftaran | Pemohon | Nomor registrasi diterima |
| Pasang baru — invoice | Pemohon | Detail biaya pemasangan |
| Pasang baru — lunas | Pemohon | Konfirmasi pembayaran |
| Pasang baru — selesai | Pemohon | Nomor meter & tanggal pasang |

#### Variabel Template Baca Meter
```
{nama}           Nama pelanggan
{nomor_meter}    Nomor meter pelanggan
{bulan}          Periode bulan (contoh: Mei 2026)
{tanggal_baca}   Tanggal pembacaan (YYYY-MM-DD)
{meter_awal}     Stand awal (m³)
{meter_akhir}    Stand akhir / baru (m³)
{pemakaian}      Selisih pemakaian (m³)
{tagihan}        Total tagihan (format Rupiah)
{jatuh_tempo}    Tanggal jatuh tempo
{nama_perusahaan} Nama PDAM/perusahaan dari Settings
```

#### Variabel Template Pembayaran
```
{nama}           Nama pelanggan
{nomor_meter}    Nomor meter
{invoice}        Nomor invoice
{bulan}          Periode tagihan
{jumlah}         Jumlah yang dibayar
{tgl_bayar}      Tanggal pembayaran
{nama_perusahaan} Nama perusahaan
```

---

### 🤖 Bot Pesan Masuk (Catat Meter Mandiri)

Pelanggan dapat berinteraksi langsung via WhatsApp. Bot berjalan pada **kedua mode** (Baileys & Fonnte).

#### Perintah yang Tersedia

| Perintah | Fungsi |
|---|---|
| `catat` | Mulai alur catat stand meter mandiri |
| `tagihan` | Cek tagihan bulan berjalan |
| `aduan` | Laporkan keluhan/gangguan |
| `tiket` | Cek status pengaduan |
| `bantuan` | Tampilkan daftar perintah |
| `batal` | Batalkan proses yang sedang berjalan |
| `TKT-0001` | Cek status tiket langsung dengan nomor |

#### Alur Registrasi Pertama
Pelanggan baru harus mengirim nomor meter mereka sekali untuk menautkan akun WhatsApp:

```
Pelanggan: MET-0001
Bot: ✅ Registrasi Berhasil!
     Akun WhatsApp Anda berhasil ditautkan ke:
     👤 Budi Santoso
     🔢 No. Meter: MET-0001
```

#### Contoh Alur Catat Meter

```
Pelanggan: catat
Bot: 👋 Halo Budi Santoso!
     📍 No. Meter  : MET-0001
     📊 Stand Lama : 1100 m³
     Silakan kirim angka stand meter saat ini.

Pelanggan: 1245
Bot: 📋 Konfirmasi Pembacaan Meter
     Stand Lama : 1100 m³
     Stand Baru : 1245 m³
     Pemakaian  : 145 m³
     Total      : Rp 92.500
     Ketik ya untuk konfirmasi atau batal.

Pelanggan: ya
Bot: ✅ Pembacaan Meter Berhasil Dicatat!
     No. Invoice : INV-2026-0043
     Total       : Rp 92.500
     Jatuh Tempo : 21 Mei 2026
```

---

### ⚙️ Antrian Pesan

Semua pesan WA masuk ke antrian sebelum dikirim. Status antrian bisa dipantau di **Settings → Antrian Pesan WhatsApp**:

| Status | Keterangan |
|---|---|
| **Menunggu** | Pesan antre, belum diproses |
| **Mengirim** | Sedang dikirim |
| **Terkirim** | Berhasil dikirim |
| **Gagal** | Gagal dikirim — bisa di-retry |

- Baileys: jeda antar pesan 8–20 detik (meniru perilaku manusia)
- Fonnte: jeda antar pesan 1–3 detik (API-based)

---

## 📄 Lisensi
MIT — Bebas digunakan dan dimodifikasi untuk keperluan PDAM / pemerintah daerah.
