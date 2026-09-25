"use strict";

/* ---------------- Mode Perbandingan: pilih ≥2 dataset, lihat metrik & tren berdampingan ---------------- */
var compareRecordsCache = {}; // datasetId -> records (cache supaya tidak fetch ulang tiap klik)

function computeDatasetSummary(records){
  var orders = uniqueOrders(records);
  var completed = orders.filter(function(o){ return /selesai|complete|delivered/i.test(o.status); });
  var revenueBase = completed.length ? completed : orders;
  var totalRevenue = revenueBase.reduce(function(s,o){ return s + o.total_payment; }, 0);
  var totalOrders = orders.length;
  var avgOrder = revenueBase.length ? totalRevenue / revenueBase.length : 0;
  var byDay = groupByDay(revenueBase);
  var days = Object.keys(byDay).sort();

  var revenueBaseIds = {};
  revenueBase.forEach(function(o){ revenueBaseIds[o.order_id] = true; });
  var byProduct = {};
  records.forEach(function(r){
    if(!revenueBaseIds[r.order_id]) return;
    byProduct[r.product] = (byProduct[r.product] || 0) + r.subtotal;
  });
  var topProduct = '—', topProductRevenue = 0;
  Object.keys(byProduct).forEach(function(p){
    if(byProduct[p] > topProductRevenue){ topProductRevenue = byProduct[p]; topProduct = p; }
  });

  var mid = Math.floor(days.length / 2);
  var firstHalf = days.slice(0, mid).reduce(function(s,k){ return s + byDay[k]; }, 0);
  var secondHalf = days.slice(mid).reduce(function(s,k){ return s + byDay[k]; }, 0);
  var growth = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf * 100) : null;

  return {
    totalRevenue: totalRevenue, totalOrders: totalOrders, avgOrder: avgOrder,
    topProduct: topProduct, topProductRevenue: topProductRevenue,
    days: days, byDay: byDay, growth: growth
  };
}

function renderComparePicker(){
  var el = document.getElementById('comparePickerList');
  if(!el) return;
  if(!state.datasets.length){
    el.innerHTML = '<div class="dataset-empty">Belum ada dataset untuk dibandingkan. Tambahkan minimal dua dataset terlebih dahulu.</div>';
    return;
  }
  var checkedBefore = {};
  Array.prototype.slice.call(el.querySelectorAll('input[type="checkbox"]:checked')).forEach(function(c){ checkedBefore[c.value] = true; });
  el.innerHTML = state.datasets.map(function(ds){
    var checked = checkedBefore[ds.id] ? ' checked' : '';
    return '<label class="compare-check-row"><input type="checkbox" value="' + ds.id + '"' + checked + '>' +
      '<span class="name">' + escapeHtml(ds.name) + '</span>' +
      '<span class="meta">' + (ds.row_count || 0).toLocaleString('id-ID') + ' baris</span></label>';
  }).join('');
}

(function(){
  var runBtn = document.getElementById('btnRunCompare');
  if(!runBtn) return;
  var originalLabel = runBtn.textContent;

  runBtn.addEventListener('click', function(){
    var checked = Array.prototype.slice.call(document.querySelectorAll('#comparePickerList input[type="checkbox"]:checked'));
    var ids = checked.map(function(c){ return parseInt(c.value, 10); });
    var emptyEl = document.getElementById('compareEmpty');
    var resultsEl = document.getElementById('compareResults');
    if(ids.length < 2){
      if(emptyEl){ emptyEl.style.display = ''; emptyEl.textContent = 'Pilih minimal 2 dataset untuk dibandingkan.'; }
      if(resultsEl) resultsEl.style.display = 'none';
      return;
    }
    if(emptyEl) emptyEl.style.display = 'none';
    runBtn.disabled = true;
    runBtn.textContent = 'Memuat data…';
    Promise.all(ids.map(function(id){
      if(compareRecordsCache[id]) return Promise.resolve(compareRecordsCache[id]);
      return Api.orders.load(id).then(function(res){ compareRecordsCache[id] = res.records; return res.records; });
    })).then(function(recordsList){
      renderCompareResults(ids, recordsList);
    }).catch(function(err){
      if(emptyEl){ emptyEl.style.display = ''; emptyEl.textContent = 'Gagal memuat data: ' + err.message; }
      if(resultsEl) resultsEl.style.display = 'none';
    }).then(function(){
      runBtn.disabled = false;
      runBtn.textContent = originalLabel;
    });
  });
})();

