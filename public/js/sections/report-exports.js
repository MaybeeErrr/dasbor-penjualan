"use strict";

/* ---------------- Unduh PDF: Analisis Penjualan, Customer Analytics, Product Analytics, Forecasting ----------------
   Angka mengikuti filter status/provinsi yang aktif. KPI & kalimat kesimpulan diambil dari tampilan
   yang sudah dirender (selalu sama dengan layar); grafik digambar ulang sebagai vektor oleh PdfReport. */
function rxCards(selector){
  return Array.prototype.slice.call(document.querySelectorAll(selector)).map(function(el){
    var q = function(s){ var n = el.querySelector(s); return n ? PdfReport.stripHtml(n.textContent) : ''; };
    return { label: q('.kpi-label, .lbl'), value: q('.kpi-value, .big'), note: q('.kpi-delta, .sub'), warn: el.classList.contains('warn') };
  }).filter(function(k){ return k.label; });
}
function rxText(id){ var el = document.getElementById(id); return el ? PdfReport.stripHtml(el.textContent) : ''; }
function rxKpis(list){ return list.map(function(k){ return { label: k.label, value: k.value, note: k.note, tone: k.warn ? 'warn' : 'green' }; }); }
var RX_ORD = function(v){ return v.toLocaleString('id-ID') + ' pesanan'; };

/* ===== Analisis Penjualan ===== */
function exportSalesPdf(){
  var m = computeSales(), R = PdfReport.colors;
  if(!m.allOrders.length) return Promise.reject(new Error('Belum ada data pada filter yang aktif.'));
  return PdfReport.build({ title: 'Laporan Analisis Penjualan', subtitle: 'Tren, waktu ramai, produk terlaris, pembayaran, status, dan wilayah' }, function(r){
    r.headline(rxText('salesHeadline'), 'Kesimpulan');
    r.kpis(rxKpis(rxCards('#salesKpis .kpi-card')));

    var finds = Array.prototype.slice.call(document.querySelectorAll('#salesFindings .sl-finding'));
    if(finds.length){
      r.section('Temuan utama', 'Dihitung otomatis dari data.');
      finds.forEach(function(f){ var tn = (f.className.match(/tone-(\w+)/) || [])[1]; r.headline(f.querySelector('.sl-finding-text').textContent, f.querySelector('.sl-finding-title').textContent, tn); });
    }

    var labels = [], vals = [];
    if(m.dayKeys.length){
      var cur = new Date(m.dayKeys[0] + 'T00:00:00'), end = new Date(m.dayKeys[m.dayKeys.length - 1] + 'T00:00:00');
      while(cur <= end){ var k = dayKey(cur); labels.push(fmtDayShort(k)); vals.push(m.byDay[k] ? m.byDay[k].revenue : 0); cur.setDate(cur.getDate() + 1); }
    }
    r.section('Tren penjualan harian', 'Pendapatan per hari (hari tanpa pesanan = 0) dan rata-rata bergerak 7 hari.');
    var ma = vals.map(function(_, i){ if(i < 6) return null; var s = 0; for(var j = i - 6; j <= i; j++) s += vals[j]; return s / 7; });
    var ser = [{ name: 'Pendapatan harian', values: vals, color: R.green, width: 1.2 }];
    if(vals.length >= 7) ser.push({ name: 'Rata-rata 7 hari', values: ma, color: R.amber, width: 2 });
    r.lines({ labels: labels, series: ser, fmt: idrShort });

    r.section('Pola per hari dalam seminggu', 'Pendapatan menurut hari. Batang oranye = hari terbaik.');
    r.vbars({ labels: SALES_DOW_ORDER.map(function(x){ return SALES_DAY_LONG[x]; }), values: SALES_DOW_ORDER.map(function(x){ return m.dow[x].revenue; }), fmt: idrShort, maxLabels: 7 });

    if(m.hasHours){
      r.section('Pola per jam', 'Jumlah pesanan menurut jam masuk. Batang oranye = jam tersibuk.');
      r.vbars({ labels: m.hour.map(function(_, i){ return String(i).padStart(2, '0'); }), values: m.hour.map(function(x){ return x.orders; }), maxLabels: 12, color: R.blue });
    }

    r.section('Produk terlaris', '10 produk dengan nilai penjualan tertinggi.');
    r.hbars({ items: salesTopN(m.pRev, 10).map(function(p){ return { name: p.name, v: p.v, sub: (m.pQty[p.name] || 0).toLocaleString('id-ID') + ' unit  |  ' + salesPct(p.v, m.productRevTotal) + '% dari total' }; }), fmt: idrShort, numbered: true });

    r.section('Metode pembayaran');
    r.hbars({ items: salesTopN(m.pay, 8).map(function(e){ return { name: e.name, v: e.v, sub: salesPct(e.v, m.allOrders.length, 1) + '%' }; }), fmt: RX_ORD, color: R.blue });

    r.section('Status pesanan', 'Hijau selesai, merah dibatalkan, kuning status lain.');
    r.hbars({ items: salesTopN(m.status, 8).map(function(e){ return { name: e.name, v: e.v, color: OrderStatus.isCompleted(e.name) ? R.green : (OrderStatus.isCancelled(e.name) ? R.brick : R.amber), sub: salesPct(e.v, m.allOrders.length, 1) + '%' }; }), fmt: RX_ORD });

    var prov = salesTopN(m.prov, 8), city = salesTopN(m.city, 8);
    if(prov.length){ r.section('Sebaran provinsi'); r.hbars({ items: prov.map(function(e){ return { name: e.name, v: e.v, sub: salesPct(e.v, m.allOrders.length, 1) + '%' }; }), fmt: RX_ORD, color: R.amber }); }
    if(city.length){ r.section('Sebaran kota/kabupaten'); r.hbars({ items: city.map(function(e){ return { name: e.name, v: e.v, sub: salesPct(e.v, m.allOrders.length, 1) + '%' }; }), fmt: RX_ORD, color: R.blue }); }

    r.notes(['Pendapatan dan produk dihitung dari pesanan yang dihitung menurut definisi status bersama; status, pembayaran, dan wilayah menghitung seluruh pesanan unik.'], 'Catatan');
  }, 'analisis-penjualan');
}

