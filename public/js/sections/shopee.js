"use strict";

/* ---------------- Laporan Shopee (Sales/Product/Traffic/Chat/Shop Stats) ----------------
   Menu terpisah dari sistem dataset pesanan: menerima langsung berkas ekspor Shopee Seller
   Centre (Tinjauan Penjualan, Tinjauan Produk, Tinjauan Traffic, Performa Chat, Statistik Toko),
   dikenali otomatis dari kolomnya (data/shopee-parse.js), lalu divisualisasikan di sini. Data
   ini TIDAK disimpan ke database (berbeda dari dataset pesanan yang disinkronkan per akun) —
   hanya disimpan di peramban (localStorage, per akun yang sedang masuk) supaya tidak hilang saat
   me-refresh halaman, tapi tidak ikut berpindah perangkat. Ini keputusan desain yang disengaja
   agar tidak perlu tabel/endpoint baru untuk bentuk data yang sama sekali berbeda dari baris
   pesanan; lihat README untuk detail. */

state.shopee = { sales: null, product: null, traffic: null, chat: null, shopstats: null, files: [] };
state.shopeeTab = 'ringkasan';
var SHOPEE_TYPE_LABEL = { sales: 'Tinjauan Penjualan', product: 'Tinjauan Produk', traffic: 'Tinjauan Traffic', chat: 'Performa Chat', shopstats: 'Statistik Toko' };
var SHOPEE_STORAGE_PREFIX = 'sales-dash-shopee-reports:';
var shopeeStorageUser = null;

/* ---------- Format ---------- */
function fmtIntId(n){ return (n === null || n === undefined || isNaN(n)) ? '—' : Math.round(n).toLocaleString('id-ID'); }
function fmtPctVal(n, digits){ return (n === null || n === undefined || isNaN(n)) ? '—' : n.toLocaleString('id-ID', { minimumFractionDigits: digits==null?2:digits, maximumFractionDigits: digits==null?2:digits }) + '%'; }
function fmtDuration(sec){
  if(sec === null || sec === undefined || isNaN(sec)) return '—';
  if(sec < 60) return Math.round(sec) + ' dtk';
  var m = Math.floor(sec / 60), s2 = Math.round(sec % 60);
  if(m < 60) return m + ' mnt ' + s2 + ' dtk';
  var h = Math.floor(m / 60); m = m % 60;
  return h + ' jam ' + m + ' mnt';
}
function sumField(rows, key){ return rows.reduce(function(a,r){ return a + (typeof r[key]==='number' && !isNaN(r[key]) ? r[key] : 0); }, 0); }
function avgField(rows, key){
  var vals = rows.map(function(r){ return r[key]; }).filter(function(v){ return typeof v==='number' && !isNaN(v); });
  return vals.length ? vals.reduce(function(a,b){ return a+b; },0) / vals.length : null;
}
function dateRangeLabel(rows){
  if(!rows.length) return '—';
  return fmtDayShort(rows[0].date) + ' – ' + fmtDayShort(rows[rows.length-1].date);
}

/* ---------- Penyimpanan lokal (per akun) ---------- */
function shopeeStorageKey(){ return SHOPEE_STORAGE_PREFIX + (shopeeStorageUser || 'tamu'); }
function saveShopeeToStorage(){
  try { localStorage.setItem(shopeeStorageKey(), JSON.stringify(state.shopee)); } catch(e){ /* penuh/nonaktif: lewati diam-diam */ }
}
function loadShopeeFromStorage(){
  try {
    var raw = localStorage.getItem(shopeeStorageKey());
    if(!raw) return;
    var parsed = JSON.parse(raw);
    if(parsed && typeof parsed === 'object') state.shopee = Object.assign({ sales:null, product:null, traffic:null, chat:null, shopstats:null, files:[] }, parsed);
  } catch(e){ /* data lokal rusak: mulai kosong */ }
}
document.addEventListener('auth:ready', function(e){
  shopeeStorageUser = (e.detail && e.detail.username) || null;
  loadShopeeFromStorage();
  renderShopeeMenu();
});

/* ---------- Upload multi-berkas ---------- */
var shopeeDropzone = document.getElementById('shopeeDropzone');
var shopeeFileInput = document.getElementById('shopeeFileInput');
var shopeeUploadError = document.getElementById('shopeeUploadError');

function shopeeShowError(msg){ if(shopeeUploadError){ shopeeUploadError.textContent = msg; shopeeUploadError.classList.add('show'); } }
function shopeeClearError(){ if(shopeeUploadError){ shopeeUploadError.classList.remove('show'); shopeeUploadError.textContent = ''; } }

