"use strict";

/* ---------------- Dashboard Utama: ringkasan bisnis yang mudah dipahami + unduh PDF ----------------
   Memakai computeSales() (sections/sales.js) sebagai sumber angka, sehingga selalu konsisten dengan
   menu Analisis Penjualan dan definisi pesanan yang dihitung (OrderStatus). */
var DB_ICONS = {
  money:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.7"/></svg>',
  orders: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 7h14l-1.4 11.2a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3L5 7z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  avg:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 15l3-4 3 2 4-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  box:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 7l8 4 8-4M12 11v10" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  users:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M3 20c0-3.4 2.7-5.4 6-5.4s6 2 6 5.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18.5 14.8c1.6.8 2.5 2.4 2.5 5.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  cancel: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
};

function dbFmtDate(key){
  if(!key) return '—';
  var p = key.split('-'), mo = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return parseInt(p[2], 10) + ' ' + mo[parseInt(p[1], 10) - 1] + ' ' + p[0];
}
function dbShort(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }

// Semua angka dan kalimat dashboard dihitung di sini sekali, dipakai tampilan layar dan PDF.
function getDashboardData(){
  var m = computeSales();
  if(!m.allOrders.length) return { empty: true, m: m };
  var d = { empty: false, m: m };
  d.cancelRate = m.allOrders.length ? m.cancelled.length / m.allOrders.length * 100 : 0;
  d.completed = m.allOrders.filter(function(o){ return OrderStatus.isCompleted(o.status); }).length;

  var cust = {};
  m.orders.forEach(function(o){ var c = String(o.customer_id || '').trim(); if(c) cust[c] = true; });
  d.customers = Object.keys(cust).length;

  var days = m.dayKeys;
  d.firstDay = days[0]; d.lastDay = days[days.length - 1];
  d.period = days.length ? (dbFmtDate(d.firstDay) + ' – ' + dbFmtDate(d.lastDay)) : '—';
  var last7 = 0, prev7 = 0;
  days.slice(-7).forEach(function(k){ last7 += m.byDay[k].revenue; });
  days.slice(-14, -7).forEach(function(k){ prev7 += m.byDay[k].revenue; });
  d.wow = (days.length >= 14 && prev7 > 0) ? (last7 - prev7) / prev7 * 100 : null;

  d.topProducts = salesTopN(m.pRev, 5);
  d.topProv = salesTopN(m.prov, 5);
  d.topDow = SALES_DOW_ORDER.reduce(function(b, x){ return m.dow[x].revenue > (b === null ? -1 : m.dow[b].revenue) ? x : b; }, null);
  d.topProd = d.topProducts[0] || null;
  d.top3Share = (d.topProducts.length && m.productRevTotal) ? d.topProducts.slice(0, 3).reduce(function(s, p){ return s + p.v; }, 0) / m.productRevTotal * 100 : 0;

  // Deret harian lengkap (hari kosong = 0) untuk grafik tren di PDF
  d.trendLabels = []; d.trendValues = [];
  if(days.length){
    var cur = new Date(days[0] + 'T00:00:00'), end = new Date(days[days.length - 1] + 'T00:00:00');
    while(cur <= end){ var k = dayKey(cur); d.trendLabels.push(fmtDayShort(k)); d.trendValues.push(m.byDay[k] ? m.byDay[k].revenue : 0); cur.setDate(cur.getDate() + 1); }
  }

  // Prakiraan 7 hari (selalu pendapatan) untuk kalimat ringkas
  var plan = getForecastPlan('revenue', 7);
  d.forecast = plan.hasEnoughData ? plan.future.reduce(function(s, f){ return s + f.pred; }, 0) : null;
  d.forecastDays = plan.horizon;

  // Kartu "apa artinya" dalam bahasa sederhana
  var ins = [];
  if(d.wow !== null){
    ins.push({ tone: d.wow >= 0 ? 'brand' : 'brick', title: d.wow >= 0 ? 'Penjualan sedang naik' : 'Penjualan sedang turun',
      text: 'Pendapatan 7 hari terakhir ' + (d.wow >= 0 ? 'naik ' : 'turun ') + Math.abs(d.wow).toFixed(1) + '% dibanding 7 hari sebelumnya (' + idrShort(last7) + ' vs ' + idrShort(prev7) + ').' });
  } else {
    ins.push({ tone: 'blue', title: 'Tren belum bisa dinilai', text: 'Butuh minimal 14 hari transaksi untuk membandingkan minggu ini dengan minggu lalu.' });
  }
  if(d.topProd){
    ins.push({ tone: 'amber', title: 'Produk andalan', text: dbShort(d.topProd.name, 70) + ' menyumbang ' + salesPct(d.topProd.v, m.productRevTotal) + '% nilai penjualan produk.' +
      (d.top3Share >= 70 ? ' Tiga produk teratas sangat dominan (' + d.top3Share.toFixed(0) + '%); pastikan stoknya selalu aman.' : '') });
  }
  if(d.topDow !== null && m.dow[d.topDow].orders){
    ins.push({ tone: 'blue', title: 'Hari paling ramai', text: SALES_DAY_LONG[d.topDow] + ' adalah hari terbaik: ' + salesPct(m.dow[d.topDow].revenue, m.revenue) + '% pendapatan masuk di hari ini. Cocok untuk promosi atau menambah stok.' });
  }
  ins.push({ tone: d.cancelRate > 15 ? 'brick' : 'brand', title: d.cancelRate > 15 ? 'Pembatalan perlu diperhatikan' : 'Pembatalan terkendali',
    text: d.cancelRate.toFixed(1) + '% pesanan dibatalkan (' + m.cancelled.length.toLocaleString('id-ID') + ' dari ' + m.allOrders.length.toLocaleString('id-ID') + '). ' + (d.cancelRate > 15 ? 'Di atas batas wajar 15%; cek penyebabnya (stok habis, pembayaran, ongkir).' : 'Masih di bawah batas wajar 15%.') });
  if(d.forecast !== null){
    ins.push({ tone: 'amber', title: 'Perkiraan ' + d.forecastDays + ' hari ke depan', text: 'Jika pola berlanjut, pendapatan sekitar ' + idrShort(d.forecast) + '. Ini perkiraan statistik, bukan jaminan.' });
  }
  d.insights = ins;

  d.story = 'Pada periode <b>' + d.period + '</b>, toko menerima <b>' + m.orders.length.toLocaleString('id-ID') + ' pesanan</b> yang dihitung dengan total pendapatan <b>' + idr(m.revenue) + '</b> ' +
    '(rata-rata <b>' + idr(m.avgOrder) + '</b> per pesanan, sekitar <b>' + idr(m.avgPerDay) + '</b> per hari transaksi).' +
    (d.wow !== null ? ' Dibanding minggu sebelumnya, penjualan ' + (d.wow >= 0 ? '<b>naik ' : '<b>turun ') + Math.abs(d.wow).toFixed(1) + '%</b>.' : '');
  return d;
}

