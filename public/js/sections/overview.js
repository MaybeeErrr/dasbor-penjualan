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
  steps.push({ b:'5. Filtering transaksi', t: 'Perhitungan pendapatan, RFM, dan forecasting memakai transaksi berstatus "Selesai" secara default; jika tidak ada transaksi selesai pada filter aktif, seluruh transaksi dipakai sebagai fallback agar dasbor tetap menampilkan data apa adanya.' });
  steps.push({ b:'6. Standardisasi sebelum K-Means', t: 'Nilai Recency, Frequency, dan Monetary distandardisasi (z-score) sebelum dipakai K-Means, agar skala Monetary yang jauh lebih besar tidak mendominasi perhitungan jarak antar pelanggan.' });
  stepsEl.innerHTML = steps.map(function(s){
    return '<div class="pre-step"><span class="dot"></span><div><b>'+escapeHtml(s.b)+'</b><br><span class="muted-txt">'+escapeHtml(s.t)+'</span></div></div>';
  }).join('');
}

function renderKPIs(){
  var recs = state.filtered;
  var orders = uniqueOrders(recs);
  var completedOrders = orders.filter(function(o){ return /selesai|complete|delivered/i.test(o.status); });
  var revenueBase = completedOrders.length ? completedOrders : orders;
  var totalRevenue = revenueBase.reduce(function(s,o){ return s + o.total_payment; }, 0);
  var totalOrders = orders.length;
  var avgOrder = revenueBase.length ? totalRevenue / revenueBase.length : 0;
  var qtyTerjual = recs.filter(function(r){ return revenueBase.indexOf(orders.find(function(o){return o.order_id===r.order_id;})) !== -1 || /selesai|complete|delivered/i.test(r.status); })
    .reduce(function(s,r){ return s + r.qty; }, 0);

  // week over week
  var byDay = groupByDay(revenueBase);
  var days = Object.keys(byDay).sort();
  var last7 = days.slice(-7).reduce(function(s,k){ return s + byDay[k]; }, 0);
  var prev7 = days.slice(-14,-7).reduce(function(s,k){ return s + byDay[k]; }, 0);
  var delta = prev7 > 0 ? ((last7 - prev7) / prev7 * 100) : null;

  var cancelRate = totalOrders ? ( (totalOrders - completedOrders.length) / totalOrders * 100 ) : 0;

  var kpis = [
    {label:'Total pendapatan', value: idr(totalRevenue), delta: delta === null ? '7 hari terakhir tidak cukup data' : ( (delta>=0?'▲ ':'▼ ') + Math.abs(delta).toFixed(1) + '% vs 7 hari sebelumnya'), cls: delta===null?'':(delta>=0?'up':'down')},
    {label:'Total pesanan', value: totalOrders.toLocaleString('id-ID'), delta: completedOrders.length + ' selesai', cls:''},
    {label:'Rata-rata nilai pesanan', value: idr(avgOrder), delta:'per pesanan selesai', cls:''},
    {label:'Tingkat pembatalan', value: cancelRate.toFixed(1) + '%', delta: (totalOrders-completedOrders.length)+' pesanan dibatalkan', cls: cancelRate>15?'down':''}
  ];
  var grid = document.getElementById('kpiGrid');
  grid.innerHTML = kpis.map(function(k, i){
    var cardCls = i===3 ? (cancelRate>15?'warn':'amber') : '';
    return '<div class="kpi-card '+cardCls+'"><div class="kpi-label">'+k.label+'</div><div class="kpi-value tabular">'+k.value+'</div><div class="kpi-delta '+k.cls+'">'+k.delta+'</div></div>';
  }).join('');

  document.getElementById('dashSub').textContent = totalOrders.toLocaleString('id-ID') + ' pesanan · ' + days.length + ' hari transaksi · diperbarui dari ' + (document.getElementById('dataStatusTxt').textContent);
}

function groupByDay(orders, metric){
  var byDay = {};
  orders.forEach(function(o){
    var d = toDate(o.created_at);
    if(!d) return;
    var k = dayKey(d);
    byDay[k] = (byDay[k] || 0) + (metric === 'orders' ? 1 : o.total_payment);
  });
  return byDay;
}

