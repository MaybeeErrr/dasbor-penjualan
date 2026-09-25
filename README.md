# Dasbor Analitik Penjualan — Vercel + Neon (Multi-Akun & Multi-Dataset)

Dasbor Data Mining & Intelligent Business (RFM, K-Means, forecasting, market basket, dll).
Frontend statis, backend Vercel Functions, database **Neon Postgres**.

Versi ini menambahkan tiga hal di atas versi dasar:

1. **Akun per pengguna** — setiap orang mendaftar & masuk dengan akunnya sendiri; dataset satu akun tidak terlihat oleh akun lain.
2. **Banyak dataset per akun** — satu akun bisa mengunggah beberapa berkas penjualan (mis. per bulan, per toko, per kanal) sebagai dataset-dataset terpisah, masing-masing bisa dianalisis penuh di seluruh menu dasbor.
3. **Mode Perbandingan** — pilih dua dataset atau lebih untuk melihat perbandingan total pendapatan, jumlah pesanan, rata-rata nilai pesanan, produk terlaris, dan tren harian secara berdampingan.
4. **Popup konfirmasi saat unggah** — berkas yang diunggah tidak langsung disimpan. Berkas diparse & divalidasi dulu di peramban, muncul pratinjau (jumlah baris, rentang tanggal) + kolom nama dataset, dan baru tersimpan ke database setelah ditekan "Simpan sebagai dataset baru".

## Struktur proyek

```
dasbor-penjualan/
├── public/                      ← frontend statis (dilayani Vercel)
│   ├── index.html               ← markup saja
│   ├── css/styles.css
│   ├── data/demo-orders.json    ← data contoh (pratinjau saja, tidak disimpan)
│   └── js/
│       ├── core/      theme, utils, bubble, state, records, auth-ui (gerbang login/daftar)
│       ├── data/      mapping (pemetaan kolom), api (fetch ke backend), upload (parse & popup), datasets-ui (manajer dataset)
│       ├── sections/  overview, products, customers, segmentation, insight, basket, evaluation, compare (perbandingan)
│       ├── main.js    inisialisasi statistik data contoh di landing
│       └── navigation.js
├── api/
│   ├── auth.js                  ← POST (register/login) & GET (pulihkan sesi)  →  /api/auth
│   ├── datasets.js              ← GET/POST/PATCH/DELETE dataset milik akun     →  /api/datasets
│   ├── orders.js                ← GET/POST/DELETE pesanan per dataset          →  /api/orders?datasetId=
│   └── _lib/  db.js, auth.js (token & kata sandi), orders-sql.js
├── db/  schema.sql, migrate.js, seed.js
├── package.json  vercel.json  .env.example  .gitignore
```

Catatan: file JS memakai *global scope* bersama (tanpa bundler), jadi **urutan `<script>` di `index.html` penting**.

## Cara kerja akun & data

| Aksi di dasbor | Yang terjadi |
|---|---|
| Daftar / Masuk | `POST /api/auth` → token sesi (ditandatangani `SESSION_SECRET`) disimpan di `localStorage`, dipakai di header `Authorization: Bearer <token>` pada setiap permintaan berikutnya |
| Buka dasbor setelah masuk | `GET /api/datasets` → daftar dataset milik akun; dataset yang paling baru diperbarui otomatis dimuat (`GET /api/orders?datasetId=`) |
| Unggah Excel/CSV | Diparse di peramban (SheetJS) → **popup pratinjau** (baris valid, tanggal awal/akhir, nama dataset) → setelah dikonfirmasi: `POST /api/datasets` (buat dataset baru) lalu `POST /api/orders?datasetId=` per 2.000 baris |
| Ganti nama / hapus dataset | Tombol ✎ / ✕ pada daftar dataset → `PATCH` / `DELETE /api/datasets?id=` |
| Pindah dataset aktif | Klik salah satu dataset pada daftar → `GET /api/orders?datasetId=` memuat ulang seluruh dasbor untuk dataset tersebut |
| Mode Perbandingan | Pilih ≥2 dataset pada menu "Perbandingan Dataset" → data tiap dataset diambil (dan disimpan sementara di memori peramban selama sesi) lalu dihitung & ditampilkan berdampingan |
| "Lihat data contoh" | Memuat `demo-orders.json` hanya untuk pratinjau di peramban, **tidak membuat dataset / tidak menulis ke database** |
| Keluar | Token dihapus dari `localStorage`; kembali ke layar masuk |

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