function renderDashboardHome(){
  var d = getDashboardData();
  var grid = document.getElementById('kpiGrid');
  var storyEl = document.getElementById('dbStory');
  var insEl = document.getElementById('dbInsights');
  var periodEl = document.getElementById('dbPeriod');
  var pdfBtn = document.getElementById('btnDashPdf');
  var sub = document.getElementById('dashSub');
  if(pdfBtn) pdfBtn.disabled = d.empty;

  if(d.empty){
    grid.innerHTML = '';
    if(storyEl){ storyEl.innerHTML = 'Belum ada pesanan pada filter yang aktif. Ubah filter status/provinsi atau unggah data penjualan.'; storyEl.style.display = ''; }
    if(insEl) insEl.innerHTML = '';
    if(periodEl) periodEl.textContent = '—';
    ['dbDow', 'dbStatus'].forEach(salesDestroy);
    ['dbTopProducts', 'dbProvinces', 'dbStatusLegend'].forEach(function(id){ var e = document.getElementById(id); if(e) e.innerHTML = ''; });
    if(sub) sub.textContent = 'Belum ada data';
    return;
  }
  var m = d.m;
  if(periodEl) periodEl.textContent = 'Periode data: ' + d.period + ' · ' + m.activeDays + ' hari transaksi';
  if(storyEl){ storyEl.innerHTML = ''; storyEl.style.display = 'none'; }

  var kpis = [
    { icon: 'money', label: 'Total pendapatan', value: idr(m.revenue), delta: d.wow === null ? 'Perbandingan 7 hari belum tersedia' : ((d.wow >= 0 ? '▲ ' : '▼ ') + Math.abs(d.wow).toFixed(1) + '% vs 7 hari sebelumnya'), cls: d.wow === null ? '' : (d.wow >= 0 ? 'up' : 'down'), help: 'Jumlah uang dari semua pesanan yang dihitung' },
    { icon: 'orders', label: 'Total pesanan', value: m.allOrders.length.toLocaleString('id-ID'), delta: d.completed.toLocaleString('id-ID') + ' selesai · ' + d.cancelRate.toFixed(1) + '% batal', cls: d.cancelRate > 15 ? 'down' : '', help: 'Semua pesanan termasuk yang batal. Di atas 15% pembatalan perlu dicek' },
    { icon: 'avg', label: 'Rata-rata nilai pesanan', value: idr(m.avgOrder), delta: 'belanja per pesanan', cls: '', help: 'Pendapatan ÷ jumlah pesanan' },
    { icon: 'users', label: 'Pelanggan unik', value: d.customers ? d.customers.toLocaleString('id-ID') : '—', delta: d.customers ? (m.qty.toLocaleString('id-ID') + ' unit terjual · ' + m.productCount.toLocaleString('id-ID') + ' produk') : 'kolom pembeli tidak ada di data', cls: '', help: 'Jumlah pembeli yang berbeda' }
  ];
  grid.innerHTML = kpis.map(function(k){
    return '<div class="db-cell" title="' + escapeHtml(k.help) + '"><div class="db-cell-top"><span class="db-cell-lbl">' + k.label + '</span><span class="db-kpi-ic">' + DB_ICONS[k.icon] + '</span></div>' +
      '<div class="db-cell-val tabular">' + k.value + '</div><div class="db-cell-sub ' + k.cls + '">' + k.delta + '</div></div>';
  }).join('');

  if(insEl) insEl.innerHTML = d.insights.slice(0, 4).map(function(f){
    return '<div class="db-ins tone-' + f.tone + '"><i class="db-ins-dot"></i><div><div class="db-ins-title">' + escapeHtml(f.title) + '</div><div class="db-ins-text">' + escapeHtml(f.text) + '</div></div></div>';
  }).join('');

  var c = salesCss();
  document.getElementById('dbTopProducts').innerHTML = salesRankRows(d.topProducts, m.productRevTotal, function(v){ return idrShort(v); }, 'var(--brand)',
    function(p){ return (m.pQty[p.name] || 0).toLocaleString('id-ID') + ' unit terjual'; });
  document.getElementById('dbProvinces').innerHTML = d.topProv.length ? salesRankRows(d.topProv, m.allOrders.length, function(v){ return v.toLocaleString('id-ID') + ' pesanan'; }, 'var(--amber)') : '<div class="kpi-delta">Kolom provinsi tidak ada pada data.</div>';

  // Donat status pesanan
  salesDestroy('dbStatus');
  var st = salesTopN(m.status, 6), stTotal = st.reduce(function(s, e){ return s + e.v; }, 0);
  var stColors = st.map(function(e, i){ return OrderStatus.isCompleted(e.name) ? '#2F6F4E' : (OrderStatus.isCancelled(e.name) ? '#B0473B' : SALES_PALETTE[(i + 1) % SALES_PALETTE.length]); });
  document.getElementById('dbStatusLegend').innerHTML = salesLegend(st, stTotal, stColors);
  charts.dbStatus = new Chart(document.getElementById('dbStatusChart').getContext('2d'), {
    type: 'doughnut',
    data: { labels: st.map(function(e){ return e.name; }), datasets: [{ data: st.map(function(e){ return e.v; }), backgroundColor: stColors, borderColor: c.surface, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '64%', plugins: { legend: { display: false } } }
  });

  // Pola hari dalam seminggu
  salesDestroy('dbDow');
  var vals = SALES_DOW_ORDER.map(function(x){ return m.dow[x].revenue; }), mx = Math.max.apply(null, vals.concat([0]));
  charts.dbDow = new Chart(document.getElementById('dbDowChart').getContext('2d'), {
    type: 'bar',
    data: { labels: SALES_DOW_ORDER.map(function(x){ return SALES_DAY_SHORT[x]; }), datasets: [{ data: vals, borderRadius: 5, borderWidth: 1, borderColor: c.brand,
      backgroundColor: vals.map(function(v){ return v === mx && v > 0 ? c.brand : c.soft; }) }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(it){ return idr(it.parsed.y) + ' · ' + m.dow[SALES_DOW_ORDER[it.dataIndex]].orders.toLocaleString('id-ID') + ' pesanan'; } } } },
      scales: { x: { grid: { display: false }, ticks: { color: c.muted } }, y: { grid: { color: c.grid }, beginAtZero: true, ticks: { color: c.muted, callback: function(v){ return idrShort(v); } } } } }
  });

  if(sub) sub.textContent = m.allOrders.length.toLocaleString('id-ID') + ' pesanan · ' + m.activeDays + ' hari transaksi · ' + document.getElementById('dataStatusTxt').textContent;
}

