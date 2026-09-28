"use strict";

/* ---------------- Cakupan prediksi tambahan (halaman Forecasting) ----------------
   1. Prediksi unit per produk (untuk perencanaan stok), model dipilih otomatis per produk.
   2. Pelanggan yang berpotensi tidak membeli lagi (heuristik jeda pembelian, lihat Forecast.churnRisk). */
var PF_TOP_N = 8;

function fcNum(v){ return Math.round(v).toLocaleString('id-ID'); }
function fcDayNum(d){ return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }

function renderForecastExtras(revModel){
  renderProductForecast(revModel);
  renderChurnRisk();
}

function renderProductForecast(revModel){
  var body = document.getElementById('pfBody');
  var empty = document.getElementById('pfEmpty');
  var noteEl = document.getElementById('pfNote');
  if(!body) return;
  var labels = revModel.series.labels;
  if(!revModel.hasEnoughData || !labels.length){
    body.innerHTML = '';
    empty.style.display = ''; empty.textContent = 'Prediksi per produk memerlukan minimal ' + MIN_FORECAST_DAYS + ' hari data transaksi.';
    if(noteEl) noteEl.textContent = '';
    return;
  }
  var idx = {};
  labels.forEach(function(l, i){ idx[l] = i; });
  var recs = state.filtered.filter(function(r){ return /selesai|complete|delivered/i.test(r.status); });
  if(!recs.length) recs = state.filtered;

  var prods = {};
  recs.forEach(function(r){
    var d = toDate(r.created_at);
    if(!d) return;
    var i = idx[dayKey(d)];
    if(i === undefined) return;
    var name = r.product || 'Tidak diketahui';
    var p = prods[name] || (prods[name] = { name: name, units: 0, values: new Array(labels.length).fill(0) });
    var q = r.qty > 0 ? r.qty : 1;
    p.values[i] += q; p.units += q;
  });
  var list = Object.keys(prods).map(function(k){ return prods[k]; }).sort(function(a, b){ return b.units - a.units; }).slice(0, PF_TOP_N);
  if(!list.length){
    body.innerHTML = '';
    empty.style.display = ''; empty.textContent = 'Belum ada data produk pada filter yang aktif.';
    return;
  }
  empty.style.display = 'none';
  var h = state.horizon;
  body.innerHTML = list.map(function(p){
    var run = Forecast.run(p.values, revModel.dow0, { horizon: h, modelKey: 'auto' });
    var avgHist = p.units / labels.length;
    var lvl = run.reliability.level;
    return '<tr><td title="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</td>' +
      '<td class="tabular">' + avgHist.toFixed(1).replace('.', ',') + '</td>' +
      '<td class="tabular"><b>' + fcNum(run.total) + '</b></td>' +
      '<td class="tabular">' + fcNum(run.totalLow) + ' – ' + fcNum(run.totalHigh) + '</td>' +
      '<td class="tabular"><b>' + fcNum(Math.ceil(run.totalHigh)) + '</b></td>' +
      '<td>' + escapeHtml(run.modelName.replace(' (pembanding)', '')) + '</td>' +
      '<td><span class="fc-badge lvl-' + lvl + '">' + run.reliability.label + '</span></td></tr>';
  }).join('');
  if(noteEl) noteEl.textContent = 'Unit per hari pada tiap produk sering nol, sehingga galatnya besar. "Stok aman" = skenario tinggi (konservatif) untuk ' + h + ' hari ke depan; model dipilih otomatis per produk lewat rolling backtest.';
}

function renderChurnRisk(){
  var sumEl = document.getElementById('crSummary');
  var body = document.getElementById('crBody');
  var empty = document.getElementById('crEmpty');
  var wrap = document.getElementById('crTableWrap');
  if(!body) return;
  function msg(t){ empty.style.display = ''; empty.textContent = t; body.innerHTML = ''; sumEl.innerHTML = ''; wrap.style.display = 'none'; }

  var hasCol = state.records.some(function(r){ return r.customer_id && String(r.customer_id).trim() !== ''; });
  if(!hasCol){ msg('Analisis ini membutuhkan kolom identitas pelanggan pada data.'); return; }
  var orders = uniqueOrders(state.filtered).filter(function(o){
    return /selesai|complete|delivered/i.test(o.status) && o.customer_id && String(o.customer_id).trim() !== '';
  });
  var rows = [], refDay = null;
  orders.forEach(function(o){
    var d = toDate(o.created_at);
    if(!d) return;
    var dn = fcDayNum(d);
    if(refDay === null || dn > refDay) refDay = dn;
    rows.push({ id: String(o.customer_id).trim(), day: dn, value: o.total_payment });
  });
  if(!rows.length){ msg('Belum ada pesanan selesai dengan identitas pelanggan pada filter yang aktif.'); return; }

  var res = Forecast.churnRisk(rows, refDay);
  if(res.medianGap === null){
    msg('Belum ada pelanggan yang membeli ulang pada hari berbeda, sehingga jeda pembelian yang wajar belum bisa diperkirakan.');
    return;
  }
  empty.style.display = 'none'; wrap.style.display = '';
  var counts = { high: 0, mid: 0, low: 0 };
  res.list.forEach(function(c){ if(counts[c.level] !== undefined) counts[c.level]++; });
  sumEl.innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Risiko tinggi</div><div class="kpi-value tabular">' + counts.high + '</div><div class="kpi-delta">belum kembali ≥ 3× jeda beli biasa</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Risiko sedang</div><div class="kpi-value tabular">' + counts.mid + '</div><div class="kpi-delta">belum kembali 1,5–3× jeda beli biasa</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Risiko rendah</div><div class="kpi-value tabular">' + counts.low + '</div><div class="kpi-delta">masih dalam pola pembelian</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Median jeda beli ulang</div><div class="kpi-value tabular">' + res.medianGap.toFixed(0) + ' hari</div><div class="kpi-delta">dari ' + res.repeaters + ' pelanggan repeat</div></div>';

  var rank = { high: 0, mid: 1, low: 2 };
  var top = res.list.filter(function(c){ return c.level === 'high' || c.level === 'mid'; })
    .sort(function(a, b){ return rank[a.level] - rank[b.level] || b.value - a.value; }).slice(0, 10);
  var lvlTxt = { high: 'Tinggi', mid: 'Sedang' };
  body.innerHTML = top.length ? top.map(function(c){
    return '<tr><td>' + escapeHtml(c.id) + '</td><td class="tabular">' + c.orders + '</td>' +
      '<td class="tabular">' + idr(c.value) + '</td>' +
      '<td class="tabular">' + c.recency + ' hari lalu</td>' +
      '<td class="tabular">' + c.expected.toFixed(0) + ' hari' + (c.basis === 'global' ? ' <span class="fc-muted">(median umum)</span>' : '') + '</td>' +
      '<td class="tabular">' + c.ratio.toFixed(1).replace('.', ',') + '×</td>' +
      '<td><span class="fc-badge risk-' + c.level + '">' + lvlTxt[c.level] + '</span></td></tr>';
  }).join('') : '<tr><td colspan="7" class="fc-muted">Tidak ada pelanggan dengan risiko sedang/tinggi pada filter ini.</td></tr>';
}
