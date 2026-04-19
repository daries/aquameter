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
│   ├── index.js         # Express API + SQLite runtime
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

## 🐳 Deploy dengan Docker

### Prasyarat
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose v2

### SQLite (Paling Simpel)

Tidak perlu database eksternal. Data disimpan di Docker volume.

```bash
# Clone & masuk ke folder proyek
git clone <repo-url> aquameter && cd aquameter

# Jalankan
docker compose up -d

# Akses aplikasi
# http://localhost:3001
```

---

### MySQL

```bash
# Salin file konfigurasi (opsional, untuk custom password)
cp .env.example .env

# Jalankan dengan profil MySQL
docker compose --profile mysql up -d
```

Setelah container jalan:
1. Buka `http://localhost:3001`
2. Masuk ke **Settings → Database & Migrasi**
3. Isi koneksi MySQL: host `mysql`, port `3306`, user/password sesuai `.env`
4. Klik **Test Koneksi** lalu **Jalankan Migrasi**

---

### PostgreSQL

```bash
cp .env.example .env

docker compose --profile postgres up -d
```

Setelah container jalan, konfigurasi di **Settings → Database** dengan host `postgres`, port `5432`.

---

### Kustomisasi Port

```bash
PORT=8080 docker compose up -d
```

---

### Perintah Berguna

```bash
# Lihat log
docker compose logs -f aquameter

# Restart
docker compose restart aquameter

# Hentikan semua
docker compose down

# Hapus termasuk data (HATI-HATI: data hilang)
docker compose down -v

# Build ulang setelah update kode
docker compose build --no-cache && docker compose up -d
```

---

### Struktur Volume

| Volume | Isi |
|---|---|
| `aquameter_data` | Database SQLite, `db-config.json`, sesi WhatsApp |

Untuk backup data SQLite:
```bash
docker run --rm -v aquameter_aquameter_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/aquameter-backup.tar.gz /data
```

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

Pelanggan: catat
Bot: 👋 Halo Budi Santoso!
     📍 No. Meter  : 001
     📊 Stand Lama : 1100 m³
     Silakan kirim angka stand meter saat ini...

Pelanggan: 1245
Bot: 📋 Konfirmasi Pembacaan Meter
     Stand Lama : 1100 m³ → Stand Baru : 1245 m³
     Pemakaian  : 145 m³
     Total      : Rp 92.500
     Ketik ya untuk konfirmasi atau batal...

Pelanggan: ya
Bot: ✅ Pembacaan Meter Berhasil Dicatat!
     No. Invoice : INV-2026-0043
     Total       : Rp 92.500
     Jatuh Tempo : 21 April 2026


## 📄 Lisensi
MIT — Bebas digunakan dan dimodifikasi untuk keperluan PDAM / pemerintah daerah.
