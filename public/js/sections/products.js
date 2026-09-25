"use strict";

/* ---------------- Product Analytics ---------------- */
// Dihitung secara dinamis dari kolom Nama Produk, Jumlah (unit), dan Subtotal
// Pesanan pada baris transaksi yang statusnya "selesai" (mengikuti pola yang
// sama dengan panel "Produk terlaris" di atas), lalu difilter ulang mengikuti
// filter status/provinsi yang sedang aktif melalui state.filtered.
// Subtotal Pesanan dipakai untuk pendapatan per produk karena nilainya melekat
// pada masing-masing baris produk; Total Pembayaran bersifat per-pesanan
// (bisa mencakup beberapa produk sekaligus) sehingga sudah direpresentasikan
// pada KPI ringkasan di bagian atas dasbor, bukan pada level produk di sini.
function computeProductAnalytics(){
  var recs = state.filtered.filter(function(r){ return /selesai|complete|delivered/i.test(r.status); });
  var base = recs.length ? recs : state.filtered;
  var map = {};
  base.forEach(function(r){
    var key = (r.product || 'Tidak diketahui').trim() || 'Tidak diketahui';
    if(!map[key]) map[key] = { name:key, units:0, revenue:0, orders:{} };
    map[key].units += (typeof r.qty === 'number' && !isNaN(r.qty)) ? r.qty : 0;
    map[key].revenue += (typeof r.subtotal === 'number' && !isNaN(r.subtotal)) ? r.subtotal : 0;
    if(r.order_id) map[key].orders[r.order_id] = true;
  });
  var list = Object.keys(map).map(function(k){
    var p = map[k];
    return { name:p.name, units:p.units, revenue:p.revenue, transactions:Object.keys(p.orders).length };
  });
  var totalRevenue = list.reduce(function(a,b){ return a+b.revenue; }, 0);
  var totalUnits = list.reduce(function(a,b){ return a+b.units; }, 0);
  list.forEach(function(p){ p.contribution = totalRevenue > 0 ? (p.revenue/totalRevenue*100) : 0; });
  return { list:list, totalRevenue:totalRevenue, totalUnits:totalUnits, baseCount:base.length };
}

function paSortList(list){
  var key = state.paSortKey, dir = state.paSortDir === 'asc' ? 1 : -1;
  var sorted = list.slice().sort(function(a,b){
    if(key === 'name'){
      return dir * a.name.localeCompare(b.name, 'id');
    }
    return dir * (a[key] - b[key]);
  });
  return sorted;
}