function fillDayRange(byDay){
  var keys = Object.keys(byDay).sort();
  if(!keys.length) return {labels:[], values:[]};
  var start = new Date(keys[0]);
  var end = new Date(keys[keys.length-1]);
  var labels = [], values = [];
  var cur = new Date(start);
  while(cur <= end){
    var k = dayKey(cur);
    labels.push(k);
    values.push(byDay[k] || 0);
    cur.setDate(cur.getDate()+1);
  }
  return {labels: labels, values: values};
}

function linearRegression(values){
  var n = values.length;
  if(n < 2) return {slope:0, intercept: values[0] || 0, residualStd:0};
  var sumX=0,sumY=0,sumXY=0,sumXX=0;
  for(var i=0;i<n;i++){ sumX+=i; sumY+=values[i]; sumXY+=i*values[i]; sumXX+=i*i; }
  var denom = (n*sumXX - sumX*sumX) || 1;
  var slope = (n*sumXY - sumX*sumY) / denom;
  var intercept = (sumY - slope*sumX) / n;
  var sqErr = 0;
  for(i=0;i<n;i++){ var pred = slope*i+intercept; sqErr += Math.pow(values[i]-pred,2); }
  var residualStd = Math.sqrt(sqErr/n);
  return {slope:slope, intercept:intercept, residualStd:residualStd};
}

var MIN_FORECAST_DAYS = 2; // minimum distinct days of history needed to fit a linear trend

// metric: 'revenue' (default, total pembayaran) atau 'orders' (jumlah pesanan per hari)
function getForecastModel(metric){
  metric = metric || 'revenue';
  var recs = state.filtered;
  var orders = uniqueOrders(recs).filter(function(o){ return /selesai|complete|delivered/i.test(o.status); });
  var byDay = groupByDay(orders.length ? orders : uniqueOrders(recs), metric);
  var series = fillDayRange(byDay);
  var actualDays = series.values.length;
  var hasEnoughData = actualDays >= MIN_FORECAST_DAYS;
  var reg = hasEnoughData ? linearRegression(series.values) : {slope:0, intercept:0, residualStd:0};
  var avgDaily = actualDays ? series.values.reduce(function(a,b){ return a+b; }, 0) / actualDays : 0;
  var dow0 = series.labels.length ? new Date(series.labels[0] + 'T00:00:00').getDay() : 0;
  return {series: series, reg: reg, actualDays: actualDays, hasEnoughData: hasEnoughData, avgDaily: avgDaily, metric: metric, dow0: dow0};
}

function fmtMetric(metric, v){
  if(v === null || v === undefined || isNaN(v)) return '—';
  return metric === 'orders' ? Math.round(v).toLocaleString('id-ID') + ' pesanan' : idr(v);
}

// Proyeksi memakai model terpilih (state.forecastModel: 'auto' = terbaik menurut rolling backtest).
function getForecastRun(model){
  if(!model.hasEnoughData) return null;
  return Forecast.run(model.series.values, model.dow0, {horizon: state.horizon, modelKey: state.forecastModel});
}

