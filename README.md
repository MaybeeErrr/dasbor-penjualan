# Dasbor Analitik Penjualan — Vercel + Neon

Dasbor Data Mining & Intelligent Business (RFM, K-Means, forecasting, market basket, dll).
Frontend statis, backend Vercel Functions, database **Neon Postgres**. Data yang diunggah
disimpan di database sehingga tetap ada saat halaman dibuka dari perangkat/peramban lain.

## Struktur proyek

```
dasbor-penjualan/
├── public/                      ← frontend statis (dilayani Vercel)
│   ├── index.html               ← markup saja
│   ├── css/styles.css
│   ├── data/demo-orders.json    ← data contoh (dulu tertanam di HTML)
│   └── js/                      ← dimuat berurutan (lihat <script> di index.html)
│       ├── core/      theme, utils, bubble, state, records
│       ├── data/      mapping (pemetaan kolom), api (fetch ke backend), upload
│       ├── sections/  overview, products, customers, segmentation, insight, basket, evaluation
│       ├── main.js    inisialisasi (muat dari database)
│       └── navigation.js
├── api/
│   ├── orders.js                ← GET / POST / DELETE  →  /api/orders
│   └── _lib/  db.js, auth.js, orders-sql.js
├── db/  schema.sql, migrate.js, seed.js
├── package.json  vercel.json  .env.example  .gitignore
```

Catatan: file JS memakai *global scope* bersama (tanpa bundler), jadi **urutan `<script>` di `index.html` penting**.

## Cara kerja data

| Aksi di dasbor | Yang terjadi |
|---|---|
| Buka dasbor | `GET /api/orders` (per 5.000 baris) → dashboard langsung tampil bila database berisi data |
| Unggah Excel/CSV | Diparse di peramban (SheetJS) → ditampilkan → `POST /api/orders` per 2.000 baris; potongan pertama mengganti isi tabel |
| Hapus data | `DELETE /api/orders` → tabel dikosongkan |
| "Gunakan data contoh" | Memuat `demo-orders.json` hanya untuk tampilan, **tidak menulis ke database** |

---

## Langkah 1 — Siapkan database di Neon

1. Daftar/masuk di <https://neon.com> → **Create project**.
2. Nama bebas (mis. `dasbor-penjualan`). **Region: AWS Asia Pacific (Singapore)** — paling dekat dengan Indonesia dan sama dengan region function Vercel (`sin1`, sudah diatur di `vercel.json`).
3. Setelah project jadi, klik **Connect** di dashboard project, pilih database `neondb`, aktifkan **Connection pooling**, lalu salin *connection string*. Bentuknya:
   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Buat tabel — pilih salah satu:
   - **A. SQL Editor (paling mudah):** menu **SQL Editor** di Neon → tempel seluruh isi `db/schema.sql` → **Run**.
   - **B. Lewat terminal:** lihat Langkah 2 (`npm run db:migrate`).

## Langkah 2 — Uji di komputer (opsional tapi disarankan)

Butuh Node.js 22 dan Git.

```bash
cd dasbor-penjualan
npm install
cp .env.example .env         # lalu isi DATABASE_URL dan APP_PASSWORD
npm run db:migrate           # membuat tabel (lewati jika sudah lewat SQL Editor)
npm run db:seed              # opsional: isi data contoh 188 baris
npm i -g vercel              # sekali saja
vercel dev                   # buka http://localhost:3000
```

`vercel dev` akan meminta login dan *link* project pada pertama kali; jawab sesuai petunjuk di layar.
Jika `vercel dev` membaca env dari Vercel, jalankan `vercel env pull .env.local` setelah Langkah 4.

## Langkah 3 — Kirim ke GitHub

```bash
git init
git add .
git commit -m "Dasbor penjualan: Vercel + Neon"
git branch -M main
# buat repo kosong (private disarankan) di github.com, lalu:
git remote add origin https://github.com/USERNAME/dasbor-penjualan.git
git push -u origin main
```

Pastikan `.env` **tidak** ikut ter-commit (sudah ada di `.gitignore`).

## Langkah 4 — Deploy di Vercel