/* ---------------- PDF Dashboard Utama ---------------- */
function exportDashboardPdf(){
  var d = getDashboardData();
  if(d.empty) return Promise.reject(new Error('Belum ada data pada filter yang aktif.'));
  var m = d.m, R = PdfReport.colors;
  return PdfReport.build({ title: 'Laporan Ringkasan Penjualan', subtitle: 'Periode data: ' + d.period + '  |  ' + m.activeDays + ' hari transaksi' }, function(r){
    r.headline(d.story, 'Ringkasan dalam satu paragraf');
    r.kpis([
      { label: 'Total pendapatan', value: idr(m.revenue), note: d.wow === null ? '' : ((d.wow >= 0 ? 'Naik ' : 'Turun ') + Math.abs(d.wow).toFixed(1) + '% vs 7 hari sebelumnya'), tone: d.wow !== null && d.wow < 0 ? 'warn' : 'green' },
      { label: 'Total pesanan', value: m.allOrders.length.toLocaleString('id-ID'), note: d.completed.toLocaleString('id-ID') + ' selesai' },
      { label: 'Rata-rata nilai pesanan', value: idr(m.avgOrder), note: 'per pesanan' },
      { label: 'Produk terjual', value: m.qty.toLocaleString('id-ID') + ' unit', note: m.productCount + ' jenis produk', tone: 'amber' },
      { label: 'Pelanggan unik', value: d.customers ? d.customers.toLocaleString('id-ID') : '-', note: d.customers ? 'pembeli berbeda' : 'tidak ada kolom pembeli', tone: 'blue' },
      { label: 'Tingkat pembatalan', value: d.cancelRate.toFixed(1) + '%', note: m.cancelled.length + ' pesanan batal', tone: d.cancelRate > 15 ? 'warn' : 'green' }
    ]);

    r.section('Apa artinya bagi bisnis Anda?', 'Kesimpulan otomatis dari data, ditulis dengan bahasa sederhana.');
    d.insights.forEach(function(f){ r.headline(f.text, f.title, f.tone); });

    r.section('Tren pendapatan harian', 'Garis hijau = pendapatan per hari. Hari tanpa pesanan dihitung 0.');
    var ma = d.trendValues.map(function(_, i){ if(i < 6) return null; var s = 0; for(var j = i - 6; j <= i; j++) s += d.trendValues[j]; return s / 7; });
    var series = [{ name: 'Pendapatan harian', values: d.trendValues, color: R.green, width: 1.2 }];
    if(d.trendValues.length >= 7) series.push({ name: 'Rata-rata 7 hari', values: ma, color: R.amber, width: 2 });
    r.lines({ labels: d.trendLabels, series: series, fmt: idrShort });

    r.section('Produk terlaris', 'Lima produk dengan nilai penjualan tertinggi.');
    r.hbars({ items: d.topProducts.map(function(p){ return { name: p.name, v: p.v, sub: (m.pQty[p.name] || 0).toLocaleString('id-ID') + ' unit  |  ' + salesPct(p.v, m.productRevTotal) + '% dari total' }; }), fmt: idrShort, numbered: true });

    r.section('Hari paling ramai', 'Pendapatan menurut hari dalam seminggu. Batang oranye = hari terbaik.');
    r.vbars({ labels: SALES_DOW_ORDER.map(function(x){ return SALES_DAY_LONG[x]; }), values: SALES_DOW_ORDER.map(function(x){ return m.dow[x].revenue; }), fmt: idrShort, maxLabels: 7 });

    r.section('Status pesanan', 'Jumlah pesanan menurut statusnya.');
    r.hbars({ items: salesTopN(m.status, 6).map(function(e){ return { name: e.name, v: e.v, color: OrderStatus.isCompleted(e.name) ? R.green : (OrderStatus.isCancelled(e.name) ? R.brick : R.amber), sub: salesPct(e.v, m.allOrders.length, 1) + '% dari seluruh pesanan' }; }), fmt: function(v){ return v.toLocaleString('id-ID') + ' pesanan'; } });

    if(d.topProv.length){
      r.section('Asal pembeli', 'Lima provinsi dengan pesanan terbanyak.');
      r.hbars({ items: d.topProv.map(function(e){ return { name: e.name, v: e.v, sub: salesPct(e.v, m.allOrders.length, 1) + '% pesanan' }; }), fmt: function(v){ return v.toLocaleString('id-ID') + ' pesanan'; }, color: R.amber });
    }

    r.notes([
      'Pendapatan dihitung dari pesanan berstatus selesai (pesanan batal/pengembalian tidak dihitung), dengan filter status/provinsi yang aktif saat laporan dibuat.',
      d.forecast !== null ? 'Perkiraan ' + d.forecastDays + ' hari ke depan: sekitar ' + idr(d.forecast) + ' (model level terbaru x pola hari; lihat menu Forecasting untuk akurasi).' : 'Prediksi belum tersedia karena data historis belum cukup.'
    ], 'Catatan');
  }, 'dashboard-penjualan');
}

PdfReport.bind('btnDashPdf', exportDashboardPdf);

/* Tab "Status / Hari / Wilayah" pada panel rincian */
(function(){
  var tabs = document.getElementById('dbTabs');
  if(!tabs) return;
  var META = {
    status: ['Status pesanan', 'Hijau selesai, merah dibatalkan, warna lain masih berjalan.'],
    dow:    ['Hari paling ramai', 'Pendapatan menurut hari. Batang tua = hari terbaik.'],
    prov:   ['Asal pembeli', '5 provinsi dengan pesanan terbanyak.']
  };
  tabs.addEventListener('click', function(e){
    var btn = e.target.closest('button[data-t]');
    if(!btn) return;
    var t = btn.getAttribute('data-t');
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function(b){ b.classList.toggle('active', b === btn); });
    Array.prototype.forEach.call(document.querySelectorAll('.db-pane'), function(p){ p.classList.toggle('active', p.getAttribute('data-pane') === t); });
    document.getElementById('dbTabTitle').textContent = META[t][0];
    document.getElementById('dbTabDesc').textContent = META[t][1];
    var ch = t === 'status' ? charts.dbStatus : (t === 'dow' ? charts.dbDow : null);
    if(ch && ch.resize) ch.resize();
  });
})();