function renderCompareResults(ids, recordsList){
  var resultsEl = document.getElementById('compareResults');
  var cardsEl = document.getElementById('compareCards');
  var tableBodyEl = document.getElementById('compareTableBody');
  if(resultsEl) resultsEl.style.display = '';

  var palette = ['#2F6F4E','#3E7CB1','#C9862B','#9B5DE5','#E4572E','#118AB2','#EF476F','#06D6A0'];
  var summaries = ids.map(function(id, i){
    var ds = null;
    for(var j=0;j<state.datasets.length;j++){ if(state.datasets[j].id === id){ ds = state.datasets[j]; break; } }
    var s = computeDatasetSummary(recordsList[i]);
    s.name = ds ? ds.name : ('Dataset ' + id);
    s.color = palette[i % palette.length];
    return s;
  });

  if(cardsEl){
    cardsEl.innerHTML = summaries.map(function(s){
      return '<div class="compare-card" style="border-left-color:' + s.color + '">' +
        '<h4>' + escapeHtml(s.name) + '</h4>' +
        '<div class="row"><span>Total pendapatan</span><span class="v">' + idr(s.totalRevenue) + '</span></div>' +
        '<div class="row"><span>Total pesanan</span><span class="v">' + s.totalOrders.toLocaleString('id-ID') + '</span></div>' +
        '<div class="row"><span>Rata-rata nilai pesanan</span><span class="v">' + idr(s.avgOrder) + '</span></div>' +
        '<div class="row"><span>Produk terlaris</span><span class="v">' + escapeHtml(s.topProduct) + '</span></div>' +
        '<div class="row"><span>Tren paruh kedua vs pertama</span><span class="v">' + (s.growth === null ? '—' : ((s.growth >= 0 ? '▲ ' : '▼ ') + Math.abs(s.growth).toFixed(1) + '%')) + '</span></div>' +
      '</div>';
    }).join('');
  }

  if(tableBodyEl){
    tableBodyEl.innerHTML = summaries.map(function(s){
      return '<tr><td>' + escapeHtml(s.name) + '</td><td class="tabular">' + idr(s.totalRevenue) + '</td><td class="tabular">' + s.totalOrders.toLocaleString('id-ID') + '</td><td class="tabular">' + idr(s.avgOrder) + '</td><td>' + escapeHtml(s.topProduct) + '</td></tr>';
    }).join('');
  }

  renderCompareChart(summaries);
}

function renderCompareChart(summaries){
  var canvas = document.getElementById('compareChart');
  if(!canvas || typeof Chart === 'undefined') return;
  var allDays = {};
  summaries.forEach(function(s){ s.days.forEach(function(d){ allDays[d] = true; }); });
  var axis = Object.keys(allDays).sort();
  var datasets = summaries.map(function(s){
    return {
      label: s.name,
      data: axis.map(function(d){ return s.byDay[d] || 0; }),
      borderColor: s.color,
      backgroundColor: s.color,
      tension: 0.25,
      pointRadius: 0,
      borderWidth: 2
    };
  });
  if(charts.compare) charts.compare.destroy();
  charts.compare = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: axis.map(fmtDayShort), datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, position: 'bottom' } },
      scales: { y: { ticks: { callback: function(v){ return idrShort(v); } } } }
    }
  });
}
