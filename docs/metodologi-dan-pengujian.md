# Metodologi, Justifikasi Algoritma, dan Rencana Pengujian

Dokumen ini melengkapi `README.md` (yang berfokus pada cara menjalankan/deploy
sistem) dengan bagian-bagian yang biasanya diminta pada laporan skripsi
Informatika: peta metodologi penelitian, alasan pemilihan tiap algoritma
dibanding alternatifnya, dan rencana pengujian sistem (black-box). Isi di sini
dirancang untuk dikutip/diadaptasi langsung ke bab Metodologi Penelitian dan
bab Implementasi & Pengujian pada laporan.

---

## 1. Peta Metodologi Penelitian (CRISP-DM)

Proyek ini mengikuti kerangka **CRISP-DM (Cross-Industry Standard Process for
Data Mining)**, dipetakan ke bagian sistem yang sudah dibangun:

| Tahap CRISP-DM | Realisasi pada sistem | Lokasi kode |
|---|---|---|
| **Business Understanding** | Kebutuhan pemilik UMKM: memahami tren penjualan, segmen pelanggan, dan pola pembelian dari rekap pesanan marketplace, tanpa perlu tim data science | Rumusan masalah & tujuan pada laporan (di luar kode) |
| **Data Understanding** | Struktur data pesanan gaya Shopee/marketplace diidentifikasi, kolom dipetakan otomatis berdasarkan nama header | `public/js/data/mapping.js` |
| **Data Preparation** | Konversi tipe data (angka, tanggal), penghapusan baris tanggal kosong, penghapusan duplikat, standardisasi z-score untuk fitur RFM | `public/js/sections/overview.js` (`renderPreprocessingOverview`), `public/js/sections/segmentation.js` (`standardizeRFM`) |
| **Modeling** | Regresi linier (forecasting), K-Means++ (segmentasi pelanggan), Apriori berjenjang (asosiasi produk) | `overview.js` (`linearRegression`), `segmentation.js` (`runKMeansBest`), `basket.js` (`computeMarketBasket`) |
| **Evaluation** | Backtesting MAE/RMSE/MAPE untuk forecasting; Silhouette Score dan metode Elbow untuk K-Means; ambang support/confidence/lift untuk Apriori | `evaluation.js`, `segmentation.js` (`silhouetteScore`, `computeElbow`) |
| **Deployment** | Dasbor web (Vercel) dengan penyimpanan data di Neon Postgres, dapat diakses pemilik UMKM langsung dari peramban | `api/`, `db/`, `vercel.json` |

Pemetaan ini bisa langsung dijadikan gambar/diagram alur pada bab Metodologi.

---

## 2. Justifikasi Pemilihan Algoritma

Bagian ini menjawab pertanyaan yang biasanya muncul saat sidang: **"Kenapa
algoritma ini, bukan yang lain?"**

### 2.1 Forecasting — Regresi Linier (bukan ARIMA/Holt-Winters/Prophet)

| Aspek | Regresi Linier (dipakai) | ARIMA / Holt-Winters / Prophet |
|---|---|---|
| Kebutuhan data historis | Bisa jalan dengan data historis pendek (≥2 hari transaksi berbeda) | Butuh data historis lebih panjang & idealnya musiman berulang untuk hasil andal |
| Kompleksitas komputasi | Ringan, bisa dihitung langsung di peramban (client-side), real-time saat filter berubah | Umumnya butuh backend/pustaka statistik khusus (mis. Python `statsmodels`, `prophet`) — tidak praktis dijalankan di peramban |
| Interpretasi | Mudah dijelaskan ke pemilik UMKM non-teknis (tren naik/turun linier) | Lebih sulit dijelaskan ke pengguna awam (parameter p,d,q, komponen musiman, dsb.) |
| Musiman (seasonality) | **Tidak ditangani** — batasan yang perlu disebutkan eksplisit | Bisa menangani pola musiman/mingguan dengan baik |

**Kesimpulan justifikasi:** Regresi linier dipilih karena data transaksi UMKM
pada studi kasus ini umumnya berdurasi pendek–menengah dan sistem perlu tetap
ringan (berjalan di peramban, tanpa server komputasi berat). Ini dicatat
sebagai **batasan penelitian**: pada data yang lebih panjang dan musiman
kuat, ARIMA/Holt-Winters/Prophet berpotensi memberi akurasi lebih baik dan
menjadi arah pengembangan lanjutan (future work).

