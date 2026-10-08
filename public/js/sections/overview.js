"use strict";

/* ---------------- Rendering ---------------- */
function render(){
  applyFilters();
  renderKPIs();
  renderForecast();
  renderSalesAnalysis();
  renderProductAnalytics();
  renderNetIncome();
  renderTable();
  renderPreprocessingOverview();
  renderCustomerAnalytics();
  renderCustomerSegmentation();
  renderModelEvaluation();
  renderMarketBasketAnalysis();
  renderIntelligentInsight();
  renderBusinessRecommendation();
  renderExecutiveSummary();
  if(typeof syncReportButtons === 'function') syncReportButtons();
}

function renderPreprocessingOverview(){
  var sumEl = document.getElementById('preSummary');
  var stepsEl = document.getElementById('preSteps');
  if(!sumEl || !stepsEl) return;
  var p = state.preprocessing;
  if(!p){
    sumEl.innerHTML = '';
    stepsEl.innerHTML = '<div class="state-empty">Belum ada data yang dimuat.</div>';
    return;
  }
  var cards = [
    { label:'Baris mentah dari berkas', value: p.totalRawRows.toLocaleString('id-ID'), delta:'sebelum validasi' },
    { label:'Baris tidak valid dihapus', value: p.missingDateDropped.toLocaleString('id-ID'), delta:'tanggal pesanan kosong/tidak terbaca' },
    { label:'Duplikat dihapus', value: p.duplicatesRemoved.toLocaleString('id-ID'), delta:'baris identik pada seluruh kolom kunci' },
    { label:'Baris valid dipakai', value: p.validRows.toLocaleString('id-ID'), delta:'dipakai pada seluruh analisis di dasbor ini' }
  ];
  sumEl.innerHTML = cards.map(function(c){
    return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>';
  }).join('');

  var steps = [];
  steps.push({ b:'1. Deteksi & pemetaan kolom', t: p.restored
    ? 'Data ini dimuat dari database Neon (hasil unggahan sebelumnya yang sudah melalui pemetaan kolom dan validasi).'
    : (p.colMap
      ? 'Kolom pada berkas dipetakan otomatis ke skema internal berdasarkan nama header: ' + Object.keys(p.colMap).map(function(k){ return FIELD_LABELS[k] + ' (dari "' + p.colMap[k] + '")'; }).join(', ') + '.'
      : 'Data contoh bawaan sudah terstruktur sesuai skema internal, sehingga tidak memerlukan pemetaan kolom.') });
  steps.push({ b:'2. Konversi tipe data', t: 'Kolom Harga, Jumlah, Subtotal Pesanan, dan Total Pembayaran dikonversi dari teks menjadi angka (mendukung format ribuan Indonesia, mis. "30.000"). Kolom tanggal dikonversi menjadi objek tanggal (Date) untuk perhitungan Recency dan tren waktu.' });
  steps.push({ b:'3. Validasi & pembersihan baris tidak valid', t: p.missingDateDropped + ' dari ' + p.totalRawRows + ' baris mentah dihapus karena tanggal pesanan kosong atau tidak dapat dibaca sebagai tanggal yang valid.' });
  steps.push({ b:'4. Penanganan duplikat', t: p.duplicatesRemoved > 0
    ? p.duplicatesRemoved + ' baris duplikat (identik pada No. Pesanan, Produk, Variasi, Harga, Jumlah, Subtotal, Total Pembayaran, dan Tanggal) dihapus agar tidak dihitung ganda.'
    : 'Tidak ditemukan baris duplikat persis pada data ini.' });
  steps.push({ b:'5. Filtering transaksi', t: 'Perhitungan pendapatan, RFM, dan forecasting memakai transaksi berstatus "Selesai" secara default; status lain seperti "Sedang Dikirim" atau "Belum Bayar" tidak dihitung, dan definisi ini sama di semua menu. Jika tidak ada transaksi selesai pada filter aktif, transaksi yang tidak batal dipakai sebagai fallback agar dasbor tetap menampilkan data apa adanya.' });
  steps.push({ b:'6. Standardisasi sebelum K-Means', t: 'Nilai Recency, Frequency, dan Monetary distandardisasi (z-score) sebelum dipakai K-Means, agar skala Monetary yang jauh lebih besar tidak mendominasi perhitungan jarak antar pelanggan.' });
  stepsEl.innerHTML = steps.map(function(s){
    return '<div class="pre-step"><span class="dot"></span><div><b>'+escapeHtml(s.b)+'</b><br><span class="muted-txt">'+escapeHtml(s.t)+'</span></div></div>';
  }).join('');
}

// Tampilan KPI + ringkasan kini ada di sections/dashboard.js (renderDashboardHome).
function renderKPIs(){ renderDashboardHome(); }

function groupByDay(orders){
  var byDay = {};
  orders.forEach(function(o){
    var d = toDate(o.created_at);
    if(!d) return;
    var k = dayKey(d);
    byDay[k] = (byDay[k] || 0) + o.total_payment;
  });
  return byDay;
}

/* ---------------- Forecasting (level terbaru x pola hari dalam seminggu) ----------------
   Mesin hitungnya ada di core/forecast.js (murni, tanpa DOM). Bagian ini hanya mengambil data dari
   filter yang aktif, lalu menampilkan hasilnya. Metrik: 'revenue' (Rp), 'orders' (pesanan), 'kg'. */
function getForecastPlan(metric, horizon){
  var series = buildForecastSeries(state.filtered, metric || 'revenue');
  return planForecast(series, horizon || state.horizon);
}

// Dipakai Insight & Ringkasan Eksekutif: selalu pendapatan. Properti yang dibaca pemanggil lama
// (reg.slope, avgDaily, actualDays, hasEnoughData) tetap ada.
function getForecastModel(){
  return getForecastPlan('revenue', state.horizon).model;
}