> **Migrasi dari versi lama (satu password bersama, satu tabel `orders` global):** skema versi ini berbeda secara struktural (menambahkan `users`, `datasets`, dan `orders.dataset_id`). Jika sebelumnya sudah memakai versi lama, cara termudah adalah menjalankan `db/schema.sql` ini di project Neon yang sama (perintah `CREATE TABLE IF NOT EXISTS` tidak akan mengubah tabel `orders` lama yang belum punya kolom `dataset_id`) — disarankan **membuat database/project Neon baru** agar bersih, lalu pindahkan `DATABASE_URL` di Vercel ke yang baru. Data pesanan lama perlu diunggah ulang sebagai dataset baru setelah mendaftar akun.

## Langkah 2 — Uji di komputer (opsional tapi disarankan)

Butuh Node.js 22 dan Git.

```bash
cd dasbor-penjualan
npm install
cp .env.example .env         # lalu isi DATABASE_URL dan SESSION_SECRET
npm run db:migrate           # membuat tabel (lewati jika sudah lewat SQL Editor)
npm run db:seed              # opsional: buat akun "demo" (kata sandi "demo1234") + dataset contoh 188 baris
npm i -g vercel              # sekali saja
vercel dev                   # buka http://localhost:3000
```

`vercel dev` akan meminta login dan *link* project pada pertama kali; jawab sesuai petunjuk di layar.
Jika `vercel dev` membaca env dari Vercel, jalankan `vercel env pull .env.local` setelah Langkah 4.

Untuk mengganti nama/kata sandi akun contoh dari `db:seed`, jalankan dengan env tambahan:
```bash
SEED_USERNAME=tokosaya SEED_PASSWORD=katasandikuat npm run db:seed
```

## Langkah 3 — Kirim ke GitHub

```bash
git init
git add .
git commit -m "Dasbor penjualan: akun & multi-dataset"
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
   | `SESSION_SECRET` | string acak panjang & rahasia (buat dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |

   > Alternatif untuk `DATABASE_URL`: pasang integrasi **Neon** dari Vercel Marketplace (tab *Storage* pada project). Integrasi mengisi `DATABASE_URL` otomatis; kode ini juga membaca `POSTGRES_URL` sebagai cadangan.
4. Klik **Deploy**. Setelah selesai, buka URL `https://nama-project.vercel.app`.

Lewat CLI (alternatif):
```bash
vercel                       # deploy preview
vercel env add DATABASE_URL
vercel env add SESSION_SECRET
vercel --prod                # deploy produksi
```

> Environment variable hanya terbaca pada deployment **baru**. Jika menambah/mengubahnya setelah deploy, klik **Redeploy**. Mengganti `SESSION_SECRET` setelah orang memakai aplikasi akan membuat semua sesi yang sedang aktif otomatis keluar (mereka perlu masuk lagi) — kata sandi akun tidak terpengaruh.

## Langkah 5 — Verifikasi

1. Buka URL Vercel. Anda akan melihat layar **Masuk / Daftar**.
2. Klik "Daftar", buat akun baru (atau masuk dengan akun `demo` / `demo1234` bila sudah menjalankan `npm run db:seed`).
3. Setelah masuk, unggah berkas Excel/CSV pesanan → periksa popup pratinjau (jumlah baris, rentang tanggal) → isi nama dataset → **Simpan sebagai dataset baru**.
4. Ulangi dengan berkas lain untuk membuat dataset kedua, lalu buka menu **Perbandingan Dataset** di sidebar, centang kedua dataset, dan klik **Bandingkan**.
5. Cek di Neon → **Tables** → `users`, `datasets`, `orders` untuk melihat data tersimpan.

## Alur kerja sehari-hari

- Ubah kode → `git push` → Vercel otomatis deploy ulang (branch selain `main` mendapat URL preview).
- Tambah data penjualan baru → unggah sebagai dataset baru (tidak menimpa dataset lain).
- Ubah struktur tabel → edit `db/schema.sql` (gunakan `ALTER TABLE` untuk tabel yang sudah berisi) dan jalankan di SQL Editor Neon.