/* ===== Customer Analytics (RFM + segmentasi) ===== */
function exportCustomerPdf(){
  var res = getCustomerAnalytics(), R = PdfReport.colors;
  if(!res.ok) return Promise.reject(new Error('Analisis RFM belum tersedia (butuh kolom identitas pelanggan dan transaksi selesai).'));
  var list = res.list;
  return PdfReport.build({ title: 'Laporan Customer Analytics (RFM)', subtitle: 'Seberapa baru, seberapa sering, dan seberapa besar pelanggan berbelanja' }, function(r){
    r.headline(rxText('rfmHeadline'), 'Kesimpulan');
    r.kpis(rxKpis(rxCards('#rfmStats .kpi-card')));
    r.notes(['Recency = hari sejak belanja terakhir (makin kecil makin aktif). Frequency = jumlah transaksi. Monetary = total belanja (Rp).']);

    r.section('Kapan terakhir pelanggan berbelanja', 'Jumlah pelanggan menurut jarak hari sejak belanja terakhir.');
    var b = buildRecencyBuckets(list);
    r.vbars({ labels: b.map(function(x){ return x.label; }), values: b.map(function(x){ return x.count; }), maxLabels: 5, highlight: false, color: R.blue });

    var freq = {};
    list.forEach(function(c){ var k = c.frequency >= 5 ? '5+ kali' : c.frequency + ' kali'; freq[k] = (freq[k] || 0) + 1; });
    var fKeys = ['1 kali', '2 kali', '3 kali', '4 kali', '5+ kali'].filter(function(k){ return freq[k]; });
    r.section('Seberapa sering pelanggan berbelanja', 'Jumlah pelanggan menurut banyaknya transaksi.');
    r.hbars({ items: fKeys.map(function(k){ return { name: k, v: freq[k], sub: (freq[k] / list.length * 100).toFixed(1) + '% pelanggan' }; }), fmt: function(v){ return v.toLocaleString('id-ID') + ' pelanggan'; }, color: R.green });

    var top = list.slice(0, 15);
    var totalM = list.reduce(function(s, c){ return s + c.monetary; }, 0);
    r.section('15 pelanggan dengan belanja terbesar', 'Pelanggan terbaik berdasarkan Monetary. Jaga hubungan dengan mereka.');
    r.table({
      head: ['#', 'Pelanggan', 'Recency (hari)', 'Frekuensi', 'Total belanja', '% dari total'],
      body: top.map(function(c, i){ return [String(i + 1), c.customer_id, c.recency === null ? '-' : String(c.recency), String(c.frequency), idr(c.monetary), (totalM ? c.monetary / totalM * 100 : 0).toFixed(1) + '%']; }),
      align: ['center', 'left', 'right', 'right', 'right', 'right'], widths: [26, 'auto', 70, 60, 90, 70]
    });

    var cs = (typeof lastClusterSummaries !== 'undefined') ? lastClusterSummaries : null;
    if(cs && cs.length){
      r.section('Segmen pelanggan (K-Means, K = ' + cs.length + ')', 'Pelanggan dikelompokkan otomatis menurut pola RFM-nya.');
      r.table({
        head: ['Segmen', 'Pelanggan', 'Rata-rata Recency', 'Rata-rata Frekuensi', 'Rata-rata Belanja'],
        body: cs.slice().sort(function(a, c){ return c.cnt - a.cnt; }).map(function(s){ return [s.label || ('Cluster ' + (s.idx + 1)), s.cnt.toLocaleString('id-ID'), s.avgR.toFixed(1) + ' hari', s.avgF.toFixed(2) + 'x', idr(s.avgM)]; }),
        align: ['left', 'right', 'right', 'right', 'right']
      });
    }
    r.notes(['Hanya transaksi selesai dengan identitas pelanggan yang dihitung. Tanggal acuan Recency = transaksi terakhir pada data (' + res.referenceDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ').'], 'Catatan');
  }, 'customer-analytics');
}