function forecastAxisTick(metric, v){
  return metric === 'revenue' ? idrShort(v) : v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}

function renderRevenueChart(canvasId, chartKey, plan){
  canvasId = canvasId || 'revenueChart';
  chartKey = chartKey || 'revenue';
  var canvasEl = document.getElementById(canvasId);
  if(!canvasEl) return;
  plan = plan || getForecastPlan('revenue', state.horizon);
  var metric = plan.metric;
  var series = plan.series;
  var labels = series.labels.slice();
  // Hari data hilang digambar sebagai celah (null), bukan sebagai penjualan Rp0.
  var actual = series.values.map(function(v, i){ return series.missing[i] ? null : v; });
  var n = actual.length;
  var forecastLine = new Array(n).fill(null);
  var forecastUpper = new Array(n).fill(null);
  var forecastLower = new Array(n).fill(null);
  var forecastBoundaryIndex = n - 1;
  var willForecast = plan.hasEnoughData && n > 0;

  if(willForecast){
    forecastLine[n-1] = actual[n-1];
    forecastUpper[n-1] = plan.band ? actual[n-1] : null;
    forecastLower[n-1] = plan.band ? actual[n-1] : null;
    plan.future.forEach(function(f){
      labels.push(f.label);
      forecastLine.push(f.pred);
      forecastUpper.push(f.upper);   // null bila galat backtest belum cukup untuk menghitung pita
      forecastLower.push(f.lower);
    });
  }

  var ctx = canvasEl.getContext('2d');
  if(charts[chartKey]) charts[chartKey].destroy();
  var css = getComputedStyle(document.documentElement);
  var dividerColor = css.getPropertyValue('--ink-muted').trim();
  charts[chartKey] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(fmtDayShort),
      datasets: [
        {
          label: 'Aktual', data: actual, borderColor: css.getPropertyValue('--chart-line').trim(),
          backgroundColor: css.getPropertyValue('--chart-line-soft').trim(), fill: true, tension: 0.3,
          pointRadius: 0, borderWidth: 2.4, spanGaps: false
        },
        {
          label: 'Batas atas', data: forecastUpper, borderColor: 'transparent',
          backgroundColor: css.getPropertyValue('--chart-forecast-soft').trim(), fill: '+1',
          pointRadius: 0, tension: 0.3, borderWidth: 0
        },
        {
          label: 'Batas bawah', data: forecastLower, borderColor: 'transparent',
          backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.3, borderWidth: 0
        },
        {
          label: 'Proyeksi', data: forecastLine, borderColor: css.getPropertyValue('--chart-forecast').trim(),
          borderDash: [6,4], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2.2
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: {mode:'index', intersect:false},
      plugins: {
        legend: {display:false},
        tooltip: {
          callbacks: {
            label: function(c){
              if(c.dataset.label==='Batas atas' || c.dataset.label==='Batas bawah') return null;
              if(c.parsed.y === null) return null;
              return c.dataset.label + ': ' + fmtForecastValue(c.parsed.y, metric);
            },
            afterLabel: function(c){
              if(c.dataset.label !== 'Proyeksi' || c.dataIndex < n) return null;
              var up = forecastUpper[c.dataIndex], lo = forecastLower[c.dataIndex];
              if(up === null || lo === null || up === undefined || lo === undefined) return null;
              return 'Rentang 80%: ' + fmtForecastValue(lo, metric) + ' – ' + fmtForecastValue(up, metric);
            }
          },
          filter: function(item){ return item.dataset.label !== 'Batas atas' && item.dataset.label !== 'Batas bawah'; }
        }
      },
      scales: {
        x: {grid:{display:false}, ticks:{maxRotation:0, autoSkip:true, maxTicksLimit:10, color: css.getPropertyValue('--ink-muted').trim()}},
        y: {grid:{color: css.getPropertyValue('--chart-grid').trim()}, ticks:{callback:function(v){ return forecastAxisTick(metric, v); }, color: css.getPropertyValue('--ink-muted').trim()}}
      }
    },
    plugins: [{
      id: 'forecastDivider',
      afterDraw: function(chart){
        if(!willForecast || forecastBoundaryIndex < 0) return;
        var xScale = chart.scales.x;
        var yScale = chart.scales.y;
        if(!xScale || !yScale) return;
        var xPos = xScale.getPixelForValue(forecastBoundaryIndex);
        var c = chart.ctx;
        c.save();
        c.beginPath();
        c.setLineDash([3,3]);
        c.moveTo(xPos, yScale.top);
        c.lineTo(xPos, yScale.bottom);
        c.lineWidth = 1;
        c.strokeStyle = dividerColor;
        c.globalAlpha = 0.55;
        c.stroke();
        c.restore();
      }
    }]
  });
}

/* ---------------- Evaluasi forecasting (backtest bergulir: MAE / RMSE / WAPE) ---------------- */
var EVAL_LOW_POINTS = 20;   // di bawah ini, perbandingan dengan rata-rata biasa diberi catatan "belum stabil"

function compareVerdict(imp){
  if(imp === null || imp === undefined) return { cls: '', text: 'Pembanding tidak dapat dihitung', short: '—' };
  if(imp > 0.05) return { cls: 'pos', text: 'Model lebih baik ' + fmtPct(imp) + ' dari rata-rata biasa', short: '▲ lebih baik ' + fmtPct(imp) };
  if(imp < -0.05) return { cls: 'neg', text: 'Model lebih buruk ' + fmtPct(Math.abs(imp)) + ' dari rata-rata biasa', short: '▼ lebih buruk ' + fmtPct(Math.abs(imp)) };
  return { cls: '', text: 'Model setara dengan rata-rata biasa', short: '≈ setara' };
}