function readWorkbookSheets(file){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onerror = function(){ reject(new Error('Gagal membaca berkas "' + file.name + '".')); };
    reader.onload = function(e){
      try {
        var wb = XLSX.read(e.target.result, { type: 'array' });
        var sheets = wb.SheetNames.map(function(name){
          return { name: name, aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) };
        });
        resolve(sheets);
      } catch(err){ reject(new Error('Berkas "' + file.name + '" bukan berkas Excel yang valid.')); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function mergeShopeeResult(result){
  if(result.type === 'traffic'){
    state.shopee.traffic = result;
  } else if(result.type === 'chat'){
    // Gabungkan bila diunggah sebagai beberapa sheet dalam beberapa panggilan (jarang, tapi aman).
    state.shopee.chat = result;
  } else {
    state.shopee[result.type] = result;
  }
  state.shopee.files.push({
    name: result.fileName, type: result.type, label: SHOPEE_TYPE_LABEL[result.type],
    addedAt: new Date().toISOString()
  });
}

function processShopeeFiles(fileList){
  var files = Array.prototype.slice.call(fileList || []).filter(function(f){ return /\.(xlsx|xls)$/i.test(f.name); });
  if(!files.length){ shopeeShowError('Tidak ada berkas .xlsx/.xls yang dipilih.'); return; }
  shopeeClearError();
  shopeeSetProcessing(true);
  var errors = [];
  var chain = Promise.resolve();
  files.forEach(function(file){
    chain = chain.then(function(){
      return readWorkbookSheets(file).then(function(sheets){
        var r = ShopeeParse.parseWorkbook(file.name, sheets);
        if(!r.ok) errors.push(r.error);
        else mergeShopeeResult(r);
      }).catch(function(err){ errors.push(err.message); });
    });
  });
  chain.then(function(){
    shopeeSetProcessing(false);
    if(shopeeFileInput) shopeeFileInput.value = '';
    if(errors.length) shopeeShowError(errors.join(' '));
    saveShopeeToStorage();
    renderShopeeMenu();
  });
}

function shopeeSetProcessing(active){
  if(shopeeDropzone) shopeeDropzone.classList.toggle('busy', !!active);
  var txt = document.getElementById('shopeeDropzoneMainTxt');
  if(txt) txt.textContent = active ? 'Membaca berkas…' : 'Seret satu atau beberapa berkas ke sini, atau klik untuk memilih';
}

if(shopeeDropzone && shopeeFileInput){
  shopeeDropzone.addEventListener('click', function(){ shopeeFileInput.click(); });
  shopeeDropzone.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); shopeeFileInput.click(); } });
  ['dragenter','dragover'].forEach(function(evt){ shopeeDropzone.addEventListener(evt, function(e){ e.preventDefault(); shopeeDropzone.classList.add('drag'); }); });
  ['dragleave','drop'].forEach(function(evt){ shopeeDropzone.addEventListener(evt, function(e){ e.preventDefault(); shopeeDropzone.classList.remove('drag'); }); });
  shopeeDropzone.addEventListener('drop', function(e){ if(e.dataTransfer && e.dataTransfer.files) processShopeeFiles(e.dataTransfer.files); });
  shopeeFileInput.addEventListener('change', function(e){ processShopeeFiles(e.target.files); });
}

function removeShopeeFile(fileName){
  state.shopee.files = state.shopee.files.filter(function(f){ return f.name !== fileName; });
  // Cari tahu jenis mana yang masih punya berkas tersisa; jika tidak ada, kosongkan jenis itu.
  ['sales','product','traffic','chat','shopstats'].forEach(function(type){
    var stillHas = state.shopee.files.some(function(f){ return f.type === type; });
    if(!stillHas) state.shopee[type] = null;
  });
  saveShopeeToStorage();
  renderShopeeMenu();
}

function clearAllShopeeData(){
  showConfirmModal({
    title: 'Hapus semua data Laporan Shopee?', danger: true, confirmText: 'Hapus semua',
    desc: 'Seluruh berkas yang sudah diunggah pada menu ini akan dihapus dari peramban Anda. Berkas asli di komputer Anda tidak terpengaruh.'
  }).then(function(ok){
    if(!ok) return;
    state.shopee = { sales:null, product:null, traffic:null, chat:null, shopstats:null, files:[] };
    saveShopeeToStorage();
    renderShopeeMenu();
  });
}
var btnShopeeClear = document.getElementById('btnShopeeClearAll');
if(btnShopeeClear) btnShopeeClear.addEventListener('click', clearAllShopeeData);