function renderProductAnalytics(){
  var emptyEl = document.getElementById('paEmpty');
  var contentEl = document.getElementById('paContent');
  var pa = computeProductAnalytics();

  if(!pa.list.length){
    contentEl.classList.add('hidden');
    emptyEl.classList.add('show');
    emptyEl.textContent = 'Belum ada data produk yang dapat dianalisis pada filter yang aktif. Coba ubah filter status/provinsi, atau unggah data transaksi.';
    if(charts.paRevenue){ charts.paRevenue.destroy(); charts.paRevenue=null; }
    if(charts.paUnits){ charts.paUnits.destroy(); charts.paUnits=null; }
    return;
  }

  emptyEl.classList.remove('show');
  contentEl.classList.remove('hidden');

  var css = getComputedStyle(document.documentElement);
  var list = pa.list;

  // ---- Ringkasan KPI ----
  var avgRevenuePerProduct = list.length ? pa.totalRevenue / list.length : 0;
  var summary = [
    { label:'Jumlah produk dianalisis', value: list.length.toLocaleString('id-ID'), delta:'produk unik pada transaksi selesai di filter aktif' },
    { label:'Total unit terjual', value: pa.totalUnits.toLocaleString('id-ID'), delta:'dari kolom Jumlah pada setiap baris produk' },
    { label:'Total pendapatan produk', value: idr(pa.totalRevenue), delta:'jumlah Subtotal Pesanan seluruh produk' },
    { label:'Rata-rata pendapatan/produk', value: idr(avgRevenuePerProduct), delta:'total pendapatan produk dibagi jumlah produk unik' }
  ];
  document.getElementById('paSummary').innerHTML = summary.map(function(s){
    return '<div class="kpi-card"><div class="kpi-label">'+s.label+'</div><div class="kpi-value tabular">'+s.value+'</div><div class="kpi-delta">'+s.delta+'</div></div>';
  }).join('');

  // ---- Top 10 by revenue (horizontal bar) ----
  var byRevenue = list.slice().sort(function(a,b){ return b.revenue-a.revenue; }).slice(0,10);
  var ctxRev = document.getElementById('paRevenueChart').getContext('2d');
  if(charts.paRevenue) charts.paRevenue.destroy();
  charts.paRevenue = new Chart(ctxRev, {
    type: 'bar',
    data: {
      labels: byRevenue.map(function(p){ return p.name.length>36 ? p.name.slice(0,33)+'…' : p.name; }),
      datasets: [{
        label: 'Pendapatan',
        data: byRevenue.map(function(p){ return p.revenue; }),
        backgroundColor: css.getPropertyValue('--chart-line').trim(),
        borderRadius: 4,
        maxBarThickness: 22
      }]
    },
    options: {
      indexAxis: 'y',
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:false },
        tooltip: { callbacks: { label: function(item){ return idr(item.parsed.x); } } }
      },
      scales: {
        x: { grid:{color: css.getPropertyValue('--chart-grid').trim()}, ticks:{callback:function(v){ return idrShort(v); }, color: css.getPropertyValue('--ink-muted').trim()} },
        y: { grid:{display:false}, ticks:{color: css.getPropertyValue('--ink-muted').trim(), font:{size:11}} }
      }
    }
  });

  // ---- Top 10 by units (horizontal bar) ----
  var byUnits = list.slice().sort(function(a,b){ return b.units-a.units; }).slice(0,10);
  var ctxUnits = document.getElementById('paUnitsChart').getContext('2d');
  if(charts.paUnits) charts.paUnits.destroy();
  charts.paUnits = new Chart(ctxUnits, {
    type: 'bar',
    data: {
      labels: byUnits.map(function(p){ return p.name.length>36 ? p.name.slice(0,33)+'…' : p.name; }),
      datasets: [{
        label: 'Unit terjual',
        data: byUnits.map(function(p){ return p.units; }),
        backgroundColor: css.getPropertyValue('--amber').trim(),
        borderRadius: 4,
        maxBarThickness: 22
      }]
    },
    options: {
      indexAxis: 'y',
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:false },
        tooltip: { callbacks: { label: function(item){ return item.parsed.x.toLocaleString('id-ID') + ' unit'; } } }
      },
      scales: {
        x: { grid:{color: css.getPropertyValue('--chart-grid').trim()}, ticks:{precision:0, color: css.getPropertyValue('--ink-muted').trim()} },
        y: { grid:{display:false}, ticks:{color: css.getPropertyValue('--ink-muted').trim(), font:{size:11}} }
      }
    }
  });

  // ---- Produk berperforma tertinggi/terendah (berdasarkan pendapatan aktual) ----
  var sortedByRevenue = list.slice().sort(function(a,b){ return b.revenue-a.revenue; });
  var top5 = sortedByRevenue.slice(0,5);
  var bottom5 = sortedByRevenue.slice(-5).reverse();
  var maxTop = top5.length ? top5[0].revenue : 1;
  var maxBottom = bottom5.length ? Math.max.apply(null, bottom5.map(function(p){ return p.revenue; }).concat([1])) : 1;

  document.getElementById('paTopPerformers').innerHTML = top5.map(function(p){
    var pct = Math.max(4, maxTop>0 ? (p.revenue/maxTop*100) : 0);
    return '<div class="bar-row"><div class="name" title="'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div><div class="bar-val">'+idrShort(p.revenue)+'</div></div>';
  }).join('') || '<div class="kpi-delta">Tidak ada data produk.</div>';

  document.getElementById('paBottomPerformers').innerHTML = bottom5.map(function(p){
    var pct = Math.max(4, maxBottom>0 ? (p.revenue/maxBottom*100) : 0);
    return '<div class="bar-row"><div class="name" title="'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:var(--brick);"></div></div><div class="bar-val">'+idrShort(p.revenue)+'</div></div>';
  }).join('') || '<div class="kpi-delta">Tidak ada data produk.</div>';

  // ---- Sort header indicators ----
  Array.from(document.querySelectorAll('#productAnalyticsPanel th.pa-sortable')).forEach(function(th){
    var isActive = th.getAttribute('data-sort') === state.paSortKey;
    th.classList.toggle('active', isActive);
    var base = th.textContent.replace(/\s*[▲▼]\s*$/, '');
    th.innerHTML = base + (isActive ? ' <span class="sort-arrow">'+(state.paSortDir==='asc' ? '▲' : '▼')+'</span>' : '');
  });

  // ---- Tabel detail produk (search + sort + pagination) ----
  var search = state.paSearch;
  var filteredList = search ? list.filter(function(p){ return p.name.toLowerCase().indexOf(search) !== -1; }) : list;
  var sortedList = paSortList(filteredList);
  var n = sortedList.length;
  var totalPages = Math.max(1, Math.ceil(n / state.paPageSize));
  state.paPage = Math.min(state.paPage, totalPages-1);
  var start = state.paPage * state.paPageSize;
  var pageList = sortedList.slice(start, start+state.paPageSize);

  var tbody = document.getElementById('paTableBody');
  if(!pageList.length){
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--ink-muted)">Tidak ada produk yang cocok.</td></tr>';
  } else {
    tbody.innerHTML = pageList.map(function(p){
      return '<tr><td title="'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</td><td class="tabular">'+p.units.toLocaleString('id-ID')+'</td><td class="tabular">'+p.transactions.toLocaleString('id-ID')+'</td><td class="tabular">'+idr(p.revenue)+'</td><td class="tabular">'+p.contribution.toFixed(1)+'%</td></tr>';
    }).join('');
  }
  document.getElementById('paTableDesc').textContent = n.toLocaleString('id-ID') + ' produk' + (search ? ' cocok dengan pencarian "'+search+'"' : '') + ' dari total ' + list.length.toLocaleString('id-ID') + ' produk pada filter aktif';
  document.getElementById('paPagerInfo').textContent = 'Halaman ' + (state.paPage+1) + ' dari ' + totalPages;
  document.getElementById('paPagerPrev').disabled = state.paPage <= 0;
  document.getElementById('paPagerNext').disabled = state.paPage >= totalPages-1;
}