function renderRevenueChart(canvasId, chartKey, model, run){
  canvasId = canvasId || 'revenueChart';
  chartKey = chartKey || 'revenue';
  var canvasEl = document.getElementById(canvasId);
  if(!canvasEl) return;
  model = model || getForecastModel();
  if(run === undefined) run = getForecastRun(model);
  var series = model.series;
  var metric = model.metric;
  var horizon = state.horizon;
  var labels = series.labels.slice();
  var actual = series.values.slice();
  var forecastLine = new Array(actual.length).fill(null);
  var forecastUpper = new Array(actual.length).fill(null);
  var forecastLower = new Array(actual.length).fill(null);
  var forecastBoundaryIndex = actual.length - 1;
  var willForecast = !!run && actual.length > 0;

  if(willForecast){
    forecastLine[actual.length-1] = actual[actual.length-1];
    forecastUpper[actual.length-1] = actual[actual.length-1];
    forecastLower[actual.length-1] = actual[actual.length-1];

    var lastDate = series.labels.length ? new Date(series.labels[series.labels.length-1]) : new Date();
    for(var i=0;i<horizon;i++){
      var d = new Date(lastDate); d.setDate(d.getDate()+i+1);
      labels.push(dayKey(d));
      forecastLine.push(run.pred[i]);
      forecastUpper.push(run.high[i]);
      forecastLower.push(run.low[i]);
    }
  }

  var legendProyeksi = document.getElementById('legendProyeksi');
  if(legendProyeksi) legendProyeksi.style.display = willForecast ? '' : 'none';
  var legendProyeksiView = document.getElementById('legendProyeksiView');
  if(legendProyeksiView) legendProyeksiView.style.display = willForecast ? '' : 'none';
  var legendProyeksiViewHorizon = document.getElementById('legendProyeksiViewHorizon');
  if(legendProyeksiViewHorizon) legendProyeksiViewHorizon.textContent = horizon;

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
          pointRadius: 0, borderWidth: 2.4
        },
        {
          label: 'Skenario tinggi', data: forecastUpper, borderColor: 'transparent',
          backgroundColor: css.getPropertyValue('--chart-forecast-soft').trim(), fill: '+1',
          pointRadius: 0, tension: 0.3, borderWidth: 0
        },
        {
          label: 'Skenario rendah', data: forecastLower, borderColor: 'transparent',
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
            label: function(ctx){
              if(ctx.parsed.y === null) return null;
              return ctx.dataset.label + ': ' + fmtMetric(metric, ctx.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {grid:{display:false}, ticks:{maxRotation:0, autoSkip:true, maxTicksLimit:10, color: css.getPropertyValue('--ink-muted').trim()}},
        y: {beginAtZero: true, grid:{color: css.getPropertyValue('--chart-grid').trim()}, ticks:{callback:function(v){return metric==='orders' ? v : idrShort(v);}, color: css.getPropertyValue('--ink-muted').trim()}}
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

/* ---------------- Evaluasi forecasting (rolling backtest: MAE / RMSE / MAPE) ----------------
   Bukan satu kali pembagian data: model dilatih ulang pada banyak titik awal (expanding window),
   tiap kali meramal beberapa hari berikutnya, lalu seluruh galat digabung. Hasilnya tidak
   bergantung pada satu pembagian data yang kebetulan bagus atau jelek. Empat model dibandingkan
   dengan model pembanding (rata-rata 7 hari terakhir). Detail perhitungan: js/core/forecast.js */
function evaluateForecast(model, modelKey){
  return Forecast.evaluate(model.series.values, model.dow0, modelKey || state.forecastModel);
}

function renderForecastEvaluation(model){
  var gridEl = document.getElementById('evalGrid');
  var emptyEl = document.getElementById('evalEmpty');
  var noteEl = document.getElementById('evalNote');
  var cmpEl = document.getElementById('evalCompareWrap');
  var tblEl = document.getElementById('evalTableBody');
  var verdictEl = document.getElementById('evalVerdict');
  if(!gridEl) return;

  var res = evaluateForecast(model);

  if(!res.ok){
    gridEl.classList.add('muted');
    document.getElementById('evalMae').textContent = '—';
    document.getElementById('evalRmse').textContent = '—';
    document.getElementById('evalMape').textContent = '—';
    if(cmpEl) cmpEl.style.display = 'none';
    if(verdictEl) verdictEl.textContent = '';
    if(emptyEl){
      emptyEl.classList.add('show');
      emptyEl.textContent = 'Evaluasi belum dapat dilakukan: data historis pada filter ini hanya ' + res.n + ' hari, sedangkan rolling backtest memerlukan minimal ' + res.minNeeded + ' hari data transaksi. Coba ubah filter, atau unggah data dengan rentang tanggal yang lebih panjang.';
    }
    if(noteEl) noteEl.textContent = '';
    return;
  }

  gridEl.classList.remove('muted');
  if(emptyEl) emptyEl.classList.remove('show');
  var metric = model.metric;

  document.getElementById('evalMae').textContent = fmtMetric(metric, res.mae);
  document.getElementById('evalRmse').textContent = fmtMetric(metric, res.rmse);
  document.getElementById('evalMape').textContent = res.mape === null ? 'Tidak dapat dihitung' : res.mape.toFixed(1) + '%';

  if(tblEl){
    if(cmpEl) cmpEl.style.display = '';
    tblEl.innerHTML = res.table.map(function(r){
      var isSel = r.key === res.modelKey;
      return '<tr' + (isSel ? ' class="sel"' : '') + '><td>' + escapeHtml(r.name) + (r.key === res.bestKey ? ' <span class="fc-star" title="Model dengan MAE terendah">★</span>' : '') + (isSel ? ' <span class="fc-tag">dipakai</span>' : '') + '</td><td class="tabular">' + fmtMetric(metric, r.mae) + '</td><td class="tabular">' + fmtMetric(metric, r.rmse) + '</td><td class="tabular">' + (r.mape === null ? '—' : r.mape.toFixed(1) + '%') + '</td></tr>';
    }).join('');
  }
  if(verdictEl){
    var v;
    if(res.modelKey === 'naive'){
      v = res.bestKey === 'naive'
        ? 'Model pembanding (rata-rata 7 hari terakhir) ternyata paling akurat pada data ini: model yang lebih rumit belum memberi keuntungan berarti.'
        : 'Model yang dipakai adalah model pembanding itu sendiri, sehingga tidak ada perbandingan. Model terbaik menurut backtest: ' + escapeHtml(Forecast.name(res.bestKey)) + '.';
    } else if(res.beatsBaseline){
      v = 'Model terpilih lebih akurat ' + res.skill.toFixed(0) + '% (berdasarkan MAE) dibanding model pembanding.';
    } else {
      v = 'Model terpilih belum lebih baik dari model pembanding (MAE ' + Math.abs(res.skill).toFixed(0) + '% lebih tinggi). Pertimbangkan model lain atau data yang lebih panjang.';
    }
    verdictEl.innerHTML = v;
  }
  if(noteEl){
    var mapeNote = res.mape === null
      ? ' MAPE tidak dapat dihitung karena seluruh hari uji memiliki nilai aktual 0.'
      : (res.mapeSkipped > 0 ? ' ' + res.mapeSkipped + ' titik uji dilewati dari MAPE karena nilai aktualnya 0 (pembagian dengan nol tidak terdefinisi).' : '');
    noteEl.textContent = 'Rolling backtest: model dilatih ulang pada ' + res.folds + ' titik awal (mulai dari ' + res.minTrain + ' hari data pertama, jendela latih terus bertambah), tiap kali meramal ' + res.hEval + ' hari berikutnya. Total ' + res.points + ' titik uji dipakai untuk MAE/RMSE/MAPE.' + mapeNote;
  }
}

// Mengisi satu kartu ringkasan forecasting (Dashboard Utama atau halaman Forecasting).
function fillForecastSummary(ids, model, run){
  function el(k){ return document.getElementById(ids[k]); }
  var t = { total: el('total'), avg: el('avg'), trend: el('trend'), note: el('note'), empty: el('empty'), grid: el('grid'), meta: el('meta') };
  var metric = model.metric;
  var horizon = state.horizon;
  if(t.total && t.total.previousElementSibling){
    t.total.previousElementSibling.textContent = metric === 'orders' ? 'Perkiraan total pesanan' : 'Perkiraan total pendapatan';
  }

  if(!run){
    var emptyMsg = model.actualDays === 0
      ? 'Belum ada data transaksi pada filter yang aktif, sehingga prediksi belum dapat dihitung.'
      : 'Data historis pada filter ini hanya mencakup ' + model.actualDays + ' hari. Prediksi memerlukan minimal ' + MIN_FORECAST_DAYS + ' hari data transaksi yang berbeda.';
    if(t.total) t.total.textContent = '—';
    if(t.avg) t.avg.textContent = '—';
    if(t.trend) t.trend.textContent = '—';
    if(t.grid) t.grid.classList.add('muted');
    if(t.empty){ t.empty.classList.add('show'); t.empty.textContent = emptyMsg; }
    if(t.meta) t.meta.innerHTML = '';
    if(t.note) t.note.textContent = 'Prediksi nonaktif sementara karena data historis belum mencukupi. Coba ubah filter status/provinsi, atau unggah data dengan rentang tanggal yang lebih panjang.';
    return;
  }

  // Arah tren dihitung relatif terhadap rata-rata harian (bukan ambang Rupiah tetap), dari kemiringan regresi linier.
  var reg = model.reg;
  var relSlope = model.avgDaily > 0 ? (reg.slope / model.avgDaily) : 0;
  var trendPct = relSlope * 100;
  var trendLabel = relSlope > 0.01 ? '▲ Naik' : (relSlope < -0.01 ? '▼ Turun' : '▬ Stabil');
  var trendTxt = trendLabel + (model.avgDaily > 0 ? ' (' + (trendPct>=0?'+':'') + trendPct.toFixed(1) + '%/hari)' : '');

  var rel = run.reliability;
  var backtestTxt = run.evalRes.ok
    ? 'Rentang skenario memakai persentil 10–90 galat rolling backtest (kira-kira 80% kejadian jatuh di dalam rentang).'
    : 'Karena data terlalu singkat untuk backtesting, rentang skenario hanya didasarkan pada sebaran data harian.';
  var noteTxt = 'Dihitung otomatis dengan ' + run.modelName + ' atas ' + run.n + ' hari data transaksi pada filter yang aktif, horizon ' + horizon + ' hari ke depan. ' + backtestTxt + ' Ini perkiraan statistik, bukan jaminan hasil.';

  if(t.grid) t.grid.classList.remove('muted');
  if(t.empty) t.empty.classList.remove('show');
  if(t.total) t.total.textContent = fmtMetric(metric, run.total);
  if(t.avg) t.avg.textContent = fmtMetric(metric, run.total / horizon);
  if(t.trend) t.trend.textContent = trendTxt;
  if(t.note) t.note.textContent = noteTxt;
  if(t.meta){
    t.meta.innerHTML =
      '<div class="fc-range">Skenario rendah–tinggi: <b>' + fmtMetric(metric, run.totalLow) + '</b> – <b>' + fmtMetric(metric, run.totalHigh) + '</b></div>' +
      '<div class="fc-model">Model: <b>' + escapeHtml(run.modelName) + '</b> <span class="fc-muted">· ' + (run.auto ? 'dipilih otomatis lewat backtest' : 'dipilih manual') + '</span></div>' +
      '<div class="fc-reliab lvl-' + rel.level + '"><span class="fc-badge">Keandalan: ' + rel.label + '</span> <span class="fc-reasons">' + rel.reasons.map(escapeHtml).join(' ') + '</span></div>';
  }
}

function renderForecast(){
  var revModel = getForecastModel('revenue');
  var pageMetric = state.forecastMetric || 'revenue';
  var pageModel = pageMetric === 'revenue' ? revModel : getForecastModel(pageMetric);
  var dashRun = getForecastRun(revModel);
  var pageRun = pageMetric === 'revenue' ? dashRun : getForecastRun(pageModel);

  // Dashboard Utama selalu menampilkan pendapatan; halaman Forecasting mengikuti pilihan metrik.
  fillForecastSummary({total:'fcTotal', avg:'fcAvg', trend:'fcTrend', note:'forecastNote', empty:'forecastEmpty', grid:'forecastGrid', meta:'fcMeta'}, revModel, dashRun);
  fillForecastSummary({total:'fcTotalView', avg:'fcAvgView', trend:'fcTrendView', note:'forecastNoteView', empty:'forecastEmptyView', grid:'forecastGridView', meta:'fcMetaView'}, pageModel, pageRun);

  renderRevenueChart('revenueChart', 'revenue', revModel, dashRun);
  renderRevenueChart('forecastViewChart', 'revenueForecastView', pageModel, pageRun);
  renderForecastEvaluation(pageModel);
  if(typeof renderForecastExtras === 'function') renderForecastExtras(revModel);
}

function renderTopProducts(){
  var recs = state.filtered.filter(function(r){ return /selesai|complete|delivered/i.test(r.status); });
  var base = recs.length ? recs : state.filtered;
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
  var palette = labels.map(function(l){ return /selesai|complete|delivered/i.test(l) ? '#2F6F4E' : (/batal|cancel/i.test(l) ? '#B0473B' : '#C98A22'); });
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