/* ---------- Tab internal ---------- */
var SHOPEE_TABS = ['ringkasan','penjualan','produk','traffic','chat','bulanan'];
var shopeeTabsEl = document.getElementById('shopeeTabs');
if(shopeeTabsEl){
  shopeeTabsEl.addEventListener('click', function(e){
    var btn = e.target.closest('button');
    if(!btn) return;
    state.shopeeTab = btn.getAttribute('data-tab');
    renderShopeeMenu();
  });
}

/* ---------- Funnel horizontal (HTML/CSS, bukan canvas) ---------- */
// stages: [{label, value, sub}]. Lebar tiap batang relatif terhadap tahap pertama; badge %
// menunjukkan persentase terhadap tahap SEBELUMNYA (tingkat lanjut), bukan terhadap tahap pertama.
function funnelHtml(stages, fmt){
  fmt = fmt || fmtIntId;
  var base = stages.length ? (stages[0].value || 0) : 0;
  return '<div class="funnel">' + stages.map(function(st, i){
    var widthPct = base > 0 ? Math.max(4, (st.value / base) * 100) : 0;
    var ofPrev = (i > 0 && stages[i-1].value > 0) ? (st.value / stages[i-1].value * 100) : null;
    return '<div class="funnel-row">' +
      '<div class="funnel-label">' + escapeHtml(st.label) + (st.sub ? '<span class="funnel-sub">' + escapeHtml(st.sub) + '</span>' : '') + '</div>' +
      '<div class="funnel-track"><div class="funnel-bar" style="width:' + widthPct.toFixed(1) + '%"><span>' + fmt(st.value) + '</span></div></div>' +
      '<div class="funnel-pct">' + (ofPrev===null ? '' : fmtPctVal(ofPrev, 1) + ' dari tahap sebelumnya') + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

/* ---------- Grafik garis harian generik (dipakai beberapa tab) ---------- */
function shopeeLineChart(canvasId, chartKey, labels, series, opts){
  var canvasEl = document.getElementById(canvasId);
  if(!canvasEl) return;
  opts = opts || {};
  var css = getComputedStyle(document.documentElement);
  var palette = [css.getPropertyValue('--chart-line').trim(), css.getPropertyValue('--blue').trim(), css.getPropertyValue('--chart-forecast').trim(), css.getPropertyValue('--brick').trim()];
  var ctx = canvasEl.getContext('2d');
  if(charts[chartKey]) charts[chartKey].destroy();
  charts[chartKey] = new Chart(ctx, {
    type: opts.type || 'line',
    data: {
      labels: labels.map(fmtDayShort),
      datasets: series.map(function(s, i){
        return {
          label: s.name, data: s.values, borderColor: palette[i % palette.length],
          backgroundColor: s.fill ? palette[i % palette.length].replace('rgb', 'rgba') : palette[i % palette.length],
          fill: !!s.fill, tension: 0.3, pointRadius: 0, borderWidth: 2.2,
          yAxisID: s.axis || 'y', type: s.type || opts.type || 'line', order: i
        };
      })
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: series.length > 1, position: 'bottom', labels: { color: css.getPropertyValue('--ink-muted').trim(), boxWidth: 10, font: { size: 11.5 } } },
        tooltip: { callbacks: { label: function(c){ return c.dataset.label + ': ' + (opts.tooltipFmt ? opts.tooltipFmt(c.dataset.label, c.parsed.y) : fmtIntId(c.parsed.y)); } } }
      },
      scales: Object.assign({
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10, color: css.getPropertyValue('--ink-muted').trim() } },
        y: { grid: { color: css.getPropertyValue('--chart-grid').trim() }, ticks: { color: css.getPropertyValue('--ink-muted').trim() } }
      }, opts.y2 ? { y2: { position: 'right', grid: { display: false }, ticks: { color: css.getPropertyValue('--ink-muted').trim() } } } : {})
    }
  });
}

