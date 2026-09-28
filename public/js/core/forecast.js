"use strict";

/* ---------------- Mesin forecasting (murni: tanpa DOM dan tanpa state global) ----------------
   Model      : prediksi(hari d) = level_terbaru x faktor_hari_dalam_minggu[d]
   Level      : rata-rata LEVEL_DAYS hari valid terakhir, setelah tiap hari dibagi faktor harinya.
   Faktor hari: rata-rata nilai pada hari-dalam-minggu tsb dibagi rata-rata seluruh hari valid,
                lalu dinormalkan agar rata-rata ketujuh faktor = 1. Dipakai hanya bila data valid
                >= DOW_MIN_DAYS dan tiap hari-dalam-minggu punya >= DOW_MIN_OBS kemunculan.
   Data hilang: hari tanpa pesanan yang berurutan >= MISSING_RUN hari dianggap DATA HILANG (bukan
                penjualan nol): tidak ikut menghitung faktor, level, tren, maupun skor backtest, dan
                tampil sebagai celah pada grafik. Hari kosong yang berdiri sendiri / hanya 1-2 hari
                tetap dianggap penjualan nol yang sungguhan.
   Evaluasi   : backtest bergulir (rolling origin). Tiap potongan melatih ulang model pada data
                sebelum titik potong, lalu memprediksi `horizon` hari sesudahnya dan dibandingkan
                dengan aktual. Pembanding: "rata-rata biasa" = rata-rata seluruh hari valid pada
                data latih potongan yang sama. Metrik utama WAPE = sum|galat| / sum(aktual).
   Pita       : persentil 10-90 dari galat (aktual - prediksi) seluruh potongan backtest,
                bukan dari residu data latih. Tanpa backtest yang cukup, pita tidak ditampilkan. */
var FORECAST_CFG = {
  MIN_DAYS: 2,          // minimal hari valid agar prediksi dibuat
  WARN_DAYS: 28,        // data < 4 minggu: tampilkan peringatan dan batasi horizon
  SHORT_CAP: 7,         // horizon maksimum saat data < WARN_DAYS
  DOW_MIN_DAYS: 14,     // minimal hari valid agar pola hari dalam seminggu dipakai
  DOW_MIN_OBS: 2,       // minimal kemunculan tiap hari-dalam-minggu
  LEVEL_DAYS: 7,        // jumlah hari valid terakhir untuk menghitung level terbaru
  MISSING_RUN: 3,       // hari kosong beruntun sepanjang ini (atau lebih) = data hilang
  EVAL_MIN_TRAIN: 14,   // minimal hari data latih pada potongan backtest pertama
  EVAL_STRIDE: 7,       // jarak antar titik potong (hari), selaras dengan siklus mingguan
  EVAL_MAX_FOLDS: 8,    // hanya potongan paling baru yang dipakai
  BAND_LO: 0.10,        // persentil bawah pita ketidakpastian
  BAND_HI: 0.90,        // persentil atas pita ketidakpastian
  BAND_MIN_POINTS: 10   // minimal titik galat backtest agar pita dihitung
};

var FORECAST_METRICS = {
  revenue: { key: 'revenue', name: 'pendapatan',      totalLbl: 'Perkiraan total pendapatan',     title: 'pendapatan harian' },
  orders:  { key: 'orders',  name: 'jumlah pesanan',  totalLbl: 'Perkiraan total pesanan',        title: 'jumlah pesanan harian' },
  kg:      { key: 'kg',      name: 'berat terjual',   totalLbl: 'Perkiraan total berat terjual',  title: 'berat terjual harian (kg)' }
};

function fmtForecastValue(v, metric, compact){
  if(v === null || v === undefined || isNaN(v)) return '—';
  if(metric === 'orders') return v.toLocaleString('id-ID', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }) + ' pesanan';
  if(metric === 'kg') return v.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' kg';
  return compact ? idrShort(v) : idr(v);
}
function fmtPct(v, digits){
  if(v === null || v === undefined || isNaN(v)) return '—';
  return v.toLocaleString('id-ID', { minimumFractionDigits: digits == null ? 1 : digits, maximumFractionDigits: digits == null ? 1 : digits }) + '%';
}