1. Masuk <https://vercel.com> → **Add New… → Project** → **Import** repo GitHub tadi.
2. **Framework Preset:** `Other`. Biarkan *Build Command* kosong. *Output Directory* sudah `public` lewat `vercel.json`.
3. Buka **Environment Variables**, tambahkan (centang Production, Preview, Development):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | connection string Neon (yang *pooled*) |
   | `APP_PASSWORD` | kata sandi kuat untuk membuka data di dasbor |

   > Alternatif: pasang integrasi **Neon** dari Vercel Marketplace (tab *Storage* pada project). Integrasi mengisi `DATABASE_URL` otomatis; kode ini juga membaca `POSTGRES_URL` sebagai cadangan.
4. Klik **Deploy**. Setelah selesai, buka URL `https://nama-project.vercel.app`.

Lewat CLI (alternatif):
```bash
vercel                       # deploy preview
vercel env add DATABASE_URL  # ulangi untuk APP_PASSWORD
vercel --prod                # deploy produksi
```

> Environment variable hanya terbaca pada deployment **baru**. Jika menambah/mengubahnya setelah deploy, klik **Redeploy**.

## Langkah 5 — Verifikasi

1. Buka URL Vercel. Halaman awal muncul dengan status **"Belum ada data"**.
2. Unggah file Excel/CSV pesanan (atau jalankan `npm run db:seed` untuk data contoh).
   Masukkan `APP_PASSWORD` saat diminta (disimpan hanya selama tab terbuka).
3. Status berubah menjadi *"… — tersimpan di database"*. Refresh halaman: dashboard langsung tampil dari database.
4. Cek di Neon → **Tables** → `orders` untuk melihat barisnya.

## Alur kerja sehari-hari

- Ubah kode → `git push` → Vercel otomatis deploy ulang (branch selain `main` mendapat URL preview).
- Ganti data → unggah file baru di dasbor (menggantikan seluruh isi tabel `orders`).
- Ubah struktur tabel → edit `db/schema.sql` (gunakan `ALTER TABLE` untuk tabel yang sudah berisi) dan jalankan di SQL Editor Neon.

## Keamanan

- `APP_PASSWORD` melindungi semua endpoint `/api/orders`. Tanpanya, siapa pun yang tahu URL bisa membaca/menghapus data. **Selalu isi di produksi.**
- Data pesanan bisa memuat kota/pelanggan; jaga repo GitHub tetap *private* dan jangan commit `.env`.
- Untuk akses multi-pengguna dengan login sungguhan, tambahkan autentikasi (mis. Auth.js / Clerk) dan kolom `user_id` pada tabel.

## Pemecahan masalah

| Gejala | Penyebab / solusi |
|---|---|
| `DATABASE_URL belum diatur` di log function | Env var belum ada/belum redeploy. Vercel → Settings → Environment Variables → Redeploy |
| `relation "orders" does not exist` | Tabel belum dibuat — jalankan `db/schema.sql` (Langkah 1.4) |
| Kata sandi terus ditolak | Cocokkan dengan `APP_PASSWORD` di Vercel; tutup tab lalu buka lagi untuk reset sesi |
| Permintaan pertama lambat (1–3 dtk) | Compute Neon gratis "tidur" saat idle; bangun otomatis pada query pertama |
| Unggahan gagal `413` / terlalu besar | Batas body Vercel 4,5 MB per permintaan. Ukuran potongan diatur `CHUNK_SIZE` di `public/js/data/api.js` (turunkan bila kolom teks sangat panjang) |
| Data tampil tapi "gagal disimpan" | Lihat **Vercel → Logs**; biasanya env var atau tabel belum siap |
| Tanggal bergeser jam | Waktu disimpan sebagai waktu lokal tanpa zona (`timestamp`); jangan ubah tipe kolom menjadi `timestamptz` tanpa menyesuaikan `api.js` |

## Batasan yang perlu diketahui

- Setiap unggahan **mengganti** seluruh data (bukan menambah). Untuk mode tambah, kirim `replace: false` dari `saveOrders` di `api.js`.
- Silhouette Score dilewati bila pelanggan > 1.500 (batas asli dasbor agar tetap responsif).
- Seluruh perhitungan analitik tetap berjalan di peramban; database hanya menyimpan/menyajikan data mentah.