## Keamanan

- Setiap akun mendapat token sesi yang ditandatangani dengan `SESSION_SECRET` (HMAC-SHA256, berlaku 30 hari) — **wajib** diisi dengan nilai acak & rahasia di produksi, jangan dibiarkan memakai nilai bawaan di `api/_lib/auth.js`.
- Kata sandi disimpan sebagai hash `scrypt` (fungsi bawaan Node.js) beserta salt acak per akun — kata sandi asli tidak pernah disimpan.
- Setiap permintaan ke `/api/datasets` dan `/api/orders` diverifikasi agar dataset yang diakses benar-benar milik akun yang sedang login (bukan sekadar menebak `id`).
- Data pesanan bisa memuat kota/pelanggan; jaga repo GitHub tetap *private* dan jangan commit `.env`.
- Seluruh perhitungan analitik (forecasting, K-Means, Apriori, perbandingan dataset) berjalan di sisi klien/peramban, bukan di server — lihat batasan skalabilitas terkait di `docs/metodologi-dan-pengujian.md`.

> Untuk justifikasi pemilihan tiap algoritma (kenapa regresi linier, K-Means, dan Apriori — bukan alternatif lain), peta metodologi CRISP-DM, serta rencana pengujian black-box, lihat **`docs/metodologi-dan-pengujian.md`**. Dokumen itu dirancang untuk dikutip langsung ke bab Metodologi Penelitian dan bab Pengujian pada laporan skripsi.

## Pemecahan masalah

| Gejala | Penyebab / solusi |
|---|---|
| `DATABASE_URL belum diatur` di log function | Env var belum ada/belum redeploy. Vercel → Settings → Environment Variables → Redeploy |
| `relation "users"/"datasets"/"orders" does not exist` | Tabel belum dibuat — jalankan `db/schema.sql` (Langkah 1.4) |
| Sesi terus diminta masuk ulang / token ditolak | `SESSION_SECRET` berubah (mis. redeploy dengan nilai baru), atau token sudah lewat 30 hari — masuk kembali |
| Nama akun atau kata sandi salah | Cocokkan ejaan; nama akun bersifat sensitif huruf besar/kecil |
| Nama akun sudah dipakai | Pilih nama akun lain saat mendaftar |
| Permintaan pertama lambat (1–3 dtk) | Compute Neon gratis "tidur" saat idle; bangun otomatis pada query pertama |
| Unggahan gagal `413` / terlalu besar | Batas body Vercel 4,5 MB per permintaan. Ukuran potongan diatur `CHUNK_SIZE` di `public/js/data/api.js` (turunkan bila kolom teks sangat panjang) |
| Data tampil di popup pratinjau tapi gagal disimpan | Lihat **Vercel → Logs**; biasanya env var, tabel belum siap, atau sesi sudah berakhir |
| Tanggal bergeser jam | Waktu disimpan sebagai waktu lokal tanpa zona (`timestamp`); jangan ubah tipe kolom menjadi `timestamptz` tanpa menyesuaikan `api.js` |

## Batasan yang perlu diketahui

- Menghapus dataset akan menghapus permanen seluruh baris pesanan di dalamnya (tidak bisa dibatalkan).
- Silhouette Score dilewati bila pelanggan pada dataset aktif > 1.500 (batas asli dasbor agar tetap responsif).
- Market Basket Analysis (Apriori) dibatasi ke produk terpopuler (`MBA_MAX_PRODUCTS`) dan itemset maksimum 3 produk (`MBA_MAX_ITEMSET_SIZE`) agar tetap responsif di peramban pada data besar.
- Model forecasting (regresi linier) tidak menangani pola musiman.
- Mode Perbandingan menghitung metrik ringkasan (pendapatan, pesanan, AOV, produk terlaris, tren harian) per dataset — bukan menjalankan seluruh analisis mendalam (RFM, K-Means, forecasting, Apriori) secara berdampingan; untuk analisis mendalam per dataset, buka dataset tersebut satu per satu dari daftar dataset.
- Seluruh perhitungan analitik tetap berjalan di peramban; database hanya menyimpan/menyajikan data mentah per dataset.

Rincian justifikasi batasan model ada di `docs/metodologi-dan-pengujian.md`.
