-- ============================================================
-- Migrasi pelanggan dari database PAMSIMAS lama ke AquaMeter
-- Jalankan di MySQL server yang sama dengan kedua database.
-- Ganti `pamsimas` jika nama database lama berbeda.
-- ============================================================

-- Nonaktifkan strict mode sementara agar '0000-00-00' tidak error
SET sql_mode = '';

INSERT INTO aquameter.customers
  (name, ktp, meter, grp, address, phone, last_stand, join_date, status)
SELECT
  -- Nama pelanggan
  p.nama AS name,

  -- KTP tidak ada di data lama
  NULL AS ktp,

  -- Nomor meter: prioritaskan id_meter → idpel → fallback 'MIG-XXXX'
  CASE
    WHEN p.id_meter != '' THEN p.id_meter
    WHEN p.idpel   != '' THEN p.idpel
    ELSE CONCAT('MIG-', LPAD(p.id_pelanggan, 4, '0'))
  END AS meter,

  -- Golongan: 'Warga' → R1, 'Non Warga' → R2, kosong → R1
  CASE p.golongan
    WHEN 'Non Warga' THEN 'R2'
    ELSE 'R1'
  END AS grp,

  -- Alamat: gabungkan alamat + RT + RW
  CASE
    WHEN p.rt != '' AND p.rw != ''
      THEN CONCAT(p.alamat, ' RT ', p.rt, ' RW ', p.rw)
    ELSE p.alamat
  END AS address,

  -- Nomor HP: konversi bigint 628xxx → 08xxx, abaikan nilai tidak valid (0 atau 1)
  CASE
    WHEN p.no_telpon > 10000000000
         AND LEFT(CAST(p.no_telpon AS CHAR), 2) = '62'
      THEN CONCAT('0', SUBSTRING(CAST(p.no_telpon AS CHAR), 3))
    WHEN p.no_telpon > 10000000000
      THEN CAST(p.no_telpon AS CHAR)
    ELSE NULL
  END AS phone,

  -- Stand awal 0 (belum ada data baca meter)
  0 AS last_stand,

  -- tanggal_daftar semua '0000-00-00' → pakai hari ini
  CURDATE() AS join_date,

  -- status_pelanggan = 0 → aktif
  'active' AS status

FROM pamsimas.pelanggan p

-- Hanya import yang punya nama
WHERE p.nama != ''

-- Hindari duplikat meter yang sudah ada di customers
AND CASE
      WHEN p.id_meter != '' THEN p.id_meter
      WHEN p.idpel    != '' THEN p.idpel
      ELSE CONCAT('MIG-', LPAD(p.id_pelanggan, 4, '0'))
    END
    NOT IN (SELECT meter FROM aquameter.customers);

-- Kembalikan sql_mode ke default
SET sql_mode = DEFAULT;

-- Lihat hasil
SELECT COUNT(*) AS total_diimport FROM aquameter.customers;