/* ===== Product Analytics ===== */
function exportProductPdf(){
  var pa = computeProductAnalytics(), R = PdfReport.colors;
  if(!pa.list.length) return Promise.reject(new Error('Belum ada data produk pada filter yang aktif.'));
  var byRev = pa.list.slice().sort(function(a, b){ return b.revenue - a.revenue; });
  var byUnit = pa.list.slice().sort(function(a, b){ return b.units - a.units; });
  var top3 = byRev.slice(0, 3).reduce(function(s, p){ return s + p.contribution; }, 0);
  var avgPrice = pa.totalUnits ? pa.totalRevenue / pa.totalUnits : 0;
  return PdfReport.build({ title: 'Laporan Product Analytics', subtitle: 'Performa tiap produk dari pesanan yang dihitung' }, function(r){
    r.headline('Terdapat <b>' + pa.list.length + ' jenis produk</b> dengan total nilai penjualan <b>' + idr(pa.totalRevenue) + '</b> dari <b>' + pa.totalUnits.toLocaleString('id-ID') + ' unit</b>. Produk terlaris berdasarkan pendapatan adalah <b>' + byRev[0].name + '</b> (' + byRev[0].contribution.toFixed(1) + '% kontribusi). Tiga produk teratas menyumbang ' + top3.toFixed(1) + '% penjualan' + (top3 >= 70 ? ' - sangat terkonsentrasi, jaga stok produk-produk ini.' : '.'), 'Kesimpulan');
    r.kpis([
      { label: 'Jenis produk', value: pa.list.length.toLocaleString('id-ID') },
      { label: 'Total nilai penjualan', value: idr(pa.totalRevenue), note: 'Subtotal pesanan' },
      { label: 'Total unit terjual', value: pa.totalUnits.toLocaleString('id-ID'), tone: 'amber' },
      { label: 'Rata-rata harga per unit', value: idr(avgPrice), tone: 'blue' },
      { label: 'Kontribusi 3 teratas', value: top3.toFixed(1) + '%', tone: top3 >= 70 ? 'warn' : 'green' }
    ]);

    r.section('10 produk dengan pendapatan tertinggi');
    r.hbars({ items: byRev.slice(0, 10).map(function(p){ return { name: p.name, v: p.revenue, sub: p.contribution.toFixed(1) + '% kontribusi  |  ' + p.units.toLocaleString('id-ID') + ' unit' }; }), fmt: idrShort, numbered: true });
    r.section('10 produk dengan unit terjual terbanyak');
    r.hbars({ items: byUnit.slice(0, 10).map(function(p){ return { name: p.name, v: p.units, sub: idrShort(p.revenue) + '  |  ' + p.transactions.toLocaleString('id-ID') + ' transaksi' }; }), fmt: function(v){ return v.toLocaleString('id-ID') + ' unit'; }, color: R.amber, numbered: true });

    var N = 40;
    r.section('Tabel produk lengkap', pa.list.length > N ? 'Menampilkan ' + N + ' produk teratas dari ' + pa.list.length + ' (urut pendapatan).' : 'Seluruh produk, urut pendapatan.');
    r.table({
      head: ['#', 'Produk', 'Unit', 'Transaksi', 'Pendapatan', 'Kontribusi'],
      body: byRev.slice(0, N).map(function(p, i){ return [String(i + 1), p.name, p.units.toLocaleString('id-ID'), p.transactions.toLocaleString('id-ID'), idr(p.revenue), p.contribution.toFixed(1) + '%']; }),
      align: ['center', 'left', 'right', 'right', 'right', 'right'], widths: [24, 'auto', 52, 62, 90, 60]
    });
    r.notes(['Pendapatan produk = Subtotal Pesanan per baris produk (sebelum diskon/ongkir pesanan), sehingga totalnya bisa berbeda dari Total Pembayaran di Dashboard.'], 'Catatan');
  }, 'product-analytics');
}