/* ================= Ringkasan ================= */
function renderShopeeRingkasan(){
  var wrap = document.getElementById('shopeeRingkasanWrap');
  if(!wrap) return;
  var sh = state.shopee;
  var have = ['sales','product','traffic','chat','shopstats'].filter(function(t){ return sh[t]; });

  var statusHtml = ['sales','product','traffic','chat','shopstats'].map(function(t){
    var on = !!sh[t];
    var range = '';
    if(on){
      if(t === 'sales' || t === 'product') range = dateRangeLabel(sh[t].daily);
      else if(t === 'traffic') range = dateRangeLabel(sh[t].sources.semua ? sh[t].sources.semua.daily : []);
      else if(t === 'chat') range = dateRangeLabel(sh[t].daily);
      else if(t === 'shopstats') range = sh[t].stages.dibuat ? (fmtDayShort(sh[t].stages.dibuat.monthly[0].date) + ' – ' + fmtDayShort(sh[t].stages.dibuat.monthly[sh[t].stages.dibuat.monthly.length-1].date)) : '';
    }
    return '<div class="shopee-status-chip ' + (on?'on':'off') + '"><span class="dot"></span>' + SHOPEE_TYPE_LABEL[t] + (on ? '<span class="range">' + escapeHtml(range) + '</span>' : '<span class="range">belum diunggah</span>') + '</div>';
  }).join('');
  var statusEl = document.getElementById('shopeeStatusChips');
  if(statusEl) statusEl.innerHTML = statusHtml;

  if(!have.length){
    wrap.innerHTML = '<div class="state-empty">Unggah salah satu berkas laporan Shopee di atas untuk mulai melihat ringkasan.</div>';
    var cardsElEmpty = document.getElementById('shopeeRingkasanCards');
    if(cardsElEmpty) cardsElEmpty.innerHTML = '';
    return;
  }

  var cards = [];
  if(sh.traffic && sh.traffic.sources.semua && sh.traffic.sources.semua.summary){
    cards.push({ label: 'Total Pengunjung', value: fmtIntId(sh.traffic.sources.semua.summary.visitors), delta: dateRangeLabel(sh.traffic.sources.semua.daily) });
  }
  if(sh.sales && sh.sales.summary){
    cards.push({ label: 'Total Pembeli (Pesanan Dibuat)', value: fmtIntId(sh.sales.summary.buyersCreated), delta: 'Konversi ' + fmtPctVal(sh.sales.summary.convCreated, 2) });
    cards.push({ label: 'Total Penjualan (Pesanan Dibuat)', value: idr(sh.sales.summary.salesCreated), delta: 'Rp/pembeli ' + idr(sh.sales.summary.salesPerBuyer) });
  }
  if(sh.chat && sh.chat.summary){
    cards.push({ label: 'Jumlah Chat', value: fmtIntId(sh.chat.summary.chatCount), delta: (sh.chat.summary.chatUnreplied ? sh.chat.summary.chatUnreplied + ' belum dibalas' : 'semua sudah dibalas') });
  }
  if(sh.shopstats && sh.shopstats.stages.dibuat){
    var m = sh.shopstats.stages.dibuat.summary;
    if(m) cards.push({ label: 'Penjualan 8 Bulan Terakhir (Dibuat)', value: idr(m.sales), delta: fmtIntId(m.orders) + ' pesanan' });
  }
  var cardsEl = document.getElementById('shopeeRingkasanCards');
  if(cardsEl) cardsEl.innerHTML = cards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');

  var paras = [];
  if(sh.sales && sh.sales.summary){
    paras.push('Pada periode <b>' + escapeHtml(dateRangeLabel(sh.sales.daily)) + '</b>, toko mencatat <b>' + fmtIntId(sh.sales.summary.visitors) + '</b> kunjungan dengan <b>' + fmtIntId(sh.sales.summary.buyersCreated) + '</b> pembeli (konversi <b>' + fmtPctVal(sh.sales.summary.convCreated,2) + '</b>) dan total penjualan <b>' + idr(sh.sales.summary.salesCreated) + '</b>. Dari pesanan yang dibuat, <b>' + fmtPctVal(sh.sales.summary.convReadyOverCreated,2) + '</b> berlanjut ke status siap dikirim.');
  }
  if(sh.product && sh.product.daily.length){
    var totLikes = sumField(sh.product.daily,'likes'), totCart = sumField(sh.product.daily,'cartProducts'), avgCartConv = avgField(sh.product.daily,'cartConvRate');
    paras.push('Dari sisi produk, total <b>' + fmtIntId(totLikes) + '</b> suka dan <b>' + fmtIntId(totCart) + '</b> produk dimasukkan ke keranjang, dengan rata-rata tingkat konversi ke keranjang <b>' + fmtPctVal(avgCartConv,2) + '</b> per hari.');
  }
  if(sh.traffic && sh.traffic.sources.semua){
    var allV = sumField(sh.traffic.sources.semua.daily,'visitors'), appV = sh.traffic.sources.aplikasi ? sumField(sh.traffic.sources.aplikasi.daily,'visitors') : 0;
    var appShare = allV>0 ? appV/allV*100 : null;
    if(appShare!==null) paras.push('Sumber traffic didominasi <b>Aplikasi Shopee</b> (' + fmtPctVal(appShare,1) + ' dari total pengunjung), sehingga strategi promosi sebaiknya diprioritaskan untuk pengalaman di aplikasi.');
  }
  if(sh.chat && sh.chat.summary){
    paras.push('Layanan chat merespons <b>' + fmtPctVal((sh.chat.summary.chatCount>0? sh.chat.summary.chatReplied/sh.chat.summary.chatCount*100:null),1) + '</b> dari seluruh chat masuk, dengan waktu respon rata-rata <b>' + fmtDuration(sh.chat.summary.avgResponseTime) + '</b>' + (sh.chat.unreplied && sh.chat.unreplied.rows.length ? ('; masih ada <b>' + sh.chat.unreplied.rows.length + '</b> chat yang perlu direspon (lihat tab Chat &amp; Layanan).') : '.'));
  }
  if(sh.shopstats && sh.shopstats.stages.dibuat && sh.shopstats.stages.dibayar){
    var totCreated = sumField(sh.shopstats.stages.dibuat.monthly,'orders'), totPaid = sumField(sh.shopstats.stages.dibayar.monthly,'orders');
    var totCancel = sumField(sh.shopstats.stages.dibuat.monthly,'ordersCancelled');
    paras.push('Dalam rentang bulanan yang tersedia, dari <b>' + fmtIntId(totCreated) + '</b> pesanan dibuat, <b>' + fmtIntId(totPaid) + '</b> berhasil dibayar dan <b>' + fmtIntId(totCancel) + '</b> dibatalkan (' + fmtPctVal(totCreated>0?totCancel/totCreated*100:null,1) + ' dari pesanan dibuat).');
  }
  wrap.innerHTML = paras.length ? paras.map(function(p){ return '<p>'+p+'</p>'; }).join('') : '<div class="state-empty">Unggah lebih banyak jenis laporan untuk ringkasan yang lebih lengkap.</div>';
}

