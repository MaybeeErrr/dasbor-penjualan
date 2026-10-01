"use strict";

/* ---------------- Analisis Penjualan ----------------
   Semua angka dihitung dari data yang diunggah pada filter yang aktif.
   Aturan "pesanan yang dihitung" memakai OrderStatus.counted() yang sama
   dengan Dashboard Utama, sehingga totalnya konsisten antar-halaman. */
var SALES_DAY_SHORT = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
var SALES_DAY_LONG = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
var SALES_DOW_ORDER = [1,2,3,4,5,6,0];
var SALES_PALETTE = ['#2F6F4E','#C98A22','#2E6AA8','#B0473B','#8FBFA3','#E2C68C','#5C6F64','#D69C93'];
var salesTrendMetric = 'revenue';   // 'revenue' | 'orders'
var salesProductMetric = 'revenue'; // 'revenue' | 'qty'

function salesPct(v, total, digits){ return total ? (v / total * 100).toFixed(digits === undefined ? 0 : digits) : '0'; }
function salesTopN(map, n){
  return Object.keys(map).map(function(k){ return { name:k, v:map[k] }; })
    .sort(function(a,b){ return b.v - a.v; }).slice(0, n);
}
function salesCss(){
  var css = getComputedStyle(document.documentElement);
  return {
    muted: css.getPropertyValue('--ink-muted').trim(), grid: css.getPropertyValue('--chart-grid').trim(),
    brand: css.getPropertyValue('--chart-line').trim(), amber: css.getPropertyValue('--amber').trim(),
    surface: css.getPropertyValue('--surface').trim(), soft: css.getPropertyValue('--chart-line-soft').trim()
  };
}
function salesDestroy(key){ if(charts[key]){ charts[key].destroy(); charts[key] = null; } }

function computeSales(){
  var allOrders = uniqueOrders(state.filtered);
  var cancelled = allOrders.filter(function(o){ return OrderStatus.isCancelled(o.status); });
  var orders = OrderStatus.counted(allOrders);
  var lines = OrderStatus.counted(state.filtered);
  var m = { allOrders: allOrders, orders: orders, cancelled: cancelled, lines: lines };

  m.revenue = orders.reduce(function(s,o){ return s + o.total_payment; }, 0);
  m.avgOrder = orders.length ? m.revenue / orders.length : 0;
  m.qty = lines.reduce(function(s,r){ return s + (r.qty || 0); }, 0);

  // harian
  m.byDay = {};
  orders.forEach(function(o){
    var d = toDate(o.created_at); if(!d) return;
    var k = dayKey(d);
    if(!m.byDay[k]) m.byDay[k] = { revenue:0, orders:0 };
    m.byDay[k].revenue += o.total_payment; m.byDay[k].orders += 1;
  });
  var keys = Object.keys(m.byDay).sort();
  m.dayKeys = keys;
  m.activeDays = keys.length;
  m.avgPerDay = keys.length ? m.revenue / keys.length : 0;
  m.bestDay = keys.reduce(function(b,k){ return (!b || m.byDay[k].revenue > m.byDay[b].revenue) ? k : b; }, null);

  // hari dalam seminggu & jam
  m.dow = [0,1,2,3,4,5,6].map(function(){ return { revenue:0, orders:0 }; });
  m.hour = []; for(var h=0;h<24;h++) m.hour.push({ revenue:0, orders:0 });
  var hoursSeen = {};
  orders.forEach(function(o){
    var d = toDate(o.created_at); if(!d) return;
    m.dow[d.getDay()].revenue += o.total_payment; m.dow[d.getDay()].orders += 1;
    m.hour[d.getHours()].revenue += o.total_payment; m.hour[d.getHours()].orders += 1;
    hoursSeen[d.getHours()] = true;
  });
  m.hasHours = Object.keys(hoursSeen).length > 1;

  // produk
  var pRev = {}, pQty = {};
  lines.forEach(function(r){
    var key = r.product || 'Tidak diketahui';
    pRev[key] = (pRev[key] || 0) + (r.subtotal || 0);
    pQty[key] = (pQty[key] || 0) + (r.qty || 0);
  });
  m.pRev = pRev; m.pQty = pQty;
  m.productCount = Object.keys(pRev).length;
  m.productRevTotal = Object.keys(pRev).reduce(function(s,k){ return s + pRev[k]; }, 0);

  // pembayaran, status, wilayah
  m.pay = {}; allOrders.forEach(function(o){ var k = o.payment_method || 'Tidak diketahui'; m.pay[k] = (m.pay[k]||0) + 1; });
  m.status = {}; allOrders.forEach(function(o){ var k = o.status || 'Tidak diketahui'; m.status[k] = (m.status[k]||0) + 1; });
  m.prov = {}; m.city = {};
  allOrders.forEach(function(o){
    var p = o.province || 'Tidak diketahui'; m.prov[p] = (m.prov[p]||0) + 1;
    if(o.city){ m.city[o.city] = (m.city[o.city]||0) + 1; }
  });
  return m;
}