function foldTableHtml(bt){
  var rows = bt.folds.map(function(f, i){
    var v = compareVerdict(f.improvement);
    return '<tr><td>' + (i + 1) + '</td><td>' + fmtDayShort(f.from) + ' – ' + fmtDayShort(f.to) + '</td>' +
      '<td class="tabular">' + f.n + ' / ' + bt.horizon + '</td>' +
      '<td class="tabular">' + fmtPct(f.wape) + '</td><td class="tabular">' + fmtPct(f.baseWape) + '</td>' +
      '<td class="tabular eval-res ' + v.cls + '">' + v.short + '</td></tr>';
  }).join('');
  return '<div class="table-scroll"><table class="eval-folds-table"><thead><tr><th>#</th><th>Periode uji</th><th>Hari dinilai</th><th>WAPE model</th><th>WAPE rata-rata biasa</th><th>Hasil</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderForecastEvaluation(plan){
  var gridEl = document.getElementById('evalGrid');
  var emptyEl = document.getElementById('evalEmpty');
  var noteEl = document.getElementById('evalNote');
  var cmpEl = document.getElementById('evalCompare');
  var foldsEl = document.getElementById('evalFolds');
  var descEl = document.getElementById('evalDesc');
  if(!gridEl) return;

  var bt = plan.backtest;
  var metric = plan.metric;
  var H = plan.horizon;

  if(descEl){
    descEl.textContent = 'Untuk mengukur akurasi, model "pura-pura tidak tahu" data terbaru: ia hanya melihat data sebelum satu titik waktu, memprediksi ' + H + ' hari berikutnya, lalu hasilnya dicocokkan dengan penjualan sebenarnya. Cara ini diulang pada beberapa titik waktu (maksimal ' + FORECAST_CFG.EVAL_MAX_FOLDS + ' terbaru, bergeser ' + FORECAST_CFG.EVAL_STRIDE + ' hari). Sebagai pembanding dipakai "rata-rata biasa", yaitu menebak semua hari sama dengan rata-rata penjualan harian.';
  }
  var scoreEl = document.getElementById('evalScore');
  if(scoreEl){ scoreEl.innerHTML = ''; scoreEl.className = 'fc-score'; }

  if(!bt.ok){
    gridEl.classList.add('muted');
    ['evalMae','evalRmse','evalWape'].forEach(function(id){ var el = document.getElementById(id); if(el) el.textContent = '—'; });
    if(cmpEl){ cmpEl.className = 'eval-compare'; cmpEl.textContent = ''; }
    if(foldsEl) foldsEl.innerHTML = '';
    if(emptyEl){
      emptyEl.classList.add('show');
      emptyEl.textContent = 'Evaluasi belum dapat dilakukan: backtest butuh minimal ' + FORECAST_CFG.EVAL_MIN_TRAIN + ' hari data latih ditambah ' + H + ' hari data uji (total ' + (FORECAST_CFG.EVAL_MIN_TRAIN + H) + ' hari), sedangkan data pada filter ini mencakup ' + plan.series.span + ' hari' + (plan.series.missingDays ? ' (' + plan.series.validDays + ' hari valid)' : '') + '. Coba ubah filter, pilih horizon lebih pendek, atau unggah data dengan rentang tanggal yang lebih panjang.';
    }
    if(noteEl) noteEl.textContent = 'Pita ketidakpastian tidak ditampilkan karena dihitung dari galat backtest, dan backtest belum bisa dijalankan.';
    return;
  }

  gridEl.classList.remove('muted');
  if(emptyEl) emptyEl.classList.remove('show');
  document.getElementById('evalMae').textContent = fmtForecastValue(bt.mae, metric);
  document.getElementById('evalRmse').textContent = fmtForecastValue(bt.rmse, metric);
  document.getElementById('evalWape').textContent = bt.wape === null ? 'Tidak dapat dihitung' : fmtPct(bt.wape);
  if(scoreEl && bt.wape !== null){
    var g = accuracyGrade(bt.wape);
    var acc = Math.max(0, 100 - bt.wape);
    scoreEl.className = 'fc-score show ' + g.cls;
    scoreEl.innerHTML = '<div class="fc-score-num tabular">' + acc.toLocaleString('id-ID', { maximumFractionDigits: 0 }) + '<small>%</small></div>' +
      '<div class="fc-score-body"><div class="fc-score-title">Akurasi ' + escapeHtml(g.label) + '</div>' +
      '<div class="fc-score-desc">' + escapeHtml(g.text) + ' Skor = 100% dikurangi WAPE (' + fmtPct(bt.wape) + '), dinilai pada ' + bt.points + ' hari uji.</div></div>';
  }

  if(cmpEl){
    var v = compareVerdict(bt.improvement);
    cmpEl.className = 'eval-compare show ' + v.cls;
    var detail = bt.baseWape === null ? '' : ' WAPE model ' + fmtPct(bt.wape) + ' vs WAPE rata-rata biasa ' + fmtPct(bt.baseWape) + ' (galat model ' + fmtPct(Math.abs(bt.improvement)) + (bt.improvement >= 0 ? ' lebih kecil' : ' lebih besar') + '), dinilai pada ' + bt.points + ' hari dalam ' + bt.folds.length + ' potongan.';
    var caution = bt.points < EVAL_LOW_POINTS ? ' Hanya ' + bt.points + ' hari yang dinilai, jadi perbandingan ini belum stabil — anggap sebagai indikasi awal.' : '';
    cmpEl.innerHTML = '<b>' + v.text + '.</b>' + escapeHtml(detail) + escapeHtml(caution);
  }
  if(foldsEl) foldsEl.innerHTML = foldTableHtml(bt);

  if(noteEl){
    var bandNote = plan.band
      ? 'Pita ketidakpastian pada grafik = persentil 10–90 dari ' + plan.band.n + ' galat backtest (' + fmtForecastValue(plan.band.lo, metric) + ' sampai +' + fmtForecastValue(plan.band.hi, metric) + ' dari nilai prediksi), bukan dari residu data latih.'
      : 'Pita ketidakpastian tidak ditampilkan: galat backtest baru ' + bt.errors.length + ' titik, sedangkan minimal ' + FORECAST_CFG.BAND_MIN_POINTS + ' titik dibutuhkan.';
    var wapeNote = bt.wape === null ? ' WAPE tidak dapat dihitung karena seluruh aktual pada hari yang dinilai bernilai 0.' : '';
    noteEl.textContent = bandNote + wapeNote;
  }
}