### 2.2 Segmentasi Pelanggan — K-Means++ (bukan DBSCAN/Hierarchical)

| Aspek | K-Means++ (dipakai) | DBSCAN | Hierarchical Clustering |
|---|---|---|---|
| Bentuk cluster | Cocok untuk cluster konveks/globular — sesuai karakteristik ruang RFM yang sudah distandardisasi | Cocok untuk cluster berbentuk sembarang berbasis kepadatan, tapi sensitif terhadap parameter `eps`/`minPts` yang sulit ditentukan otomatis pada data RFM | Menghasilkan dendrogram informatif, tapi kompleksitas ~O(n² log n) kurang scalable untuk pelanggan dalam jumlah besar |
| Kebutuhan jumlah cluster (K) | Ditentukan pengguna, dibantu metode **Elbow** dan **Silhouette Score** untuk validasi | Tidak perlu K, tapi perlu tuning `eps`/`minPts` yang setara sulitnya | Perlu titik potong (cut-off) manual pada dendrogram |
| Interpretasi bisnis | Selaras dengan praktik standar **segmentasi RFM** (High Value, Loyal, At Risk, dst.) yang lazim di industri | Kurang lazim dipetakan langsung ke label bisnis RFM | Bisa dipetakan, tapi implementasi & visualisasi dendrogram lebih kompleks untuk dashboard web |
| Kompleksitas komputasi | O(n·K·iterasi) — ringan, dijalankan real-time di peramban dengan multi-restart | Bisa lebih berat tergantung struktur data | O(n²) ke atas |

**Kesimpulan justifikasi:** K-Means++ dipilih karena selaras dengan praktik
segmentasi RFM standar, murah secara komputasi untuk dijalankan real-time di
peramban, dan hasilnya (Silhouette Score, Elbow) sudah diukur secara
kuantitatif pada halaman Model Evaluation — bukan sekadar dipilih tanpa
pembanding.

### 2.3 Asosiasi Produk — Apriori Berjenjang (bukan FP-Growth)

| Aspek | Apriori (dipakai) | FP-Growth |
|---|---|---|
| Kemudahan implementasi & penjelasan | Tahapan *candidate generation* dan *pruning* eksplisit, mudah dijelaskan langkah demi langkah pada laporan | Struktur FP-Tree lebih efisien untuk data sangat besar, tapi lebih rumit diimplementasikan & dijelaskan |
| Skala data | Cocok untuk jumlah produk terbatas (skala UMKM, puluhan produk) — dibatasi ke `MBA_MAX_PRODUCTS` produk terpopuler agar tetap responsif di peramban | Lebih unggul saat jumlah item/transaksi sangat besar (skala ritel besar) |
| Keluaran | Frequent itemset 1–3 item + aturan asosiasi (support, confidence, lift) | Frequent itemset, secara umum hasil akhir setara dengan Apriori |

**Catatan implementasi:** Versi awal dasbor ini hanya menghitung pasangan
2-produk (pairwise co-occurrence), bukan Apriori penuh. Implementasi saat ini
sudah diperbaiki menjadi Apriori berjenjang yang sesungguhnya — frequent
1-itemset → kandidat 2-itemset (join + prune) → frequent 2-itemset → kandidat
3-itemset (join + prune) → frequent 3-itemset — sesuai sifat *downward
closure* Apriori, sebelum aturan asosiasi dibangkitkan dari seluruh itemset
yang frequent (lihat `public/js/sections/basket.js`).

---

## 3. Rencana Pengujian Sistem (Black-Box Testing)

Pengujian di bawah ini bertipe **black-box** — menguji perilaku sistem dari
sisi pengguna tanpa melihat kode internal — dan dapat dijadikan lampiran bab
Pengujian pada laporan. Setiap baris idealnya diisi kolom "Hasil Aktual" dan
"Status (Valid/Invalid)" setelah pengujian benar-benar dijalankan terhadap
sistem yang sudah di-deploy.

