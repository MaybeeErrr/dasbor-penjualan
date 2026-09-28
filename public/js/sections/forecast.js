"use strict";

/* ---------------- Mesin forecasting ----------------
   Kumpulan fungsi murni (tanpa DOM) yang dipakai halaman Forecasting, Model Evaluation,
   dan Perbandingan Dataset:
   - 4 model: rata-rata 7 hari terakhir (pembanding/naive), Exponential Smoothing,
     regresi linier, regresi linier + faktor hari dalam minggu.
   - Rolling backtest (expanding window) untuk memilih model & mengukur MAE/RMSE/MAPE.
   - Rentang skenario rendah-tinggi dari persentil 10-90 galat backtest.
   - Indikator keandalan berdasarkan panjang data & hasil backtest.
   - Risiko pelanggan tidak membeli lagi (heuristik jeda pembelian).
   Argumen `values` = deret harian (array angka), `dow0` = hari dalam minggu hari pertama (0=Minggu). */
var Forecast = (function(){
  var MODELS = [
    { key: 'naive',     name: 'Rata-rata 7 hari terakhir (pembanding)' },
    { key: 'ses',       name: 'Exponential Smoothing' },
    { key: 'linear',    name: 'Regresi linier' },
    { key: 'linearDow', name: 'Regresi linier + faktor hari' }
  ];
  var MIN_BACKTEST_DAYS = 14;  // minimal hari data agar rolling backtest bisa dijalankan
  var MAX_FOLDS = 60;          // batas jumlah titik awal backtest agar tetap ringan di peramban
  var MAX_HEVAL = 7;           // panjang prediksi per lipatan backtest
  var RELIABILITY_LABELS = ['Rendah', 'Sedang', 'Tinggi'];

  function nameOf(key){
    for(var i = 0; i < MODELS.length; i++){ if(MODELS[i].key === key) return MODELS[i].name; }
    return key;
  }
  function numAsc(a, b){ return a - b; }
  function quantile(sorted, q){
    if(!sorted.length) return 0;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function stdDev(a){
    if(!a.length) return 0;
    var m = 0, i, s = 0;
    for(i = 0; i < a.length; i++) m += a[i];
    m /= a.length;
    for(i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / a.length);
  }
  function ols(y){
    var n = y.length;
    if(n < 2) return { slope: 0, intercept: y[0] || 0 };
    var sx = 0, sy = 0, sxy = 0, sxx = 0, i;
    for(i = 0; i < n; i++){ sx += i; sy += y[i]; sxy += i * y[i]; sxx += i * i; }
    var den = (n * sxx - sx * sx) || 1;
    var slope = (n * sxy - sx * sy) / den;
    return { slope: slope, intercept: (sy - slope * sx) / n };
  }
  function flat(v, h){
    var out = [], k;
    for(k = 0; k < h; k++) out.push(Math.max(0, v));
    return out;
  }

  /* ---------- model ---------- */
  function fitNaive(train, h){
    var n = train.length, k = Math.min(7, n), s = 0, i;
    for(i = n - k; i < n; i++) s += train[i];
    return flat(k ? s / k : 0, h);
  }
  // Simple exponential smoothing; alpha dipilih dari grid 0.1-0.9 (SSE galat satu-langkah terkecil).
  function fitSES(train, h){
    var n = train.length;
    if(n < 2) return flat(train[0] || 0, h);
    var bestSse = Infinity, bestLevel = train[0], a, i;
    for(a = 0.1; a < 0.95; a += 0.1){
      var level = train[0], sse = 0;
      for(i = 1; i < n; i++){ var e = train[i] - level; sse += e * e; level += a * e; }
      if(sse < bestSse){ bestSse = sse; bestLevel = level; }
    }
    return flat(bestLevel, h);
  }
  function fitLinear(train, h){
    var r = ols(train), n = train.length, out = [], k;
    for(k = 0; k < h; k++) out.push(Math.max(0, r.slope * (n + k) + r.intercept));
    return out;
  }
  // Regresi linier + faktor hari (aditif). Faktor tiap hari = rata-rata residu tren pada hari itu,
  // dipusatkan (rata-rata 0) dan diperhalus (shrinkage) agar tidak berlebihan saat data masih singkat.
  function fitLinearDow(train, h, dow0){
    var n = train.length;
    if(n < 14) return fitLinear(train, h);
    var r = ols(train), sums = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0], i, d, k;
    for(i = 0; i < n; i++){ d = (dow0 + i) % 7; sums[d] += train[i] - (r.slope * i + r.intercept); cnt[d]++; }
    var seas = [], tot = 0, w = (n / 7) / ((n / 7) + 1);
    for(d = 0; d < 7; d++){ seas[d] = cnt[d] ? sums[d] / cnt[d] : 0; tot += seas[d]; }
    var mu = tot / 7;
    for(d = 0; d < 7; d++) seas[d] = (seas[d] - mu) * w;
    var adj = [];
    for(i = 0; i < n; i++) adj.push(train[i] - seas[(dow0 + i) % 7]);
    var r2 = ols(adj), out = [];
    for(k = 0; k < h; k++) out.push(Math.max(0, r2.slope * (n + k) + r2.intercept + seas[(dow0 + n + k) % 7]));
    return out;
  }
  var FITS = { naive: fitNaive, ses: fitSES, linear: fitLinear, linearDow: fitLinearDow };

  /* ---------- rolling backtest (expanding window) ----------
     Titik awal t bergerak dari minTrain sampai n-hEval. Pada tiap t model dilatih ulang pada
     data[0..t) lalu meramal hEval hari berikutnya; seluruh galat dikumpulkan (pooled). */
  var btCache = {}, btCacheSize = 0;
  function backtest(values, dow0){
    var n = values.length;
    if(n < MIN_BACKTEST_DAYS) return { ok: false, n: n, minNeeded: MIN_BACKTEST_DAYS };
    var sig = dow0 + ':' + values.join(',');
    if(btCache[sig]) return btCache[sig];

    var minTrain = Math.max(7, Math.ceil(n / 2));
    var hE = Math.min(MAX_HEVAL, n - minTrain);
    var count = n - hE - minTrain + 1;
    var step = Math.max(1, Math.ceil(count / MAX_FOLDS));
    var acc = {}, folds = 0, t, k;
    MODELS.forEach(function(m){ acc[m.key] = { err: [], abs: 0, sq: 0, pct: 0, pc: 0 }; });

    for(t = minTrain; t <= n - hE; t += step){
      var train = values.slice(0, t);
      folds++;
      MODELS.forEach(function(m){
        var p = FITS[m.key](train, hE, dow0), a = acc[m.key];
        for(k = 0; k < hE; k++){
          var act = values[t + k], e = act - p[k];
          a.err.push(e); a.abs += Math.abs(e); a.sq += e * e;
          if(act !== 0){ a.pct += Math.abs(e / act); a.pc++; }
        }
      });
    }

    var models = {}, best = null;
    MODELS.forEach(function(m){
      var a = acc[m.key], pts = a.err.length;
      models[m.key] = {
        points: pts, mae: a.abs / pts, rmse: Math.sqrt(a.sq / pts),
        mape: a.pc ? a.pct / a.pc * 100 : null, mapeSkipped: pts - a.pc, errors: a.err
      };
      // model yang lebih kompleks harus unggul >2% (MAE) agar menggantikan yang lebih sederhana
      if(best === null || models[m.key].mae < models[best].mae * 0.98) best = m.key;
    });

    var res = { ok: true, n: n, minTrain: minTrain, hEval: hE, folds: folds, step: step, models: models, best: best };
    if(btCacheSize > 40){ btCache = {}; btCacheSize = 0; }
    btCache[sig] = res; btCacheSize++;
    return res;
  }

  function resolveKey(modelKey, bt, n){
    if(modelKey && modelKey !== 'auto' && FITS[modelKey]) return modelKey;
    if(bt && bt.ok) return bt.best;
    return 'naive'; // data < 14 hari: rata-rata terkini lebih stabil daripada ekstrapolasi garis tren
  }

  function evaluate(values, dow0, modelKey){
    var n = values.length, bt = backtest(values, dow0);
    if(!bt.ok) return { ok: false, n: n, minNeeded: bt.minNeeded };
    var key = resolveKey(modelKey, bt, n), m = bt.models[key], nv = bt.models.naive;
    return {
      ok: true, n: n, folds: bt.folds, hEval: bt.hEval, minTrain: bt.minTrain, points: m.points,
      mae: m.mae, rmse: m.rmse, mape: m.mape, mapeSkipped: m.mapeSkipped,
      modelKey: key, modelName: nameOf(key), bestKey: bt.best,
      table: MODELS.map(function(x){ var q = bt.models[x.key]; return { key: x.key, name: x.name, mae: q.mae, rmse: q.rmse, mape: q.mape }; }),
      baseline: { mae: nv.mae, rmse: nv.rmse, mape: nv.mape },
      beatsBaseline: key === 'naive' ? null : m.mae < nv.mae,
      skill: (key === 'naive' || !nv.mae) ? null : (1 - m.mae / nv.mae) * 100
    };
  }

  /* ---------- indikator keandalan ---------- */
  function reliability(n, h, ev){
    var lvl = n < 60 ? 0 : (n < 180 ? 1 : 2), reasons = [];
    if(n < 60) reasons.push('Data historis baru ' + n + ' hari, hasil kurang andal.');
    if(n < 14){
      reasons.push('Backtesting belum dapat dijalankan (minimal ' + MIN_BACKTEST_DAYS + ' hari), sehingga akurasi belum terukur.');
    } else if(ev && ev.ok){
      if(ev.mape !== null && ev.mape > 50){
        lvl = Math.max(0, lvl - 1);
        reasons.push('Galat backtesting besar (MAPE ' + ev.mape.toFixed(0) + '%).');
      }
      if(ev.bestKey === 'naive'){
        lvl = Math.max(0, lvl - 1);
        reasons.push('Belum ada model yang lebih akurat dari rata-rata 7 hari terakhir; pola pada data masih lemah.');
      }
    }
    if(h > n / 2){
      lvl = 0;
      reasons.push('Horizon ' + h + ' hari terlalu panjang dibanding riwayat ' + n + ' hari.');
    }
    if(lvl === 2 && n < 365) reasons.push('Riwayat belum mencakup satu tahun penuh, sehingga pola musiman tahunan/hari besar belum tertangkap.');
    if(!reasons.length) reasons.push('Riwayat data dan hasil backtesting cukup memadai untuk perencanaan jangka pendek.');
    return { level: lvl, label: RELIABILITY_LABELS[lvl], reasons: reasons };
  }

  /* ---------- proyeksi + rentang skenario ---------- */
  function run(values, dow0, opts){
    opts = opts || {};
    var h = opts.horizon || 7, n = values.length;
    var bt = backtest(values, dow0), key = resolveKey(opts.modelKey, bt, n);
    var pred = FITS[key](values, h, dow0), lo, hi, hE, k;

    if(bt.ok){
      var errs = bt.models[key].errors.slice().sort(numAsc);
      lo = Math.min(0, quantile(errs, 0.1));   // skenario rendah = persentil 10 galat
      hi = Math.max(0, quantile(errs, 0.9));   // skenario tinggi = persentil 90 galat
      hE = bt.hEval;
    } else {
      var sd = stdDev(values) * 1.28;          // data terlalu singkat: pakai sebaran data (~80%)
      lo = -sd; hi = sd; hE = h;
    }

    var low = [], high = [], total = 0, totalLow = 0, totalHigh = 0;
    for(k = 0; k < h; k++){
      var wk = (k + 1 <= hE) ? 1 : Math.sqrt((k + 1) / hE);  // melebar untuk langkah > panjang backtest
      var l = Math.max(0, pred[k] + lo * wk), u = Math.max(pred[k], pred[k] + hi * wk);
      low.push(l); high.push(u);
      total += pred[k]; totalLow += l; totalHigh += u;
    }
    var ev = evaluate(values, dow0, key);
    return {
      n: n, horizon: h, modelKey: key, modelName: nameOf(key),
      auto: !opts.modelKey || opts.modelKey === 'auto',
      pred: pred, low: low, high: high, total: total, totalLow: totalLow, totalHigh: totalHigh,
      evalRes: ev, reliability: reliability(n, h, ev)
    };
  }

  /* ---------- risiko pelanggan tidak membeli lagi ----------
     orders: [{id, day, value}] (day = nomor hari), refDay = hari terakhir pada data.
     Jeda pembelian yang diharapkan = rata-rata jeda antar-pesanan pelanggan itu sendiri (jika >=2 pesanan
     pada hari berbeda), selain itu median jeda seluruh pelanggan repeat. Skor = hari sejak pembelian
     terakhir / jeda yang diharapkan. Skor >=3 tinggi, >=1,5 sedang. Ini heuristik, bukan model probabilistik. */
  function churnRisk(orders, refDay){
    var by = {}, gaps = [];
    orders.forEach(function(o){
      var c = by[o.id] || (by[o.id] = { id: o.id, days: [], value: 0 });
      c.days.push(o.day); c.value += o.value;
    });
    var list = Object.keys(by).map(function(k){ return by[k]; });
    list.forEach(function(c){
      c.days.sort(numAsc);
      c.orders = c.days.length; c.last = c.days[c.days.length - 1]; c.gaps = [];
      for(var i = 1; i < c.days.length; i++){
        var g = c.days[i] - c.days[i - 1];
        if(g > 0){ c.gaps.push(g); gaps.push(g); }
      }
    });
    gaps.sort(numAsc);
    var med = gaps.length ? quantile(gaps, 0.5) : null;
    list.forEach(function(c){
      c.recency = Math.max(0, refDay - c.last);
      var own = null;
      if(c.gaps.length){ var s = 0; c.gaps.forEach(function(g){ s += g; }); own = s / c.gaps.length; }
      c.expected = own !== null ? own : med;
      c.basis = own !== null ? 'own' : 'global';
      if(c.expected === null){ c.ratio = null; c.level = 'unknown'; }
      else {
        c.ratio = c.recency / Math.max(c.expected, 1);
        c.level = c.ratio >= 3 ? 'high' : (c.ratio >= 1.5 ? 'mid' : 'low');
      }
    });
    return { list: list, medianGap: med, repeaters: list.filter(function(c){ return c.gaps.length > 0; }).length };
  }

  return { MODELS: MODELS, name: nameOf, backtest: backtest, evaluate: evaluate, run: run, resolveKey: resolveKey, churnRisk: churnRisk, quantile: quantile };
})();