/* ---------------- Ringkasan forecasting (Dashboard Utama & halaman Forecasting) ---------------- */
function forecastConfidence(plan){
  var d = plan.model.validDays;
  if(d >= 56) return 'tinggi';
  if(d >= FORECAST_CFG.WARN_DAYS) return 'sedang';
  return 'rendah — data historis kurang dari 4 minggu';
}

function fillForecastSummary(t, plan){
  var metric = plan.metric;
  var meta = FORECAST_METRICS[metric];
  var model = plan.model;

  if(t.lbl) t.lbl.textContent = meta.totalLbl;
  if(t.warn){
    if(plan.warnings.length){
      t.warn.innerHTML = plan.warnings.map(function(w){ return '<div>⚠ ' + escapeHtml(w) + '</div>'; }).join('');
      t.warn.classList.add('show');
    } else {
      t.warn.innerHTML = '';
      t.warn.classList.remove('show');
    }
  }

  if(!plan.hasEnoughData){
    var emptyMsg = model.actualDays === 0
      ? 'Belum ada data transaksi pada filter yang aktif, sehingga prediksi belum dapat dihitung.'
      : 'Data historis pada filter ini hanya mencakup ' + model.validDays + ' hari valid. Prediksi memerlukan minimal ' + FORECAST_CFG.MIN_DAYS + ' hari data transaksi yang berbeda.';
    if(t.total) t.total.textContent = '—';
    if(t.avg) t.avg.textContent = '—';
    if(t.trend) t.trend.textContent = '—';
    if(t.grid) t.grid.classList.add('muted');
    if(t.empty){ t.empty.classList.add('show'); t.empty.textContent = emptyMsg; }
    if(t.note) t.note.textContent = 'Prediksi nonaktif sementara karena data historis belum mencukupi. Coba ubah filter status/provinsi, atau unggah data dengan rentang tanggal yang lebih panjang.';
    return;
  }

  var total = 0;
  plan.future.forEach(function(f){ total += f.pred; });
  var H = plan.horizon;

  // Arah tren dihitung relatif terhadap rata-rata harian (bukan ambang tetap), dari kemiringan nilai
  // yang sudah dinormalkan pola harinya. Hanya dilaporkan; prediksi TIDAK memperpanjang tren ini.
  var avgDaily = model.avgDaily;
  var relSlope = avgDaily > 0 ? (model.reg.slope / avgDaily) : 0;
  var trendPct = relSlope * 100;
  var trendLabel = relSlope > 0.01 ? '▲ Naik' : (relSlope < -0.01 ? '▼ Turun' : '▬ Stabil');
  var trendTxt = trendLabel + (avgDaily > 0 ? ' (' + (trendPct>=0?'+':'') + trendPct.toFixed(1) + '%/hari)' : '');

  var noteTxt = 'Dihitung dari level terbaru (rata-rata ' + FORECAST_CFG.LEVEL_DAYS + ' hari valid terakhir, sudah dinormalkan) dikali faktor hari dalam seminggu' +
    (model.useDow ? '' : ' — pola hari belum dipakai karena data valid kurang dari ' + FORECAST_CFG.DOW_MIN_DAYS + ' hari') +
    ', untuk ' + H + ' hari ke depan, dari ' + model.validDays + ' hari data valid (' + meta.name + '). Arah tren hanya menggambarkan riwayat data dan tidak diperpanjang ke depan. Tingkat keyakinan: ' + forecastConfidence(plan) + '. Ini perkiraan statistik, bukan jaminan hasil.';

  if(t.grid) t.grid.classList.remove('muted');
  if(t.empty) t.empty.classList.remove('show');
  if(t.total) t.total.textContent = fmtForecastValue(total, metric);
  if(t.avg) t.avg.textContent = fmtForecastValue(total / H, metric);
  if(t.trend) t.trend.textContent = trendTxt;
  if(t.note) t.note.textContent = noteTxt;
}

function syncForecastTabs(plan){
  var hTabs = document.getElementById('horizonTabs');
  if(hTabs) Array.from(hTabs.children).forEach(function(b){
    var h = parseInt(b.getAttribute('data-h'), 10);
    b.classList.toggle('active', h === state.horizon);
    var over = h > plan.cap;
    b.classList.toggle('capped', over);
    b.title = over ? ('Dibatasi menjadi ' + plan.cap + ' hari pada data ini') : '';
  });
  var mTabs = document.getElementById('metricTabs');
  if(mTabs) Array.from(mTabs.children).forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-m') === (state.forecastMetric || 'revenue'));
  });
}


/* ---------------- Tampilan lengkap halaman Forecasting ---------------- */
var FC_DAY_LONG = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
var FC_DAY_SHORT = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
var FC_DOW_ORDER = [1,2,3,4,5,6,0];   // tampil Senin → Minggu
var lastForecastView = null;