/* ================= Penjualan ================= */
function renderShopeePenjualan(){
  var wrap = document.getElementById('shopeePenjualanBody');
  var empty = document.getElementById('shopeePenjualanEmpty');
  if(!wrap) return;
  var d = state.shopee.sales;
  if(!d){ wrap.style.display='none'; if(empty) empty.style.display=''; return; }
  wrap.style.display=''; if(empty) empty.style.display='none';

  var cards = [
    { label:'Total Pengunjung', value: fmtIntId(d.summary.visitors), delta: dateRangeLabel(d.daily) },
    { label:'Pembeli (Pesanan Dibuat)', value: fmtIntId(d.summary.buyersCreated), delta: 'Konversi ' + fmtPctVal(d.summary.convCreated,2) },
    { label:'Penjualan (Pesanan Dibuat)', value: idr(d.summary.salesCreated), delta: 'Rp/pembeli ' + idr(d.summary.salesPerBuyer) },
    { label:'Pesanan Siap Dikirim', value: fmtIntId(d.summary.buyersReady) + ' pembeli', delta: idr(d.summary.salesReady) + ' · ' + fmtPctVal(d.summary.convReadyOverCreated,2) + ' dari dibuat' }
  ];
  document.getElementById('shopeeSalesCards').innerHTML = cards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');

  shopeeLineChart('shopeeSalesChart', 'shopeeSales',
    d.daily.map(function(r){ return r.date; }),
    [
      { name: 'Pengunjung', values: d.daily.map(function(r){ return r.visitors; }) },
      { name: 'Pembeli (Dibuat)', values: d.daily.map(function(r){ return r.buyersCreated; }) },
      { name: 'Penjualan (Rp)', values: d.daily.map(function(r){ return r.salesCreated; }), axis: 'y2' }
    ], { y2: true, tooltipFmt: function(label, v){ return label.indexOf('Rp')!==-1 ? idr(v) : fmtIntId(v); } }
  );

  document.getElementById('shopeeSalesFunnel').innerHTML = funnelHtml([
    { label: 'Pesanan Dibuat', value: d.summary.buyersCreated, sub: idr(d.summary.salesCreated) },
    { label: 'Pesanan Siap Dikirim', value: d.summary.buyersReady, sub: idr(d.summary.salesReady) }
  ]);
}