| ID | Fitur | Skenario | Langkah Pengujian | Data/Input | Hasil yang Diharapkan |
|---|---|---|---|---|---|
| BB-01 | Unggah data | Unggah berkas Excel/CSV valid | Buka dasbor → pilih berkas rekap pesanan (.xlsx/.csv) → unggah | Berkas rekap pesanan gaya Shopee dengan kolom lengkap | Data terparse, tabel & seluruh chart terisi, status berubah menjadi "tersimpan di database" |
| BB-02 | Unggah data | Unggah berkas dengan kolom tidak lengkap | Unggah berkas yang tidak memiliki kolom tanggal pesanan | Berkas tanpa kolom tanggal | Sistem menampilkan pesan bahwa baris tanpa tanggal valid dihapus/tidak dapat diproses, bukan error yang tidak jelas |
| BB-03 | Unggah data | Unggah berkas format tidak didukung | Unggah berkas berformat selain .xlsx/.csv (mis. .pdf) | Berkas .pdf | Sistem menolak dengan pesan kesalahan yang jelas, tidak crash |
| BB-04 | Pemetaan kolom | Header kolom berbeda dari nama standar | Unggah berkas dengan penamaan header yang sedikit berbeda (mis. "Tgl Pesanan" vs "Waktu Pesanan Dibuat") | Berkas dengan variasi header | Pemetaan otomatis berhasil mengenali kolom yang relevan, atau menampilkan opsi pemetaan manual |
| BB-05 | Autentikasi | Masuk dengan kata sandi salah | Masukkan nama akun benar tapi kata sandi salah saat login | Kata sandi acak | Permintaan ditolak (401), pesan "Nama akun atau kata sandi salah." |
| BB-06 | Autentikasi | Masuk dengan kredensial benar | Masukkan nama akun & kata sandi yang sesuai | Kredensial valid | Token sesi diterbitkan, dasbor akun tersebut (dan dataset miliknya saja) dapat diakses |
| BB-06b | Autentikasi | Akun lain tidak bisa melihat dataset akun ini | Masuk sebagai akun B, coba akses `datasetId` milik akun A | id dataset akun A | API mengembalikan 404 (bukan data akun A), membuktikan isolasi antar akun |
| BB-07 | Filter | Filter status pesanan | Pilih filter status "Selesai" saja | — | KPI, chart, dan tabel hanya menghitung transaksi berstatus selesai |
| BB-08 | Filter | Filter provinsi | Pilih salah satu provinsi pada filter | — | Seluruh dasbor (KPI, RFM, forecasting) menyesuaikan hanya data provinsi terpilih |
| BB-09 | Forecasting | Ubah horizon prediksi | Ganti horizon dari 7 ke 14 dan 30 hari | — | Nilai total & rata-rata prediksi, serta grafik, berubah konsisten sesuai horizon |
| BB-10 | Forecasting | Data historis tidak cukup | Filter data hingga hanya tersisa 1 hari transaksi | — | Sistem menampilkan pesan "data tidak cukup", bukan prediksi yang menyesatkan |
| BB-11 | Segmentasi K-Means | Ubah nilai K | Pilih K=3, K=4, K=5 secara berurutan pada tab K-Means | — | Jumlah cluster, Silhouette Score, dan WCSS diperbarui sesuai K yang dipilih |
| BB-12 | Segmentasi K-Means | Data pelanggan terlalu sedikit | Filter data hingga pelanggan valid < `KMEANS_MIN_CUSTOMERS` | — | Sistem menampilkan pesan bahwa clustering belum dapat dihitung, bukan hasil kosong/error |
| BB-13 | RFM | Data tanpa identitas pelanggan | Unggah data tanpa kolom identitas pelanggan | Berkas tanpa Username Pembeli | Analisis RFM menampilkan pesan bahwa kolom identitas pelanggan tidak ditemukan (tidak membuat ID fiktif) |
| BB-14 | Market Basket Analysis | Transaksi cukup multi-produk | Unggah data dengan banyak pesanan berisi ≥2 produk | — | Frequent itemset (1–3 produk) dan aturan asosiasi (support/confidence/lift) tampil |
| BB-15 | Market Basket Analysis | Transaksi mayoritas 1 produk | Unggah/filter data hingga pesanan multi-produk < `MBA_MIN_MULTI_ITEM` | — | Sistem menampilkan pesan bahwa data tidak cukup untuk MBA, bukan hasil kosong yang membingungkan |
| BB-16 | Hapus data | Hapus satu dataset | Klik tombol hapus (✕) pada salah satu dataset di daftar | — | Seluruh baris `orders` milik dataset tersebut terhapus dari database; dataset lain tidak terpengaruh |
| BB-16b | Perbandingan dataset | Bandingkan ≥2 dataset | Buka menu "Perbandingan Dataset", centang 2 dataset atau lebih, klik "Bandingkan" | 2+ dataset milik akun yang sama | Kartu ringkasan & grafik tren tampil berdampingan per dataset, dengan warna berbeda |
| BB-17 | Ekspor/tampilan | Beralih tema terang/gelap (jika tersedia) | Klik toggle tema | — | Seluruh chart & tabel tetap terbaca pada kedua tema |
| BB-18 | Responsivitas | Buka dasbor pada layar kecil | Buka pada perangkat/lebar layar mobile | — | Layout tetap dapat digunakan (scroll, tabel tidak terpotong secara fatal) |