function parseDayKey(k){
  var p = String(k).split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}
function addDaysKey(k, n){
  var d = parseDayKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/* ---------- Deret harian ----------
   metric: 'revenue' (Rp per pesanan unik), 'orders' (jumlah pesanan unik), 'kg' (berat baris pesanan).
   Hari pesanan dihitung sama seperti menu lain (OrderStatus.counted). */
function buildForecastSeries(records, metric){
  metric = FORECAST_METRICS[metric] ? metric : 'revenue';
  var uniq = OrderStatus.counted(uniqueOrders(records || []));
  var cnt = {}, rev = {}, kg = {};
  uniq.forEach(function(o){
    var d = toDate(o.created_at);
    if(!d) return;
    var k = dayKey(d);
    cnt[k] = (cnt[k] || 0) + 1;
    rev[k] = (rev[k] || 0) + ((typeof o.total_payment === 'number' && !isNaN(o.total_payment)) ? o.total_payment : 0);
  });
  if(metric === 'kg'){
    OrderStatus.counted(records || []).forEach(function(r){
      var d = toDate(r.created_at);
      if(!d) return;
      var k = dayKey(d);
      kg[k] = (kg[k] || 0) + lineWeight(r).grams / 1000;
    });
  }
  var src = metric === 'revenue' ? rev : (metric === 'orders' ? cnt : kg);

  var keys = Object.keys(cnt).concat(Object.keys(kg)).sort();
  var empty = { metric: metric, labels: [], values: [], missing: [], dows: [], span: 0, validDays: 0, missingDays: 0, missingRuns: [] };
  if(!keys.length) return empty;

  var labels = [], values = [], active = [], dows = [];
  var cur = parseDayKey(keys[0]);
  var end = parseDayKey(keys[keys.length - 1]);
  while(cur <= end){
    var k = dayKey(cur);
    labels.push(k);
    values.push(src[k] || 0);
    active.push((cnt[k] || 0) > 0 || (kg[k] || 0) > 0);   // ada pesanan pada hari itu
    dows.push(cur.getDay());
    cur.setDate(cur.getDate() + 1);
  }

  // Hari kosong beruntun (>= MISSING_RUN) = data hilang.
  var missing = new Array(labels.length).fill(false);
  var runs = [];
  var i = 0;
  while(i < labels.length){
    if(active[i]){ i++; continue; }
    var j = i;
    while(j < labels.length && !active[j]) j++;
    if(j - i >= FORECAST_CFG.MISSING_RUN){
      for(var q = i; q < j; q++) missing[q] = true;
      runs.push({ from: labels[i], to: labels[j - 1], len: j - i });
    }
    i = j;
  }
  var missingDays = missing.filter(Boolean).length;
  return {
    metric: metric, labels: labels, values: values, missing: missing, dows: dows,
    span: labels.length, validDays: labels.length - missingDays, missingDays: missingDays, missingRuns: runs
  };
}

/* ---------- Pencocokan model pada data [0, end) ---------- */
function fitForecast(series, end){
  var v = series.values, miss = series.missing, dw = series.dows;
  var C = FORECAST_CFG;
  var sum = 0, cnt = 0, i;
  var byDow = [0,0,0,0,0,0,0], nDow = [0,0,0,0,0,0,0];
  for(i = 0; i < end; i++){
    if(miss[i]) continue;
    sum += v[i]; cnt++;
    byDow[dw[i]] += v[i]; nDow[dw[i]]++;
  }
  var mean = cnt ? sum / cnt : 0;

  var factors = [1,1,1,1,1,1,1];
  var useDow = cnt >= C.DOW_MIN_DAYS && mean > 0;
  if(useDow){
    var raw = [], rawSum = 0, d;
    for(d = 0; d < 7; d++){
      raw[d] = nDow[d] >= C.DOW_MIN_OBS ? (byDow[d] / nDow[d]) / mean : 1;
      rawSum += raw[d];
    }
    var avg = rawSum / 7;
    for(d = 0; d < 7; d++) factors[d] = raw[d] / avg;   // rata-rata faktor = 1
  }

  // Level terbaru: rata-rata nilai ternormalkan dari LEVEL_DAYS hari valid terakhir.
  var lvSum = 0, lvN = 0;
  for(i = end - 1; i >= 0 && lvN < C.LEVEL_DAYS; i--){
    if(miss[i]) continue;
    var f = factors[dw[i]];
    if(f <= 0) continue;           // hari yang selalu nol (mis. toko libur) tak informatif untuk level
    lvSum += v[i] / f; lvN++;
  }
  var level = lvN ? lvSum / lvN : mean;

  // Tren historis (hanya untuk label "arah tren"; TIDAK dipakai memperpanjang prediksi).
  // Regresi pada nilai yang sudah dinormalkan, hanya pada hari valid.
  var n = 0, sx = 0, sy = 0, sxy = 0, sxx = 0;
  for(i = 0; i < end; i++){
    if(miss[i]) continue;
    var ff = factors[dw[i]];
    if(ff <= 0) continue;
    var y = v[i] / ff;
    n++; sx += i; sy += y; sxy += i * y; sxx += i * i;
  }
  var denom = n * sxx - sx * sx;
  var slope = (n >= 2 && denom !== 0) ? (n * sxy - sx * sy) / denom : 0;
  var intercept = n ? (sy - slope * sx) / n : 0;

  return { end: end, validDays: cnt, mean: mean, useDow: useDow, factors: factors, level: level, reg: { slope: slope, intercept: intercept } };
}

function predictForecast(fit, dow){
  return Math.max(0, fit.level * fit.factors[dow]);
}

function quantileSorted(sorted, q){
  if(!sorted.length) return null;
  var pos = (sorted.length - 1) * q;
  var lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/* ---------- Backtest bergulir ---------- */
function rollingBacktest(series, horizon){
  var C = FORECAST_CFG;
  var n = series.values.length;
  var starts = [];
  for(var ts = n - horizon; ts >= C.EVAL_MIN_TRAIN && starts.length < C.EVAL_MAX_FOLDS; ts -= C.EVAL_STRIDE) starts.push(ts);
  starts.reverse();

  var folds = [], errors = [];
  starts.forEach(function(ts){
    var fit = fitForecast(series, ts);
    if(fit.validDays < 7) return;
    var f = { from: series.labels[ts], to: series.labels[ts + horizon - 1], trainDays: ts, n: 0,
              absErr: 0, sqErr: 0, sumAct: 0, baseAbs: 0, baseSq: 0 };
    for(var j = 0; j < horizon; j++){
      var i = ts + j;
      if(series.missing[i]) continue;       // hari data hilang tidak dinilai
      var actual = series.values[i];
      var e = actual - predictForecast(fit, series.dows[i]);
      var eb = actual - fit.mean;           // pembanding: rata-rata biasa data latih
      f.n++; f.sumAct += actual;
      f.absErr += Math.abs(e); f.sqErr += e * e;
      f.baseAbs += Math.abs(eb); f.baseSq += eb * eb;
      errors.push(e);
    }
    if(!f.n) return;
    f.wape = f.sumAct > 0 ? f.absErr / f.sumAct * 100 : null;
    f.baseWape = f.sumAct > 0 ? f.baseAbs / f.sumAct * 100 : null;
    f.improvement = (f.wape !== null && f.baseWape > 0) ? (f.baseWape - f.wape) / f.baseWape * 100 : null;
    folds.push(f);
  });

  if(!folds.length) return { ok: false, horizon: horizon, folds: [], errors: [] };

  var N = 0, absE = 0, sqE = 0, act = 0, bAbs = 0, bSq = 0;
  folds.forEach(function(f){ N += f.n; absE += f.absErr; sqE += f.sqErr; act += f.sumAct; bAbs += f.baseAbs; bSq += f.baseSq; });
  var wape = act > 0 ? absE / act * 100 : null;
  var baseWape = act > 0 ? bAbs / act * 100 : null;
  return {
    ok: true, horizon: horizon, folds: folds, errors: errors, points: N,
    mae: absE / N, rmse: Math.sqrt(sqE / N),
    baseMae: bAbs / N, baseRmse: Math.sqrt(bSq / N),
    wape: wape, baseWape: baseWape,
    improvement: (wape !== null && baseWape > 0) ? (baseWape - wape) / baseWape * 100 : null
  };
}

/* Pita dari galat backtest (persentil 10-90). Selalu memuat titik prediksi (lo <= 0 <= hi). */
function bandFromBacktest(bt){
  if(!bt || !bt.ok || bt.errors.length < FORECAST_CFG.BAND_MIN_POINTS) return null;
  var s = bt.errors.slice().sort(function(a, b){ return a - b; });
  return {
    lo: Math.min(0, quantileSorted(s, FORECAST_CFG.BAND_LO)),
    hi: Math.max(0, quantileSorted(s, FORECAST_CFG.BAND_HI)),
    n: s.length
  };
}

/* ---------- Rencana forecasting lengkap ---------- */
function planForecast(series, requestedHorizon){
  var C = FORECAST_CFG;
  var n = series.values.length;
  var warnings = [];

  var cap = n < C.WARN_DAYS ? C.SHORT_CAP : Math.min(30, n - C.EVAL_MIN_TRAIN);
  var horizon = Math.max(1, Math.min(requestedHorizon, cap));
  var capped = horizon < requestedHorizon;

  var hasEnoughData = series.validDays >= C.MIN_DAYS;
  var fit = fitForecast(series, n);
  var avgDaily = series.validDays ? series.values.reduce(function(a, b, i){ return series.missing[i] ? a : a + b; }, 0) / series.validDays : 0;

  var model = {
    series: series, fit: fit, reg: fit.reg, avgDaily: avgDaily,
    actualDays: n, validDays: series.validDays, hasEnoughData: hasEnoughData,
    useDow: fit.useDow, factors: fit.factors, level: fit.level
  };

  if(n > 0 && n < C.WARN_DAYS){
    warnings.push('Data hanya mencakup ' + n + ' hari (kurang dari 4 minggu): horizon dibatasi maksimal ' + C.SHORT_CAP + ' hari, dan hasil prediksi belum andal.' +
      (fit.useDow ? '' : ' Pola hari dalam seminggu belum dipakai karena butuh minimal ' + C.DOW_MIN_DAYS + ' hari data valid.'));
  } else if(capped){
    warnings.push('Horizon ' + requestedHorizon + ' hari dibatasi menjadi ' + horizon + ' hari: dengan data ' + n + ' hari, horizon lebih panjang tidak menyisakan minimal ' + C.EVAL_MIN_TRAIN + ' hari data latih untuk diuji lewat backtest.');
  }
  if(series.missingDays > 0){
    warnings.push(series.missingDays + ' hari (' + series.missingRuns.length + ' rentang kosong beruntun \u2265 ' + C.MISSING_RUN + ' hari) diperlakukan sebagai data hilang, bukan penjualan nol.');
  }

  var future = [];
  var backtest = { ok: false, horizon: horizon, folds: [], errors: [] };
  var band = null;
  if(hasEnoughData){
    backtest = rollingBacktest(series, horizon);
    band = bandFromBacktest(backtest);
    var last = series.labels[n - 1];
    var lastDow = series.dows[n - 1];
    for(var j = 0; j < horizon; j++){
      var pred = predictForecast(fit, (lastDow + 1 + j) % 7);
      future.push({
        label: addDaysKey(last, j + 1), pred: pred,
        lower: band ? Math.max(0, pred + band.lo) : null,
        upper: band ? pred + band.hi : null
      });
    }
  }

  return {
    metric: series.metric, series: series, model: model, hasEnoughData: hasEnoughData,
    requestedHorizon: requestedHorizon, horizon: horizon, cap: cap, capped: capped,
    future: future, backtest: backtest, band: band, warnings: warnings
  };
}