/* ================= Produk & Funnel ================= */
function renderShopeeProduk(){
  var wrap = document.getElementById('shopeeProdukBody');
  var empty = document.getElementById('shopeeProdukEmpty');
  if(!wrap) return;
  var d = state.shopee.product;
  if(!d || !d.daily.length){ wrap.style.display='none'; if(empty) empty.style.display=''; return; }
  wrap.style.display=''; if(empty) empty.style.display='none';
  var rows = d.daily;

  var totVisitors = sumField(rows,'productVisitors'), totNoBuy = sumField(rows,'viewersNoBuy'), totCart = sumField(rows,'cartProducts'),
      totBuyers = sumField(rows,'buyersCreated'), totReady = sumField(rows,'buyersReady'), totLikes = sumField(rows,'likes'), totSearch = sumField(rows,'searchClicks');

  var cards = [
    { label:'Pengunjung Produk', value: fmtIntId(totVisitors), delta: dateRangeLabel(rows) },
    { label:'Suka', value: fmtIntId(totLikes), delta: 'Klik pencarian: ' + fmtIntId(totSearch) },
    { label:'Ditambahkan ke Keranjang', value: fmtIntId(totCart), delta: 'Rata-rata konversi ' + fmtPctVal(avgField(rows,'cartConvRate'),2) },
    { label:'Rata-rata Lihat Tanpa Beli', value: fmtPctVal(avgField(rows,'viewNoBuyRate'),2), delta: 'per hari' }
  ];
  document.getElementById('shopeeProductCards').innerHTML = cards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');

  document.getElementById('shopeeProductFunnel').innerHTML = funnelHtml([
    { label: 'Pengunjung Produk', value: totVisitors },
    { label: 'Ditambahkan ke Keranjang', value: totCart },
    { label: 'Pesanan Dibuat', value: totBuyers },
    { label: 'Pesanan Siap Dikirim', value: totReady }
  ]);

  shopeeLineChart('shopeeProductChart', 'shopeeProduct',
    rows.map(function(r){ return r.date; }),
    [
      { name: 'Halaman Dilihat', values: rows.map(function(r){ return r.pageViews; }) },
      { name: 'Ditambahkan ke Keranjang', values: rows.map(function(r){ return r.cartProducts; }) },
      { name: 'Pembeli (Dibuat)', values: rows.map(function(r){ return r.buyersCreated; }) }
    ]
  );
}

/* ================= Traffic ================= */
function renderShopeeTraffic(){
  var wrap = document.getElementById('shopeeTrafficBody');
  var empty = document.getElementById('shopeeTrafficEmpty');
  if(!wrap) return;
  var d = state.shopee.traffic;
  if(!d || !d.sources.semua){ wrap.style.display='none'; if(empty) empty.style.display=''; return; }
  wrap.style.display=''; if(empty) empty.style.display='none';
  var all = d.sources.semua.daily;

  var totV = sumField(all,'visitors'), totNew = sumField(all,'newVisitors'), totOld = sumField(all,'oldVisitors'), totFollow = sumField(all,'newFollowers');
  var cards = [
    { label:'Total Pengunjung', value: fmtIntId(totV), delta: dateRangeLabel(all) },
    { label:'Pengunjung Baru', value: fmtIntId(totNew), delta: fmtPctVal(totV>0?totNew/totV*100:null,1) + ' dari total' },
    { label:'Pengunjung Lama', value: fmtIntId(totOld), delta: fmtPctVal(totV>0?totOld/totV*100:null,1) + ' dari total' },
    { label:'Pengikut Baru', value: fmtIntId(totFollow), delta: 'Rata-rata waktu ' + fmtDuration(avgField(all,'avgTimeSpent')) }
  ];
  document.getElementById('shopeeTrafficCards').innerHTML = cards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');

  shopeeLineChart('shopeeTrafficChart', 'shopeeTraffic',
    all.map(function(r){ return r.date; }),
    [
      { name: 'Pengunjung Baru', values: all.map(function(r){ return r.newVisitors; }), type:'bar', fill:true },
      { name: 'Pengunjung Lama', values: all.map(function(r){ return r.oldVisitors; }), type:'bar', fill:true }
    ], { type: 'bar' }
  );

  var sourceRows = ['semua','situs','aplikasi'].filter(function(k){ return d.sources[k]; }).map(function(k){
    var s = d.sources[k].daily; var v = sumField(s,'visitors');
    return { key:k, label: d.sources[k].label, visitors: v, views: sumField(s,'productViews'), avgTime: avgField(s,'avgTimeSpent') };
  });
  var maxV = Math.max.apply(null, sourceRows.map(function(r){ return r.visitors; }).concat([1]));
  document.getElementById('shopeeTrafficSources').innerHTML = sourceRows.map(function(r){
    var pct = maxV>0 ? r.visitors/maxV*100 : 0;
    return '<div class="funnel-row"><div class="funnel-label">'+escapeHtml(r.label)+'<span class="funnel-sub">'+fmtIntId(r.views)+' produk dilihat · rata-rata '+fmtDuration(r.avgTime)+'</span></div>' +
      '<div class="funnel-track"><div class="funnel-bar src-'+r.key+'" style="width:'+Math.max(4,pct).toFixed(1)+'%"><span>'+fmtIntId(r.visitors)+'</span></div></div><div class="funnel-pct"></div></div>';
  }).join('');
}

