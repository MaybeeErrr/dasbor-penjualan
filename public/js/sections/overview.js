"use strict";

/* ---------------- Rendering ---------------- */
function render(){
  applyFilters();
  renderKPIs();
  renderForecast();
  renderTopProducts();
  renderPaymentChart();
  renderTopProvinces();
  renderStatusChart();
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

function renderKPIs(){
  var recs = state.filtered;
  var orders = uniqueOrders(recs);
  var completedOrders = orders.filter(function(o){ return OrderStatus.isCompleted(o.status); });
  var cancelledOrders = orders.filter(function(o){ return OrderStatus.isCancelled(o.status); });
  var revenueBase = OrderStatus.counted(orders);
  var totalRevenue = revenueBase.reduce(function(s,o){ return s + o.total_payment; }, 0);
  var totalOrders = orders.length;
  var avgOrder = revenueBase.length ? totalRevenue / revenueBase.length : 0;
  var qtyTerjual = recs.filter(function(r){ return revenueBase.indexOf(orders.find(function(o){return o.order_id===r.order_id;})) !== -1 || OrderStatus.isCompleted(r.status); })
    .reduce(function(s,r){ return s + r.qty; }, 0);

  // week over week
  var byDay = groupByDay(revenueBase);
  var days = Object.keys(byDay).sort();
  var last7 = days.slice(-7).reduce(function(s,k){ return s + byDay[k]; }, 0);
  var prev7 = days.slice(-14,-7).reduce(function(s,k){ return s + byDay[k]; }, 0);
  var delta = prev7 > 0 ? ((last7 - prev7) / prev7 * 100) : null;

  var cancelRate = totalOrders ? ( cancelledOrders.length / totalOrders * 100 ) : 0;

  var kpis = [
    {label:'Total pendapatan', value: idr(totalRevenue), delta: delta === null ? '7 hari terakhir tidak cukup data' : ( (delta>=0?'▲ ':'▼ ') + Math.abs(delta).toFixed(1) + '% vs 7 hari sebelumnya'), cls: delta===null?'':(delta>=0?'up':'down')},
    {label:'Total pesanan', value: totalOrders.toLocaleString('id-ID'), delta: completedOrders.length + ' selesai', cls:''},
    {label:'Rata-rata nilai pesanan', value: idr(avgOrder), delta:'per pesanan selesai', cls:''},
    {label:'Tingkat pembatalan', value: cancelRate.toFixed(1) + '%', delta: cancelledOrders.length+' pesanan dibatalkan', cls: cancelRate>15?'down':''}
  ];
  var grid = document.getElementById('kpiGrid');
  grid.innerHTML = kpis.map(function(k, i){
    var cardCls = i===3 ? (cancelRate>15?'warn':'amber') : '';
    return '<div class="kpi-card '+cardCls+'"><div class="kpi-label">'+k.label+'</div><div class="kpi-value tabular">'+k.value+'</div><div class="kpi-delta '+k.cls+'">'+k.delta+'</div></div>';
  }).join('');

  document.getElementById('dashSub').textContent = totalOrders.toLocaleString('id-ID') + ' pesanan · ' + days.length + ' hari transaksi · diperbarui dari ' + (document.getElementById('dataStatusTxt').textContent);
}

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
    descEl.textContent = 'Model dilatih ulang pada beberapa titik potong (backtest bergulir): pada tiap potongan, model hanya melihat data sebelum titik potong, memprediksi ' + H + ' hari berikutnya, lalu dibandingkan dengan aktual. Titik potong bergeser ' + FORECAST_CFG.EVAL_STRIDE + ' hari dan hanya ' + FORECAST_CFG.EVAL_MAX_FOLDS + ' potongan terbaru yang dipakai; hari data hilang tidak dinilai. Pembanding "rata-rata biasa" = rata-rata seluruh hari valid pada data latih potongan yang sama. Panjang uji mengikuti horizon yang dipilih (' + H + ' hari).';
  }

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
}

function renderTopProducts(){
  var base = OrderStatus.counted(state.filtered);
  var map = {};
  base.forEach(function(r){
    var key = r.product || 'Tidak diketahui';
    map[key] = (map[key] || 0) + r.subtotal;
  });
  var arr = Object.keys(map).map(function(k){ return {name:k, val:map[k]}; }).sort(function(a,b){ return b.val-a.val; }).slice(0,8);
  var max = arr.length ? arr[0].val : 1;
  var el = document.getElementById('topProducts');
  if(!arr.length){ el.innerHTML = '<div class="kpi-delta">Tidak ada data produk.</div>'; return; }
  el.innerHTML = arr.map(function(p){
    var pct = Math.max(4, (p.val/max*100));
    return '<div class="bar-row"><div class="name" title="'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div><div class="bar-val">'+idrShort(p.val)+'</div></div>';
  }).join('');
}

function renderTopProvinces(){
  var orders = uniqueOrders(state.filtered);
  var map = {};
  orders.forEach(function(o){
    var key = o.province || 'Tidak diketahui';
    map[key] = (map[key] || 0) + 1;
  });
  var arr = Object.keys(map).map(function(k){ return {name:k, val:map[k]}; }).sort(function(a,b){ return b.val-a.val; }).slice(0,8);
  var max = arr.length ? arr[0].val : 1;
  var el = document.getElementById('topProvinces');
  if(!arr.length){ el.innerHTML = '<div class="kpi-delta">Tidak ada data wilayah.</div>'; return; }
  el.innerHTML = arr.map(function(p){
    var pct = Math.max(4, (p.val/max*100));
    return '<div class="bar-row"><div class="name" title="'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:var(--amber);"></div></div><div class="bar-val">'+p.val+'</div></div>';
  }).join('');
}

function renderPaymentChart(){
  var orders = uniqueOrders(state.filtered);
  var map = {};
  orders.forEach(function(o){
    var key = o.payment_method || 'Tidak diketahui';
    map[key] = (map[key] || 0) + 1;
  });
  var labels = Object.keys(map);
  var values = labels.map(function(k){ return map[k]; });
  var palette = ['#2F6F4E','#C98A22','#B0473B','#5C6F64','#8FBFA3','#E2C68C','#D69C93','#A9B8A4'];
  var ctx = document.getElementById('paymentChart').getContext('2d');
  if(charts.payment) charts.payment.destroy();
  var css = getComputedStyle(document.documentElement);
  if(!labels.length){ return; }
  charts.payment = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: palette, borderColor: css.getPropertyValue('--surface').trim(), borderWidth: 2 }] },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins: { legend: { position:'right', labels:{boxWidth:10, font:{size:11}, color: css.getPropertyValue('--ink-muted').trim()} } }
    }
  });
}

function renderStatusChart(){
  var orders = uniqueOrders(state.filtered);
  var map = {};
  orders.forEach(function(o){
    var key = o.status || 'Tidak diketahui';
    map[key] = (map[key] || 0) + 1;
  });
  var labels = Object.keys(map);
  var values = labels.map(function(k){ return map[k]; });
  var palette = labels.map(function(l){ return OrderStatus.isCompleted(l) ? '#2F6F4E' : (OrderStatus.isCancelled(l) ? '#B0473B' : '#C98A22'); });
  var ctx = document.getElementById('statusChart').getContext('2d');
  if(charts.status) charts.status.destroy();
  var css = getComputedStyle(document.documentElement);
  if(!labels.length){ return; }
  charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: palette, borderColor: css.getPropertyValue('--surface').trim(), borderWidth: 2 }] },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins: { legend: { position:'right', labels:{boxWidth:10, font:{size:11}, color: css.getPropertyValue('--ink-muted').trim()} } }
    }
  });
}