document.getElementById('paSearch').addEventListener('input', debounce(function(e){
  state.paSearch = e.target.value.toLowerCase();
  state.paPage = 0;
  renderProductAnalytics();
}, 200));

Array.from(document.querySelectorAll('#productAnalyticsPanel th.pa-sortable')).forEach(function(th){
  th.addEventListener('click', function(){
    var key = th.getAttribute('data-sort');
    if(state.paSortKey === key){
      state.paSortDir = state.paSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.paSortKey = key;
      state.paSortDir = key === 'name' ? 'asc' : 'desc';
    }
    state.paPage = 0;
    renderProductAnalytics();
  });
});

document.getElementById('paPagerPrev').addEventListener('click', function(){ state.paPage--; renderProductAnalytics(); });
document.getElementById('paPagerNext').addEventListener('click', function(){ state.paPage++; renderProductAnalytics(); });


function renderTable(){
  var orders = uniqueOrders(state.filtered);
  var search = state.tableSearch;
  if(search){
    orders = orders.filter(function(o){
      var itemsForOrder = state.filtered.filter(function(r){ return r.order_id === o.order_id; }).map(function(r){ return r.product; }).join(' ');
      var hay = (o.order_id + ' ' + o.city + ' ' + o.province + ' ' + itemsForOrder).toLowerCase();
      return hay.indexOf(search) !== -1;
    });
  }
  orders.sort(function(a,b){ return (toDate(b.created_at)||0) - (toDate(a.created_at)||0); });

  var totalPages = Math.max(1, Math.ceil(orders.length / state.tablePageSize));
  state.tablePage = Math.min(state.tablePage, totalPages-1);
  var start = state.tablePage * state.tablePageSize;
  var pageOrders = orders.slice(start, start+state.tablePageSize);

  var tbody = document.getElementById('orderTableBody');
  if(!pageOrders.length){
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--ink-muted)">Tidak ada pesanan yang cocok.</td></tr>';
  } else {
    tbody.innerHTML = pageOrders.map(function(o){
      var items = state.filtered.filter(function(r){ return r.order_id === o.order_id; });
      var productSummary = items.length > 1 ? (items[0].product + ' +' + (items.length-1) + ' lainnya') : (items[0] ? items[0].product : '—');
      var d = toDate(o.created_at);
      var dateStr = d ? d.toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'}) : '—';
      var badgeCls = /selesai|complete|delivered/i.test(o.status) ? 'selesai' : (/batal|cancel/i.test(o.status) ? 'batal' : 'other');
      return '<tr><td>'+escapeHtml(o.order_id)+'</td><td>'+dateStr+'</td><td title="'+escapeHtml(productSummary)+'" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;">'+escapeHtml(productSummary)+'</td><td>'+escapeHtml(o.city||'—')+'</td><td><span class="badge '+badgeCls+'">'+escapeHtml(o.status)+'</span></td><td class="tabular">'+idr(o.total_payment)+'</td></tr>';
    }).join('');
  }
  document.getElementById('tableDesc').textContent = orders.length + ' pesanan unik';
  document.getElementById('pagerInfo').textContent = 'Halaman ' + (state.tablePage+1) + ' dari ' + totalPages;
  document.getElementById('pagerPrev').disabled = state.tablePage <= 0;
  document.getElementById('pagerNext').disabled = state.tablePage >= totalPages-1;
}

document.getElementById('pagerPrev').addEventListener('click', function(){ state.tablePage--; renderTable(); });
document.getElementById('pagerNext').addEventListener('click', function(){ state.tablePage++; renderTable(); });