Untuk laporan, disarankan menambahkan **User Acceptance Testing (UAT)**
tambahan: minta pemilik UMKM (mis. usaha mie soun Klaten) mencoba dasbor
langsung dan mengisi kuesioner singkat (skala Likert) tentang kemudahan
penggunaan dan kebermanfaatan — ini melengkapi pengujian black-box teknis di
atas dengan validasi dari sisi pengguna nyata, dan lazim diminta penguji
skripsi bertipe "Rancang Bangun".

---

## 4. Catatan Keamanan & Batasan Sistem (untuk bab Batasan Penelitian)

Poin-poin berikut sebaiknya dicantumkan eksplisit sebagai batasan sistem pada
laporan, supaya tidak menimbulkan pertanyaan kritis saat sidang tanpa jawaban
yang siap:

1. **Autentikasi berbasis akun per pengguna, tanpa peran (role) berbeda.**
   Sistem memakai akun (nama akun + kata sandi ter-hash dengan `scrypt`) dan
   token sesi yang ditandatangani dengan `SESSION_SECRET`
   (`api/_lib/auth.js`), sehingga setiap akun hanya bisa mengakses dataset
   miliknya sendiri — tapi semua akun punya hak yang sama (tidak ada
   admin/operator/viewer terpisah). Pengembangan lanjutan: peran (role)
   per akun, verifikasi email, atau login pihak ketiga (mis. Google/Auth.js).
2. **Mode unggah selalu membuat dataset baru, bukan menambah (append) ke
   dataset yang sudah ada.** Ini desain yang disengaja agar tiap dataset
   tetap konsisten dengan satu berkas sumber dan mudah dibandingkan satu
   sama lain, tapi perlu dijelaskan eksplisit agar tidak disalahartikan
   sebagai bug saat demo (mengunggah berkas kedua tidak menimpa yang
   pertama — keduanya tersimpan sebagai dataset terpisah).
3. **Perhitungan analitik (forecasting, K-Means, Apriori) berjalan di sisi
   klien (peramban), bukan di server.** Konsekuensinya: performa bergantung
   pada perangkat pengguna, dan karena itu ada batas jumlah kandidat/produk
   yang diproses (`MBA_MAX_PRODUCTS`, `MBA_MAX_CANDIDATES`,
   `KMEANS_SILHOUETTE_MAX_N`) agar dasbor tetap responsif pada data besar.
   Ini perlu disebut sebagai batasan skalabilitas, bukan kesalahan.
4. **Model forecasting tidak menangani musiman**, sesuai justifikasi pada
   bagian 2.1.
5. **Data disimpan di database Neon milik pengguna sendiri** — bukan
   dikelola pihak ketiga di luar kendali pemilik data, tapi tetap perlu
   dijaga kerahasiaan `DATABASE_URL` dan `SESSION_SECRET` (jangan ikut
   ter-commit ke repository publik).
6. **Mode Perbandingan menghitung metrik ringkasan saja** (total
   pendapatan, jumlah pesanan, rata-rata nilai pesanan, produk terlaris,
   tren harian) per dataset yang dipilih — bukan menjalankan seluruh
   pipeline analitik (RFM, K-Means, forecasting, Apriori) secara paralel
   untuk tiap dataset sekaligus, karena itu akan sangat berat dijalankan
   di peramban. Analisis mendalam tetap dilakukan satu dataset pada satu
   waktu lewat menu-menu utama.