function fcDayLabel(key, withYear){
  var d = parseDayKey(key);
  return FC_DAY_SHORT[d.getDay()] + ', ' + fmtDayShort(key) + (withYear ? ' ' + d.getFullYear() : '');
}
function fcDayLong(key){ return FC_DAY_LONG[parseDayKey(key).getDay()]; }
function fcSet(id, txt){ var el = document.getElementById(id); if(el) el.textContent = txt; }
function fcHtml(id, html){ var el = document.getElementById(id); if(el) el.innerHTML = html; }
function fcSigned(v, digits){ return (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%'; }

function accuracyGrade(wape){
  if(wape < 10) return { label: 'sangat baik', cls: 'good', text: 'Prediksi hampir selalu mendekati kenyataan.' };
  if(wape < 20) return { label: 'baik', cls: 'good', text: 'Prediksi cukup dekat dengan kenyataan dan layak dipakai untuk perencanaan.' };
  if(wape < 35) return { label: 'cukup', cls: 'mid', text: 'Prediksi bisa dipakai sebagai gambaran kasar. Beri ruang aman untuk selisih.' };
  return { label: 'rendah', cls: 'low', text: 'Penjualan harian cukup tidak beraturan sehingga prediksi sering meleset. Pakai sebagai acuan arah saja.' };
}

// Tingkat keyakinan gabungan: lamanya data + hasil backtest (bila ada).
function forecastConfidenceLevel(plan){
  var d = plan.model.validDays;
  var dataRank = d >= 56 ? 3 : (d >= FORECAST_CFG.WARN_DAYS ? 2 : 1);
  var bt = plan.backtest;
  var accRank = null;
  if(bt && bt.ok && bt.wape !== null) accRank = bt.wape < 20 ? 3 : (bt.wape < 35 ? 2 : 1);
  var rank = accRank === null ? dataRank : Math.min(dataRank, accRank);
  var names = { 3: 'Tinggi', 2: 'Sedang', 1: 'Rendah' };
  var cls = { 3: 'good', 2: 'mid', 1: 'low' };
  var why = [];
  why.push(d + ' hari data valid');
  why.push(accRank === null ? 'akurasi belum teruji' : 'akurasi uji ' + accuracyGrade(bt.wape).label);
  return { name: names[rank], cls: cls[rank], reason: why.join(' · ') };
}

function renderForecastExtras(plan){
  lastForecastView = plan;
  var metric = plan.metric;
  var meta = FORECAST_METRICS[metric];
  var model = plan.model, series = plan.series;
  var btn = document.getElementById('btnForecastExport');
  var ok = plan.hasEnoughData && plan.future.length > 0;
  if(btn) btn.disabled = !ok;

  var narrEl = document.getElementById('fcNarrative');
  var resetIds = ['fcTotalSub','fcAvgSub','fcChangeSub','fcPeakSub','fcConfSub'];
  ['fcChange','fcPeak','fcConfidence'].forEach(function(id){ fcSet(id, '—'); var el = document.getElementById(id); if(el) el.className = (id === 'fcConfidence' ? 'big' : 'big tabular'); });
  resetIds.forEach(function(id){ fcHtml(id, '&nbsp;'); });
  if(narrEl){ narrEl.innerHTML = ''; narrEl.classList.remove('show'); }

  renderForecastDataQuality(plan);
  renderForecastDow(plan);

  if(!ok){
    fcHtml('fcDailyTable', '<div class="fc-empty-note">Tabel muncul setelah data cukup untuk membuat prediksi.</div>');
    return;
  }

  var H = plan.horizon, fut = plan.future;
  var total = fut.reduce(function(a, f){ return a + f.pred; }, 0);
  var avgFc = total / H;

  // Pembanding: rata-rata harian aktual pada H hari valid terakhir
  var lastVals = [];
  for(var i = series.values.length - 1; i >= 0 && lastVals.length < H; i--){ if(!series.missing[i]) lastVals.push(series.values[i]); }
  var lastSum = lastVals.reduce(function(a, b){ return a + b; }, 0);
  var lastAvg = lastVals.length ? lastSum / lastVals.length : 0;
  var change = lastAvg > 0 ? (avgFc - lastAvg) / lastAvg * 100 : null;

  var peak = fut.reduce(function(a, f){ return f.pred > a.pred ? f : a; }, fut[0]);
  var low = fut.reduce(function(a, f){ return f.pred < a.pred ? f : a; }, fut[0]);

  fcSet('fcTotalSub', 'Jumlah ' + H + ' hari: ' + fcDayLabel(fut[0].label) + ' – ' + fcDayLabel(fut[H-1].label));
  fcSet('fcAvgSub', 'Rata-rata historis: ' + fmtForecastValue(model.avgDaily, metric, true));

  var chEl = document.getElementById('fcChange');
  if(change !== null && chEl){
    chEl.textContent = (change > 0.05 ? '▲ ' : (change < -0.05 ? '▼ ' : '▬ ')) + fcSigned(change, 1);
    chEl.className = 'big tabular ' + (change > 0.05 ? 'up' : (change < -0.05 ? 'down' : ''));
  }
  fcSet('fcChangeSub', change === null ? 'Pembanding tidak tersedia' : 'Rata-rata per hari ' + fmtForecastValue(lastAvg, metric, true) + ' pada ' + lastVals.length + ' hari terakhir');

  fcSet('fcPeak', FC_DAY_LONG[parseDayKey(peak.label).getDay()]);
  fcSet('fcPeakSub', fmtDayShort(peak.label) + ' · ' + fmtForecastValue(peak.pred, metric, true));

  var conf = forecastConfidenceLevel(plan);
  var cEl = document.getElementById('fcConfidence');
  if(cEl){ cEl.innerHTML = '<span class="fc-badge ' + conf.cls + '">' + escapeHtml(conf.name) + '</span>'; }
  fcSet('fcConfSub', conf.reason);

  // Ringkasan dalam kalimat
  if(narrEl){
    var parts = [];
    parts.push('Dalam <b>' + H + ' hari ke depan</b> (' + escapeHtml(fmtDayShort(fut[0].label)) + ' – ' + escapeHtml(fmtDayShort(fut[H-1].label)) + '), ' + escapeHtml(meta.name) + ' diperkirakan sekitar <b>' + escapeHtml(fmtForecastValue(total, metric, true)) + '</b> atau rata-rata <b>' + escapeHtml(fmtForecastValue(avgFc, metric, true)) + ' per hari</b>.');
    if(change !== null){
      var dirTxt = change > 0.5 ? 'lebih tinggi ' + fmtPct(Math.abs(change)) : (change < -0.5 ? 'lebih rendah ' + fmtPct(Math.abs(change)) : 'hampir sama');
      parts.push('Itu ' + dirTxt + ' dibanding ' + lastVals.length + ' hari terakhir.');
    }
    if(model.useDow && H >= 3 && peak.label !== low.label){
      parts.push('Hari paling ramai diperkirakan <b>' + FC_DAY_LONG[parseDayKey(peak.label).getDay()] + '</b> dan paling sepi <b>' + FC_DAY_LONG[parseDayKey(low.label).getDay()] + '</b>.');
    }
    parts.push('Tingkat keyakinan: <b>' + escapeHtml(conf.name.toLowerCase()) + '</b> (' + escapeHtml(conf.reason) + ').');
    narrEl.innerHTML = parts.join(' ');
    narrEl.classList.add('show');
  }

  // Tabel harian
  var maxPred = Math.max.apply(null, fut.map(function(f){ return f.upper !== null ? Math.max(f.upper, f.pred) : f.pred; })) || 1;
  var rows = fut.map(function(f){
    var vsAvg = model.avgDaily > 0 ? (f.pred / model.avgDaily - 1) * 100 : null;
    var cls = vsAvg === null ? '' : (vsAvg > 5 ? 'up' : (vsAvg < -5 ? 'down' : ''));
    var barW = Math.max(2, f.pred / maxPred * 100);
    var lo = f.lower !== null ? Math.max(0, f.lower / maxPred * 100) : null;
    var hi = f.upper !== null ? Math.max(0, f.upper / maxPred * 100) : null;
    var range = f.lower !== null ? fmtForecastValue(f.lower, metric, true) + ' – ' + fmtForecastValue(f.upper, metric, true) : '—';
    var isWeekend = [0,6].indexOf(parseDayKey(f.label).getDay()) !== -1;
    return '<tr' + (isWeekend ? ' class="wkend"' : '') + '><td>' + escapeHtml(fcDayLabel(f.label, true)) + '</td>' +
      '<td class="fc-bar-cell"><div class="fc-minibar"><span style="width:' + barW.toFixed(1) + '%"></span>' +
      (lo !== null ? '<i style="left:' + lo.toFixed(1) + '%;width:' + Math.max(0.5, hi - lo).toFixed(1) + '%"></i>' : '') + '</div></td>' +
      '<td class="tabular num-r"><b>' + escapeHtml(fmtForecastValue(f.pred, metric, true)) + '</b></td>' +
      '<td class="tabular num-r fc-muted">' + escapeHtml(range) + '</td>' +
      '<td class="tabular num-r fc-vs ' + cls + '">' + (vsAvg === null ? '—' : fcSigned(vsAvg, 0)) + '</td></tr>';
  }).join('');
  fcHtml('fcDailyTable', '<div class="table-scroll fc-table-wrap"><table class="fc-table"><thead><tr><th>Tanggal</th><th></th><th class="num-r">Perkiraan</th><th class="num-r">Rentang wajar</th><th class="num-r" title="Dibanding rata-rata harian historis">vs rata-rata</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="fc-table-foot">"vs rata-rata" membandingkan perkiraan hari itu dengan rata-rata harian historis (' + escapeHtml(fmtForecastValue(model.avgDaily, metric, true)) + '). Baris berlatar abu = akhir pekan.</div>');
}

function renderForecastDataQuality(plan){
  var series = plan.series, model = plan.model, metric = plan.metric;
  if(!series.span){ fcHtml('fcDataQuality', '<div class="fc-empty-note">Belum ada data pada filter yang aktif.</div>'); return; }
  var first = series.labels[0], last = series.labels[series.labels.length - 1];
  function yr(k){ return parseDayKey(k).getFullYear(); }
  var cover = series.span ? Math.round(series.validDays / series.span * 100) : 0;
  var lvlDiff = model.avgDaily > 0 ? (model.level / model.avgDaily - 1) * 100 : null;
  var lvlHint = lvlDiff === null ? 'Titik awal perkiraan: rata-rata beberapa hari valid terakhir.'
    : 'Titik awal perkiraan, ' + Math.abs(Math.round(lvlDiff)) + '% ' + (lvlDiff >= 0 ? 'di atas' : 'di bawah') + ' rata-rata historis.';
  var tone = 'good', verdict = 'Data memadai', verdictTxt = series.validDays + ' hari valid (' + cover + '% dari rentang) dan tidak ada data hilang, sehingga prediksi cukup dapat diandalkan.';
  if(series.validDays < FORECAST_CFG.DOW_MIN_DAYS){
    tone = 'warn'; verdict = 'Data masih terbatas'; verdictTxt = 'Baru ' + series.validDays + ' hari valid. Tambahkan data agar pola hari dan prediksi lebih stabil.';
  } else if(series.missingDays){
    tone = 'warn'; verdict = 'Data cukup, ada celah'; verdictTxt = series.missingDays + ' hari tidak tercatat. Prediksi tetap dibuat dari ' + series.validDays + ' hari valid.';
  }
  var facts = [
    ['Rentang data', fmtDayShort(first) + ' ' + yr(first) + ' – ' + fmtDayShort(last) + ' ' + yr(last), 'Periode penjualan yang dipakai, dari tanggal pertama sampai terakhir pada data.', true],
    ['Hari tercakup', series.span + ' hari', 'Seluruh hari dalam rentang, termasuk hari tanpa transaksi.'],
    ['Hari dipakai (valid)', series.validDays + ' hari', 'Hari yang benar-benar dihitung model (' + cover + '% dari rentang).'],
    ['Data hilang', series.missingDays ? series.missingDays + ' hari dalam ' + series.missingRuns.length + ' rentang' : 'Tidak ada', series.missingDays ? 'Dianggap tidak tercatat, bukan penjualan nol.' : 'Tidak ada hari kosong beruntun, semua hari bisa dipakai.'],
    ['Rata-rata harian historis', fmtForecastValue(model.avgDaily, metric, true), 'Rata-rata seluruh data, patokan untuk menilai perkiraan.'],
    ['Level terbaru (dasar prediksi)', fmtForecastValue(model.level, metric, true), lvlHint],
    ['Pola hari dalam seminggu', model.useDow ? 'Dipakai' : 'Belum dipakai (butuh ≥ ' + FORECAST_CFG.DOW_MIN_DAYS + ' hari valid)', model.useDow ? 'Hari ramai dan sepi (mis. Sabtu vs Selasa) ikut diperhitungkan.' : 'Semua hari diperlakukan sama sampai data cukup.']
  ];
  var html = '<div class="fc-verdict ' + tone + '"><b>' + escapeHtml(verdict) + '</b><span>' + escapeHtml(verdictTxt) + '</span></div>' +
    facts.map(function(f){ return '<div class="fc-fact' + (f[3] ? ' wide' : '') + '"><span>' + escapeHtml(f[0]) + '</span><b>' + escapeHtml(f[1]) + '</b><small>' + escapeHtml(f[2]) + '</small></div>'; }).join('');
  if(series.missingRuns.length){
    html += '<div class="fc-gaps"><div class="fc-gaps-title">Rentang data hilang</div>' + series.missingRuns.slice(0, 5).map(function(r){
      return '<div>' + escapeHtml(fmtDayShort(r.from) + ' – ' + fmtDayShort(r.to)) + ' <span class="fc-muted">(' + r.len + ' hari)</span></div>';
    }).join('') + (series.missingRuns.length > 5 ? '<div class="fc-muted">dan ' + (series.missingRuns.length - 5) + ' rentang lainnya</div>' : '') + '</div>';
  }
  fcHtml('fcDataQuality', html);
  renderForecastExample(plan);
}

function renderForecastExample(plan){
  var model = plan.model, metric = plan.metric;
  var lvl = fmtForecastValue(model.level, metric, true);
  var body;
  if(model.useDow && model.factors){
    var f = model.factors;
    var best = FC_DOW_ORDER.reduce(function(a, d){ return f[d] > f[a] ? d : a; }, FC_DOW_ORDER[0]);
    var fac = f[best].toFixed(2).replace('.', ',');
    body = '<div class="fc-ex-eq">' + escapeHtml(lvl) + ' × ' + fac + ' (' + FC_DAY_LONG[best] + ') ≈ ' + escapeHtml(fmtForecastValue(model.level * f[best], metric, true)) + '</div>' +
      '<div class="fc-ex-note">Level terbaru dikalikan faktor hari. ' + FC_DAY_LONG[best] + ' adalah hari paling ramai pada data Anda, jadi perkiraannya di atas level rata-rata.</div>';
  } else {
    body = '<div class="fc-ex-eq">' + escapeHtml(lvl) + ' per hari</div>' +
      '<div class="fc-ex-note">Pola hari belum dipakai, jadi semua hari diperkirakan sama dengan level terbaru.</div>';
  }
  fcHtml('fcExample', '<div class="fc-ex-label">Contoh dari data Anda</div>' + body);
}

function renderForecastDow(plan){
  var model = plan.model;
  if(!plan.hasEnoughData){ fcHtml('fcDowChart', '<div class="fc-empty-note">Pola hari muncul setelah data cukup.</div>'); return; }
  if(!model.useDow){
    fcHtml('fcDowChart', '<div class="fc-empty-note">Pola hari belum dipakai karena data valid kurang dari ' + FORECAST_CFG.DOW_MIN_DAYS + ' hari. Semua hari diperlakukan sama.</div>');
    return;
  }
  var f = model.factors;
  var maxF = Math.max.apply(null, f) || 1;
  var best = FC_DOW_ORDER.reduce(function(a, d){ return f[d] > f[a] ? d : a; }, FC_DOW_ORDER[0]);
  var worst = FC_DOW_ORDER.reduce(function(a, d){ return f[d] < f[a] ? d : a; }, FC_DOW_ORDER[0]);
  var rows = FC_DOW_ORDER.map(function(d){
    var w = Math.max(2, f[d] / maxF * 100);
    var pct = (f[d] - 1) * 100;
    var cls = d === best ? 'best' : (d === worst ? 'worst' : '');
    return '<div class="fc-dow-row ' + cls + '"><div class="fc-dow-name">' + FC_DAY_LONG[d] + '</div>' +
      '<div class="fc-dow-track"><div class="fc-dow-fill" style="width:' + w.toFixed(1) + '%"></div><span class="fc-dow-avg" style="left:' + (1 / maxF * 100).toFixed(1) + '%"></span></div>' +
      '<div class="fc-dow-val tabular">' + fcSigned(pct, 0) + '</div></div>';
  }).join('');
  fcHtml('fcDowChart', '<div class="fc-dow">' + rows + '</div>' +
    '<div class="fc-table-foot"><b>' + FC_DAY_LONG[best] + '</b> biasanya paling ramai dan <b>' + FC_DAY_LONG[worst] + '</b> paling sepi. Angka = selisih dibanding hari rata-rata; garis tipis menandai titik rata-rata. Dihitung dari seluruh data valid.</div>');
}

function exportForecastExcel(){
  var plan = lastForecastView;
  if(!plan || !plan.hasEnoughData || !plan.future.length) return;
  if(typeof XLSX === 'undefined'){ alert('Pustaka Excel (SheetJS) belum termuat. Periksa koneksi internet lalu muat ulang halaman.'); return; }
  var meta = FORECAST_METRICS[plan.metric];
  var unit = plan.metric === 'revenue' ? 'Rp' : (plan.metric === 'orders' ? 'pesanan' : 'kg');
  var conf = forecastConfidenceLevel(plan);
  var bt = plan.backtest;
  var total = plan.future.reduce(function(a, f){ return a + f.pred; }, 0);
  var summary = [
    ['Prakiraan ' + meta.title],
    ['Dibuat', new Date().toLocaleString('id-ID')],
    ['Horizon', plan.horizon + ' hari'],
    ['Satuan', unit],
    ['Total perkiraan', Math.round(total * 100) / 100],
    ['Rata-rata per hari', Math.round(total / plan.horizon * 100) / 100],
    ['Tingkat keyakinan', conf.name + ' (' + conf.reason + ')'],
    ['Hari data valid', plan.model.validDays],
    ['MAE', bt && bt.ok ? Math.round(bt.mae * 100) / 100 : '-'],
    ['RMSE', bt && bt.ok ? Math.round(bt.rmse * 100) / 100 : '-'],
    ['WAPE (%)', bt && bt.ok && bt.wape !== null ? Math.round(bt.wape * 10) / 10 : '-'],
    [],
    ['Catatan', 'Perkiraan statistik berdasarkan level terbaru x pola hari dalam seminggu. Bukan jaminan hasil.']
  ];
  var daily = [['Tanggal', 'Hari', 'Perkiraan (' + unit + ')', 'Batas bawah', 'Batas atas']].concat(plan.future.map(function(f){
    return [f.label, fcDayLong(f.label), Math.round(f.pred * 100) / 100, f.lower === null ? '' : Math.round(f.lower * 100) / 100, f.upper === null ? '' : Math.round(f.upper * 100) / 100];
  }));
  var wb = XLSX.utils.book_new();
  var ws1 = XLSX.utils.aoa_to_sheet(daily); ws1['!cols'] = [{wch:12},{wch:10},{wch:20},{wch:16},{wch:16}];
  var ws2 = XLSX.utils.aoa_to_sheet(summary); ws2['!cols'] = [{wch:24},{wch:60}];
  XLSX.utils.book_append_sheet(wb, ws1, 'Prakiraan harian');
  XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan');
  XLSX.writeFile(wb, 'prakiraan-' + plan.metric + '-' + plan.horizon + 'hari.xlsx');
}
var btnForecastExport = document.getElementById('btnForecastExport');
if(btnForecastExport) btnForecastExport.addEventListener('click', exportForecastExcel);

function renderForecast(){
  var metric = state.forecastMetric || 'revenue';
  var revPlan = getForecastPlan('revenue', state.horizon);          // Dashboard Utama: selalu pendapatan
  var viewPlan = metric === 'revenue' ? revPlan : getForecastPlan(metric, state.horizon);

  fillForecastSummary({
    lbl: document.getElementById('fcTotalLbl'), total: document.getElementById('fcTotal'), avg: document.getElementById('fcAvg'),
    trend: document.getElementById('fcTrend'), note: document.getElementById('forecastNote'), empty: document.getElementById('forecastEmpty'),
    grid: document.getElementById('forecastGrid'), warn: document.getElementById('forecastWarn')
  }, revPlan);
  fillForecastSummary({
    lbl: document.getElementById('fcTotalLblView'), total: document.getElementById('fcTotalView'), avg: document.getElementById('fcAvgView'),
    trend: document.getElementById('fcTrendView'), note: document.getElementById('forecastNoteView'), empty: document.getElementById('forecastEmptyView'),
    grid: document.getElementById('forecastGridView'), warn: document.getElementById('forecastWarnView')
  }, viewPlan);

  // Legenda (pita hanya muncul bila benar-benar dihitung dari backtest)
  function show(id, on){ var el = document.getElementById(id); if(el) el.style.display = on ? '' : 'none'; }
  show('legendProyeksi', revPlan.hasEnoughData);
  show('legendBand', revPlan.hasEnoughData && !!revPlan.band);
  show('legendProyeksiView', viewPlan.hasEnoughData);
  show('legendBandView', viewPlan.hasEnoughData && !!viewPlan.band);
  var hz = document.getElementById('legendProyeksiViewHorizon');
  if(hz) hz.textContent = viewPlan.horizon;
  var titleEl = document.getElementById('forecastViewTitle');
  if(titleEl) titleEl.textContent = 'Prediksi ' + FORECAST_METRICS[viewPlan.metric].title + ' ke depan';
  var noteBox = document.getElementById('legendGapView');
  if(noteBox) noteBox.style.display = viewPlan.series.missingDays ? '' : 'none';
  var noteBoxDash = document.getElementById('legendGap');
  if(noteBoxDash) noteBoxDash.style.display = revPlan.series.missingDays ? '' : 'none';

  syncForecastTabs(viewPlan);
  renderRevenueChart('revenueChart', 'revenue', revPlan);
  renderRevenueChart('forecastViewChart', 'revenueForecastView', viewPlan);
  renderForecastEvaluation(viewPlan);
  renderForecastExtras(viewPlan);
}