function salesRankRows(arr, total, valueFmt, color, sub){
  var max = arr.length ? arr[0].v : 1;
  return arr.map(function(p, i){
    var w = Math.max(3, p.v / (max || 1) * 100);
    return '<div class="sl-rank-row"><span class="sl-rank-no tabular">'+(i+1)+'</span>'+
      '<div class="sl-rank-main"><div class="sl-rank-name" title="'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</div>'+
      '<div class="sl-rank-bar"><div style="width:'+w+'%; background:'+color+';"></div></div>'+
      (sub ? '<div class="sl-rank-sub">'+sub(p)+'</div>' : '')+'</div>'+
      '<div class="sl-rank-val tabular"><b>'+valueFmt(p.v)+'</b><span>'+salesPct(p.v, total)+'%</span></div></div>';
  }).join('');
}

function salesLegend(entries, total, colors){
  return entries.map(function(e, i){
    return '<div class="sl-leg-row"><i style="background:'+colors[i % colors.length]+'"></i><span class="sl-leg-name" title="'+escapeHtml(e.name)+'">'+escapeHtml(e.name)+'</span>'+
      '<span class="sl-leg-val tabular"><b>'+e.v.toLocaleString('id-ID')+'</b> <em>'+salesPct(e.v, total)+'%</em></span></div>';
  }).join('');
}