/* ================= Chat & Layanan ================= */
function genericTableHtml(table, opts){
  opts = opts || {};
  if(!table || !table.rows.length) return '<div class="state-empty">' + (opts.emptyMsg || 'Tidak ada data.') + '</div>';
  var rows = opts.rowTransform ? table.rows.map(opts.rowTransform) : table.rows;
  return '<div class="table-scroll"><table><thead><tr>' + table.header.map(function(h){ return '<th>'+escapeHtml(h)+'</th>'; }).join('') + '</tr></thead><tbody>' +
    rows.map(function(r){ return '<tr>' + r.map(function(c){ return '<td>'+escapeHtml(c)+'</td>'; }).join('') + '</tr>'; }).join('') +
    '</tbody></table></div>';
}

function renderShopeeChat(){
  var wrap = document.getElementById('shopeeChatBody');
  var empty = document.getElementById('shopeeChatEmpty');
  if(!wrap) return;
  var d = state.shopee.chat;
  if(!d){ wrap.style.display='none'; if(empty) empty.style.display=''; return; }
  wrap.style.display=''; if(empty) empty.style.display='none';

  var s = d.summary;
  var cards = s ? [
    { label:'Jumlah Chat', value: fmtIntId(s.chatCount), delta: dateRangeLabel(d.daily) },
    { label:'Chat Dibalas', value: fmtIntId(s.chatReplied), delta: (s.chatUnreplied? s.chatUnreplied + ' belum dibalas' : 'semua sudah dibalas') },
    { label:'Waktu Respon Rata-rata', value: fmtDuration(s.avgResponseTime), delta: 'Respon pertama: ' + fmtDuration(s.firstResponseTime) },
    { label:'CSAT', value: (s.csat===null?'Belum ada penilaian':fmtPctVal(s.csat,1)), delta: 'Konversi chat dibalas ' + fmtPctVal(s.convChatReplied,2) }
  ] : [];
  document.getElementById('shopeeChatCards').innerHTML = cards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');

  if(d.daily.length){
    shopeeLineChart('shopeeChatChart', 'shopeeChat',
      d.daily.map(function(r){ return r.date; }),
      [
        { name: 'Jumlah Chat', values: d.daily.map(function(r){ return r.chatCount; }), type: 'bar' },
        { name: 'Waktu Respon (detik)', values: d.daily.map(function(r){ return r.avgResponseTime; }), axis: 'y2' }
      ], { y2: true, tooltipFmt: function(label, v){ return label.indexOf('Respon')!==-1 ? fmtDuration(v) : fmtIntId(v); } }
    );
  }

  var unrepliedWrap = document.getElementById('shopeeChatUnreplied');
  if(unrepliedWrap){
    var n = d.unreplied && d.unreplied.rows.length || 0;
    unrepliedWrap.innerHTML = '<h4>Chat yang Perlu Direspon' + (n? ' <span class="badge batal">'+n+'</span>' : '') + '</h4>' +
      genericTableHtml(d.unreplied, { emptyMsg: 'Tidak ada chat yang belum dibalas pada periode ini — kerja bagus.' });
  }
  var sendersWrap = document.getElementById('shopeeChatSenders');
  if(sendersWrap){
    sendersWrap.innerHTML = '<h4>Riwayat Percakapan per Pengirim (' + (d.senders? d.senders.rows.length:0) + ')</h4>' +
      genericTableHtml(d.senders, { emptyMsg: 'Tidak ada data pengirim.' });
  }
}