/* ===== Forecasting ===== */
function exportForecastPdf(){
  var metric = state.forecastMetric || 'revenue';
  var plan = getForecastPlan(metric, state.horizon), R = PdfReport.colors, meta = FORECAST_METRICS[metric];
  if(!plan.hasEnoughData) return Promise.reject(new Error('Data belum cukup untuk membuat prediksi.'));
  var f = function(v){ return fmtForecastValue(v, metric, true); };
  var fFull = function(v){ return fmtForecastValue(v, metric, false); };
  var total = plan.future.reduce(function(s, x){ return s + x.pred; }, 0);
  var bt = plan.backtest, s = plan.series;
  return PdfReport.build({ title: 'Laporan Forecasting', subtitle: 'Prediksi ' + meta.title + ' untuk ' + plan.horizon + ' hari ke depan' }, function(r){
    r.headline(rxText('fcNarrative') || ('Perkiraan total ' + meta.name + ' ' + plan.horizon + ' hari ke depan: ' + fFull(total) + '.'), 'Kesimpulan');
    r.kpis(rxKpis(rxCards('#forecastGridView .fc-kpi')).concat([
      { label: 'Horizon prediksi', value: plan.horizon + ' hari', note: 'dari ' + plan.model.validDays + ' hari data valid', tone: 'blue' }
    ]));
    if(plan.warnings.length) r.notes(plan.warnings.map(function(w){ return 'Peringatan: ' + w; }));

    // Grafik: 45 hari terakhir aktual + prediksi (+ pita)
    var take = Math.min(45, s.labels.length), start = s.labels.length - take;
    var labels = [], act = [], pred = [], lo = [], hi = [];
    for(var i = start; i < s.labels.length; i++){ labels.push(fmtDayShort(s.labels[i])); act.push(s.missing[i] ? null : s.values[i]); pred.push(null); lo.push(null); hi.push(null); }
    plan.future.forEach(function(x){ labels.push(fmtDayShort(x.label)); act.push(null); pred.push(x.pred); lo.push(x.lower); hi.push(x.upper); });
    if(take) pred[take - 1] = act[take - 1] != null ? act[take - 1] : pred[take - 1];
    r.section('Aktual dan prediksi', 'Garis hijau = data aktual. Garis oranye putus-putus = prediksi' + (plan.band ? '; area krem = pita ketidakpastian 80%.' : '.'));
    var ser = [];
    if(plan.band) ser.push({ name: 'Pita 80%', values: pred, color: [226, 190, 120], width: 0.1, band: { lo: lo, hi: hi } });
    ser.push({ name: 'Aktual', values: act, color: R.green, width: 1.6 });
    ser.push({ name: 'Prediksi', values: pred, color: R.amber, width: 2, dashed: true });
    r.lines({ labels: labels, series: ser, fmt: f });

    r.section('Prediksi per hari');
    r.table({
      head: plan.band ? ['Tanggal', 'Hari', 'Prediksi', 'Batas bawah', 'Batas atas'] : ['Tanggal', 'Hari', 'Prediksi'],
      body: plan.future.map(function(x){
        var row = [fcDayLabel(x.label, true), fcDayLong(x.label), fFull(x.pred)];
        if(plan.band) row.push(fFull(x.lower), fFull(x.upper));
        return row;
      }),
      align: ['left', 'left', 'right', 'right', 'right']
    });

    if(plan.model.useDow){
      r.section('Pola hari dalam seminggu', 'Faktor di atas 1,0 = hari lebih ramai dari rata-rata; di bawah 1,0 = lebih sepi.');
      r.vbars({ labels: FC_DOW_ORDER.map(function(x){ return FC_DAY_SHORT[x]; }), values: FC_DOW_ORDER.map(function(x){ return plan.model.factors[x]; }), fmt: function(v){ return v.toFixed(2); }, maxLabels: 7 });
    }

    r.section('Seberapa akurat model ini?', 'Diuji dengan backtest bergulir: model dilatih pada data lama, lalu menebak hari-hari yang sebenarnya sudah diketahui.');
    if(bt && bt.ok){
      var better = bt.improvement !== null && bt.improvement > 0;
      r.headline('Rata-rata galat model (WAPE) <b>' + fmtPct(bt.wape) + '</b> dibanding pembanding rata-rata biasa <b>' + fmtPct(bt.baseWape) + '</b>' +
        (bt.improvement === null ? '.' : ' - model ' + (better ? '<b>lebih baik ' : '<b>lebih buruk ') + Math.abs(bt.improvement).toFixed(0) + '%</b>.') + ' Dinilai pada ' + bt.points + ' hari' + (bt.points < 20 ? ' (jumlah masih sedikit, hasil belum stabil).' : '.'), better ? 'Model lebih baik dari tebakan rata-rata' : 'Model belum mengalahkan tebakan rata-rata', better ? 'green' : 'brick');
      r.table({
        head: ['Ukuran', 'Model', 'Rata-rata biasa'],
        body: [['MAE (rata-rata selisih)', fFull(bt.mae), fFull(bt.baseMae)], ['RMSE', fFull(bt.rmse), fFull(bt.baseRmse)], ['WAPE (% galat)', fmtPct(bt.wape), fmtPct(bt.baseWape)]],
        align: ['left', 'right', 'right']
      });
      if(bt.folds.length){
        r.table({
          head: ['Periode uji', 'Data latih', 'WAPE model', 'WAPE pembanding'],
          body: bt.folds.map(function(x){ return [fmtDayShort(x.from) + ' - ' + fmtDayShort(x.to), x.trainDays + ' hari', fmtPct(x.wape), fmtPct(x.baseWape)]; }),
          align: ['left', 'right', 'right', 'right']
        });
      }
    } else {
      r.empty('Data belum cukup untuk backtest (butuh minimal ' + FORECAST_CFG.EVAL_MIN_TRAIN + ' hari data latih ditambah horizon), sehingga akurasi belum bisa diukur.');
    }
    r.notes(['Model: prediksi hari tertentu = level terbaru (rata-rata ' + FORECAST_CFG.LEVEL_DAYS + ' hari valid terakhir) x faktor hari dalam seminggu. Tren tidak diperpanjang ke depan dan musim bulanan/tahunan/hari raya tidak ditangani.', 'Prediksi adalah perkiraan statistik, bukan jaminan hasil.'], 'Catatan');
  }, 'forecasting-' + metric);
}

PdfReport.bind('btnSalesPdf', exportSalesPdf);
PdfReport.bind('btnCustomerPdf', exportCustomerPdf);
PdfReport.bind('btnProductPdf', exportProductPdf);
PdfReport.bind('btnForecastPdf', exportForecastPdf);

// Nonaktifkan tombol PDF bila menunya memang belum punya data (dipanggil setiap render()).
function syncReportButtons(){
  function set(id, ok, why){ var b = document.getElementById(id); if(!b) return; b.disabled = !ok; b.title = ok ? '' : why; }
  var hasOrders = state.filtered && state.filtered.length > 0;
  set('btnSalesPdf', hasOrders, 'Belum ada data pada filter yang aktif');
  set('btnProductPdf', hasOrders && computeProductAnalytics().list.length > 0, 'Belum ada data produk pada filter yang aktif');
  set('btnCustomerPdf', getCustomerAnalytics().ok, 'Butuh kolom identitas pelanggan dan transaksi selesai');
  set('btnForecastPdf', hasOrders, 'Belum ada data pada filter yang aktif');
}