function renderSalesAnalysis(){
  var m = computeSales();
  var emptyEl = document.getElementById('salesEmpty');
  var contentEl = document.getElementById('salesContent');
  if(!m.allOrders.length){
    contentEl.classList.add('hidden'); emptyEl.classList.add('show');
    ['salesTrend','salesDow','salesHour','salesPay','salesStatus','salesValue'].forEach(salesDestroy);
    return;
  }
  emptyEl.classList.remove('show'); contentEl.classList.remove('hidden');
  var c = salesCss();

  // ---------- Ringkasan: kesimpulan + KPI ----------
  var cancelRate = m.allOrders.length ? m.cancelled.length / m.allOrders.length * 100 : 0;
  var topDow = SALES_DOW_ORDER.reduce(function(b,d){ return m.dow[d].revenue > (b === null ? -1 : m.dow[b].revenue) ? d : b; }, null);
  var topProd = salesTopN(m.pRev, 1)[0];
  var topProv = salesTopN(m.prov, 1)[0];
  var head = '<b>' + m.orders.length.toLocaleString('id-ID') + ' pesanan</b> menghasilkan <b>' + idr(m.revenue) + '</b>' +
    (m.activeDays ? ' selama <b>' + m.activeDays + ' hari</b> transaksi' : '') + '.';
  if(topProd) head += ' Produk terlaris: <b>' + escapeHtml(topProd.name.length > 60 ? topProd.name.slice(0,58) + '…' : topProd.name) + '</b>.';
  if(m.bestDay) head += ' Hari dengan pendapatan tertinggi: <b>' + fmtDayShort(m.bestDay) + '</b> (' + idr(m.byDay[m.bestDay].revenue) + ').';
  document.getElementById('salesHeadline').innerHTML = head;

  var kpis = [
    { label:'Total pendapatan', value: idr(m.revenue), delta: 'dari ' + m.orders.length.toLocaleString('id-ID') + ' pesanan yang dihitung' },
    { label:'Rata-rata nilai pesanan', value: idr(m.avgOrder), delta: 'per pesanan' },
    { label:'Pendapatan per hari', value: idr(m.avgPerDay), delta: 'rata-rata pada ' + m.activeDays + ' hari transaksi' },
    { label:'Produk terjual', value: m.qty.toLocaleString('id-ID'), delta: 'unit, dari ' + m.productCount.toLocaleString('id-ID') + ' jenis produk' },
    { label:'Tingkat pembatalan', value: cancelRate.toFixed(1) + '%', delta: m.cancelled.length.toLocaleString('id-ID') + ' dari ' + m.allOrders.length.toLocaleString('id-ID') + ' pesanan', warn: cancelRate > 15 }
  ];
  document.getElementById('salesKpis').innerHTML = kpis.map(function(k){
    return '<div class="sl-kpi'+(k.warn?' warn':'')+'"><div class="sl-kpi-lbl">'+k.label+'</div><div class="sl-kpi-val tabular">'+k.value+'</div><div class="sl-kpi-sub">'+k.delta+'</div></div>';
  }).join('');

  // ---------- Temuan utama ----------
  var findings = [];
  if(topDow !== null && m.dow[topDow].orders){
    findings.push({ tone:'brand', title:'Hari paling ramai', text: SALES_DAY_LONG[topDow] + ' menyumbang ' + salesPct(m.dow[topDow].revenue, m.revenue) + '% pendapatan (' + m.dow[topDow].orders.toLocaleString('id-ID') + ' pesanan).' });
  }
  if(m.hasHours){
    var topH = m.hour.reduce(function(b,x,i){ return x.orders > (b === null ? -1 : m.hour[b].orders) ? i : b; }, null);
    findings.push({ tone:'blue', title:'Jam paling ramai', text: 'Pesanan terbanyak masuk sekitar pukul ' + String(topH).padStart(2,'0') + ':00–' + String(topH).padStart(2,'0') + ':59 (' + m.hour[topH].orders.toLocaleString('id-ID') + ' pesanan).' });
  }
  if(topProd && m.productRevTotal){
    var top3 = salesTopN(m.pRev, 3).reduce(function(s,p){ return s + p.v; }, 0);
    findings.push({ tone:'amber', title:'Konsentrasi produk', text: '3 produk teratas menyumbang ' + salesPct(top3, m.productRevTotal) + '% nilai penjualan produk dari ' + m.productCount.toLocaleString('id-ID') + ' jenis produk.' });
  }
  if(topProv){
    findings.push({ tone:'brand', title:'Wilayah utama', text: topProv.name + ' menjadi asal ' + salesPct(topProv.v, m.allOrders.length) + '% pesanan (' + topProv.v.toLocaleString('id-ID') + ' pesanan).' });
  }
  findings.push({ tone: cancelRate > 15 ? 'brick' : 'blue', title:'Pembatalan', text: cancelRate > 15
    ? 'Tingkat pembatalan ' + cancelRate.toFixed(1) + '% tergolong tinggi (di atas 15%); periksa penyebab pembatalan.'
    : 'Tingkat pembatalan ' + cancelRate.toFixed(1) + '%, masih di bawah batas 15%.' });
  document.getElementById('salesFindings').innerHTML = findings.map(function(f){
    return '<div class="sl-frow tone-'+f.tone+'"><i class="sl-frow-dot"></i><span class="sl-frow-title">'+f.title+'</span><span class="sl-frow-text">'+escapeHtml(f.text)+'</span></div>';
  }).join('');

  // ---------- Tren harian + rata-rata bergerak 7 hari ----------
  var labels = [], vals = [];
  if(m.dayKeys.length){
    var cur = new Date(m.dayKeys[0] + 'T00:00:00'), last = new Date(m.dayKeys[m.dayKeys.length-1] + 'T00:00:00');
    while(cur <= last){
      var k = dayKey(cur);
      labels.push(fmtDayShort(k));
      vals.push(m.byDay[k] ? m.byDay[k][salesTrendMetric] : 0);
      cur.setDate(cur.getDate() + 1);
    }
  }
  var ma = vals.map(function(_, i){
    if(i < 6) return null;
    var s = 0; for(var j=i-6;j<=i;j++) s += vals[j];
    return s / 7;
  });
  var isRev = salesTrendMetric === 'revenue';
  salesDestroy('salesTrend');
  var datasets = [{ type:'bar', label: isRev ? 'Pendapatan harian' : 'Pesanan harian', data: vals, backgroundColor: c.soft, borderColor: c.brand, borderWidth: 1, borderRadius: 3, order: 2 }];
  if(vals.length >= 7) datasets.push({ type:'line', label:'Rata-rata 7 hari', data: ma, borderColor: c.amber, backgroundColor: c.amber, borderWidth: 2.5, pointRadius: 0, tension: 0.3, spanGaps: false, order: 1 });
  charts.salesTrend = new Chart(document.getElementById('salesTrendChart').getContext('2d'), {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false },
      plugins: {
        legend: { position:'bottom', labels:{ color:c.muted, boxWidth:10, font:{size:11} } },
        tooltip: { callbacks: { label: function(it){ return it.dataset.label + ': ' + (it.parsed.y === null ? '—' : (isRev ? idr(it.parsed.y) : Math.round(it.parsed.y).toLocaleString('id-ID') + ' pesanan')); } } }
      },
      scales: {
        x: { grid:{ display:false }, ticks:{ color:c.muted, maxTicksLimit:12, maxRotation:0 } },
        y: { grid:{ color:c.grid }, beginAtZero:true, ticks:{ color:c.muted, callback:function(v){ return isRev ? idrShort(v) : v; } } }
      }
    }
  });
  document.getElementById('salesTrendNote').textContent = 'Hari tanpa pesanan ditampilkan sebagai 0. ' + (vals.length >= 7 ? 'Garis oranye meratakan 7 hari terakhir agar arah tren lebih jelas.' : 'Rata-rata 7 hari tampil bila data mencakup minimal 7 hari.');

  // ---------- Pola per hari dalam seminggu ----------
  salesDestroy('salesDow');
  var dowVals = SALES_DOW_ORDER.map(function(d){ return m.dow[d].revenue; });
  var dowMax = Math.max.apply(null, dowVals.concat([0]));
  charts.salesDow = new Chart(document.getElementById('salesDowChart').getContext('2d'), {
    type:'bar',
    data: { labels: SALES_DOW_ORDER.map(function(d){ return SALES_DAY_SHORT[d]; }), datasets:[{ data: dowVals, borderRadius:5,
      backgroundColor: dowVals.map(function(v){ return v === dowMax && v > 0 ? c.brand : c.soft; }), borderColor: c.brand, borderWidth:1 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(it){ var d = SALES_DOW_ORDER[it.dataIndex]; return idr(it.parsed.y) + ' · ' + m.dow[d].orders.toLocaleString('id-ID') + ' pesanan'; } } } },
      scales:{ x:{ grid:{display:false}, ticks:{color:c.muted} }, y:{ grid:{color:c.grid}, beginAtZero:true, ticks:{ color:c.muted, callback:function(v){ return idrShort(v); } } } } }
  });

  // ---------- Pola per jam ----------
  salesDestroy('salesHour');
  var hourWrap = document.getElementById('salesHourWrap'), hourNote = document.getElementById('salesHourNote');
  if(m.hasHours){
    hourWrap.style.display = ''; hourNote.style.display = 'none';
    var hMax = Math.max.apply(null, m.hour.map(function(x){ return x.orders; }));
    charts.salesHour = new Chart(document.getElementById('salesHourChart').getContext('2d'), {
      type:'bar',
      data: { labels: m.hour.map(function(_, i){ return String(i).padStart(2,'0'); }), datasets:[{ data: m.hour.map(function(x){ return x.orders; }), borderRadius:3,
        backgroundColor: m.hour.map(function(x){ return x.orders === hMax && hMax > 0 ? c.amber : c.soft; }), borderColor: c.amber, borderWidth:1 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ title:function(it){ return 'Pukul ' + it[0].label + ':00'; }, label:function(it){ return it.parsed.y.toLocaleString('id-ID') + ' pesanan'; } } } },
        scales:{ x:{ grid:{display:false}, ticks:{color:c.muted, maxRotation:0, autoSkip:true, maxTicksLimit:12}, title:{display:true, text:'Jam', color:c.muted, font:{size:11}} }, y:{ grid:{color:c.grid}, beginAtZero:true, ticks:{ color:c.muted, precision:0 } } } }
    });
  } else {
    hourWrap.style.display = 'none'; hourNote.style.display = '';
  }

  // ---------- Produk terlaris ----------
  var isPRev = salesProductMetric === 'revenue';
  var pTotal = isPRev ? m.productRevTotal : m.qty;
  var pArr = salesTopN(isPRev ? m.pRev : m.pQty, 10);
  document.getElementById('salesProducts').innerHTML = pArr.length ? salesRankRows(pArr, pTotal,
    function(v){ return isPRev ? idrShort(v) : v.toLocaleString('id-ID') + ' unit'; }, 'var(--brand)',
    function(p){ return isPRev ? (m.pQty[p.name] || 0).toLocaleString('id-ID') + ' unit terjual' : idrShort(m.pRev[p.name] || 0) + ' nilai penjualan'; })
    : '<div class="kpi-delta">Tidak ada data produk.</div>';
  document.getElementById('salesProductsDesc').textContent = (isPRev ? 'Diurutkan berdasarkan nilai penjualan (Subtotal Pesanan)' : 'Diurutkan berdasarkan jumlah unit terjual') + ', pesanan yang dihitung pada filter aktif. Persentase = porsi terhadap total.';

  // ---------- Metode pembayaran & status pesanan (donat + legenda) ----------
  function donut(key, canvasId, legendId, map, colorFn){
    salesDestroy(key);
    var arr = salesTopN(map, 8), total = arr.reduce(function(s,e){ return s + e.v; }, 0);
    var colors = arr.map(function(e, i){ return colorFn ? colorFn(e.name, i) : SALES_PALETTE[i % SALES_PALETTE.length]; });
    document.getElementById(legendId).innerHTML = salesLegend(arr, total, colors);
    if(!arr.length) return;
    charts[key] = new Chart(document.getElementById(canvasId).getContext('2d'), {
      type:'doughnut',
      data:{ labels: arr.map(function(e){ return e.name; }), datasets:[{ data: arr.map(function(e){ return e.v; }), backgroundColor: colors, borderColor: c.surface, borderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'64%', plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(it){ return it.label + ': ' + it.parsed.toLocaleString('id-ID') + ' pesanan (' + salesPct(it.parsed, total) + '%)'; } } } } }
    });
  }
  donut('salesPay', 'salesPayChart', 'salesPayLegend', m.pay, null);
  donut('salesStatus', 'salesStatusChart', 'salesStatusLegend', m.status, function(name, i){
    return OrderStatus.isCompleted(name) ? '#2F6F4E' : (OrderStatus.isCancelled(name) ? '#B0473B' : '#C98A22');
  });

  // ---------- Sebaran wilayah ----------
  var provArr = salesTopN(m.prov, 8), cityArr = salesTopN(m.city, 8);
  document.getElementById('salesProvinces').innerHTML = provArr.length ? salesRankRows(provArr, m.allOrders.length, function(v){ return v.toLocaleString('id-ID') + ' pesanan'; }, 'var(--amber)') : '<div class="kpi-delta">Tidak ada data wilayah.</div>';
  document.getElementById('salesCities').innerHTML = cityArr.length ? salesRankRows(cityArr, m.allOrders.length, function(v){ return v.toLocaleString('id-ID') + ' pesanan'; }, 'var(--blue)') : '<div class="kpi-delta">Kolom kota/kabupaten tidak tersedia pada data.</div>';

  // ---------- Distribusi nilai pesanan ----------
  salesDestroy('salesValue');
  var vals2 = m.orders.map(function(o){ return o.total_payment; }).filter(function(v){ return v > 0; });
  if(vals2.length){
    var maxV = Math.max.apply(null, vals2), step = niceStep(maxV / 8), nb = Math.min(12, Math.floor(maxV / step) + 1);
    var counts = []; for(var b=0;b<nb;b++) counts.push(0);
    vals2.forEach(function(v){ counts[Math.min(nb-1, Math.floor(v / step))]++; });
    charts.salesValue = new Chart(document.getElementById('salesValueChart').getContext('2d'), {
      type:'bar',
      data:{ labels: counts.map(function(_, i){ return idrShort(i*step) + '–' + idrShort((i+1)*step); }), datasets:[{ data: counts, borderRadius:4, backgroundColor: c.soft, borderColor: c.brand, borderWidth:1 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(it){ return it.parsed.y.toLocaleString('id-ID') + ' pesanan'; } } } },
        scales:{ x:{ grid:{display:false}, ticks:{color:c.muted, maxRotation:0, autoSkip:true, maxTicksLimit:8} }, y:{ grid:{color:c.grid}, beginAtZero:true, ticks:{ color:c.muted, precision:0 } } } }
    });
    var sorted = vals2.slice().sort(function(a,b){ return a-b; });
    var median = sorted.length % 2 ? sorted[(sorted.length-1)/2] : (sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2;
    document.getElementById('salesValueStats').innerHTML =
      '<div><span>Median</span><b class="tabular">'+idr(median)+'</b></div><div><span>Terendah</span><b class="tabular">'+idr(sorted[0])+'</b></div><div><span>Tertinggi</span><b class="tabular">'+idr(sorted[sorted.length-1])+'</b></div>';
  } else {
    document.getElementById('salesValueStats').innerHTML = '';
  }
}

document.getElementById('salesTrendTabs').addEventListener('click', function(e){
  var btn = e.target.closest('button'); if(!btn) return;
  salesTrendMetric = btn.getAttribute('data-m');
  Array.from(this.children).forEach(function(b){ b.classList.toggle('active', b === btn); });
  renderSalesAnalysis();
});
document.getElementById('salesProductTabs').addEventListener('click', function(e){
  var btn = e.target.closest('button'); if(!btn) return;
  salesProductMetric = btn.getAttribute('data-m');
  Array.from(this.children).forEach(function(b){ b.classList.toggle('active', b === btn); });
  renderSalesAnalysis();
});