/* ================= Performa Bulanan (Shop Stats) ================= */
function renderShopeeBulanan(){
  var wrap = document.getElementById('shopeeBulananBody');
  var empty = document.getElementById('shopeeBulananEmpty');
  if(!wrap) return;
  var d = state.shopee.shopstats;
  if(!d || !d.stages.dibuat){ wrap.style.display='none'; if(empty) empty.style.display=''; return; }
  wrap.style.display=''; if(empty) empty.style.display='none';

  var created = d.stages.dibuat.monthly, ready = d.stages.siapDikirim ? d.stages.siapDikirim.monthly : [], paid = d.stages.dibayar ? d.stages.dibayar.monthly : [];
  var totCreated = sumField(created,'orders'), totPaid = sumField(paid,'orders'), totCancel = sumField(created,'ordersCancelled'), totReturn = sumField(created,'ordersReturned');
  var cards = [
    { label:'Total Pesanan Dibuat', value: fmtIntId(totCreated), delta: fmtDayShort(created[0].date) + ' – ' + fmtDayShort(created[created.length-1].date) },
    { label:'Total Pesanan Dibayar', value: fmtIntId(totPaid), delta: fmtPctVal(totCreated>0?totPaid/totCreated*100:null,1) + ' dari dibuat' },
    { label:'Pesanan Dibatalkan', value: fmtIntId(totCancel), delta: fmtPctVal(totCreated>0?totCancel/totCreated*100:null,1) + ' dari dibuat' },
    { label:'Pesanan Dikembalikan', value: fmtIntId(totReturn), delta: fmtPctVal(totCreated>0?totReturn/totCreated*100:null,2) + ' dari dibuat' }
  ];
  document.getElementById('shopeeStatsCards').innerHTML = cards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');

  var byKey = function(arr,key){ var m={}; arr.forEach(function(r){ m[r.date]=r[key]; }); return created.map(function(r){ return m[r.date]===undefined?0:m[r.date]; }); };
  var css = getComputedStyle(document.documentElement);
  shopeeLineChart('shopeeStatsChart', 'shopeeStats',
    created.map(function(r){ return r.date; }),
    [
      { name: 'Pesanan Dibuat', values: created.map(function(r){ return r.orders; }), type:'bar' },
      { name: 'Pesanan Siap Dikirim', values: byKey(ready,'orders'), type:'bar' },
      { name: 'Pesanan Dibayar', values: byKey(paid,'orders'), type:'bar' }
    ], { type:'bar' }
  );

  document.getElementById('shopeeStatsFunnel').innerHTML = funnelHtml([
    { label:'Pesanan Dibuat', value: totCreated, sub: idr(sumField(created,'sales')) },
    { label:'Pesanan Siap Dikirim', value: sumField(ready,'orders'), sub: idr(sumField(ready,'sales')) },
    { label:'Pesanan Dibayar', value: totPaid, sub: idr(sumField(paid,'sales')) }
  ]);

  var rowsHtml = created.map(function(r, i){
    return '<tr><td>' + fmtDayShort(r.date).replace(/^\d+\s/,'') + '</td><td class="tabular">' + fmtIntId(r.orders) + '</td><td class="tabular">' + idr(r.sales) + '</td>' +
      '<td class="tabular">' + fmtIntId(r.ordersCancelled) + '</td><td class="tabular">' + fmtPctVal(r.orders>0?r.ordersCancelled/r.orders*100:null,1) + '</td>' +
      '<td class="tabular">' + fmtPctVal(r.convRate,2) + '</td></tr>';
  }).join('');
  var tableEl = document.getElementById('shopeeStatsTable');
  if(tableEl) tableEl.innerHTML = '<div class="table-scroll"><table><thead><tr><th>Bulan</th><th>Pesanan Dibuat</th><th>Penjualan</th><th>Dibatalkan</th><th>% Dibatalkan</th><th>Konversi</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
}

/* ================= Orkestrasi ================= */
function renderShopeeFileList(){
  var el = document.getElementById('shopeeFileList');
  if(!el) return;
  var files = state.shopee.files;
  if(!files.length){ el.innerHTML = ''; return; }
  el.innerHTML = files.map(function(f){
    return '<div class="shopee-file-chip"><span class="badge other">' + escapeHtml(f.label || f.type) + '</span>' +
      '<span class="name">' + escapeHtml(f.name) + '</span>' +
      '<button type="button" class="chip-remove" data-remove="' + escapeHtml(f.name) + '" aria-label="Hapus ' + escapeHtml(f.name) + '">✕</button></div>';
  }).join('');
  Array.prototype.slice.call(el.querySelectorAll('[data-remove]')).forEach(function(btn){
    btn.addEventListener('click', function(){ removeShopeeFile(btn.getAttribute('data-remove')); });
  });
}

function renderShopeeMenu(){
  if(!document.getElementById('view-shopee')) return;
  renderShopeeFileList();
  if(shopeeTabsEl) Array.from(shopeeTabsEl.children).forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === state.shopeeTab); });
  Array.prototype.slice.call(document.querySelectorAll('.shopee-tab-panel')).forEach(function(p){
    p.classList.toggle('active', p.getAttribute('data-tab-panel') === state.shopeeTab);
  });
  renderShopeeRingkasan();
  renderShopeePenjualan();
  renderShopeeProduk();
  renderShopeeTraffic();
  renderShopeeChat();
  renderShopeeBulanan();
}

renderShopeeMenu();
