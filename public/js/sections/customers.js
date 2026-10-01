"use strict";

/* ---------------- Customer Analytics (RFM) ---------------- */
// RFM dihitung dari transaksi berstatus selesai pada filter yang aktif,
// dikelompokkan per identitas pelanggan (customer_id) yang benar-benar
// ada pada dataset yang diunggah. Jika kolom identitas pelanggan tidak
// ditemukan sama sekali pada dataset, identitas pelanggan TIDAK dibuat
// secara fiktif — analisis RFM ditandai tidak tersedia.
var MS_PER_DAY = 24 * 60 * 60 * 1000;

function getCustomerAnalytics(){
  var hasCustomerColumn = state.records.length > 0 && state.records.some(function(r){
    return r.customer_id && String(r.customer_id).trim() !== '';
  });
  if(!hasCustomerColumn){
    return { ok:false, reason:'no_column' };
  }

  var orders = uniqueOrders(state.filtered).filter(function(o){
    return OrderStatus.isCompleted(o.status) && o.customer_id && String(o.customer_id).trim() !== '';
  });
  if(!orders.length){
    return { ok:false, reason:'no_data' };
  }

  var referenceDate = null;
  orders.forEach(function(o){
    var d = toDate(o.created_at);
    if(d && (!referenceDate || d > referenceDate)) referenceDate = d;
  });

  var map = {};
  orders.forEach(function(o){
    var key = String(o.customer_id).trim();
    var d = toDate(o.created_at);
    if(!map[key]) map[key] = { customer_id: key, frequency: 0, monetary: 0, lastDate: null };
    map[key].frequency += 1;
    map[key].monetary += o.total_payment;
    if(d && (!map[key].lastDate || d > map[key].lastDate)) map[key].lastDate = d;
  });

  var list = Object.keys(map).map(function(k){
    var c = map[k];
    var recency = c.lastDate ? Math.max(0, Math.round((referenceDate - c.lastDate) / MS_PER_DAY)) : null;
    return { customer_id: c.customer_id, recency: recency, frequency: c.frequency, monetary: c.monetary };
  });
  list.sort(function(a,b){ return b.monetary - a.monetary; });

  return { ok:true, list:list, referenceDate:referenceDate };
}

function buildRecencyBuckets(list){
  var bucketDefs = [
    { label:'0–7 hari', min:0, max:7 },
    { label:'8–14 hari', min:8, max:14 },
    { label:'15–30 hari', min:15, max:30 },
    { label:'31–60 hari', min:31, max:60 },
    { label:'>60 hari', min:61, max:Infinity }
  ];
  var counts = bucketDefs.map(function(){ return 0; });
  list.forEach(function(c){
    if(c.recency === null) return;
    for(var i=0;i<bucketDefs.length;i++){
      if(c.recency >= bucketDefs[i].min && c.recency <= bucketDefs[i].max){ counts[i]++; break; }
    }
  });
  return bucketDefs.map(function(b,i){ return { label:b.label, count:counts[i] }; });
}

// Urutan tabel RFM (hanya mengubah urutan tampilan, bukan perhitungan RFM).
var rfmSortKey = 'monetary';
function sortRfmList(list){
  var arr = list.slice();
  function rec(c, fallback){ return c.recency === null ? fallback : c.recency; }
  if(rfmSortKey === 'frequency'){
    arr.sort(function(a,b){ return (b.frequency - a.frequency) || (b.monetary - a.monetary); });
  } else if(rfmSortKey === 'recency_asc'){
    arr.sort(function(a,b){ return (rec(a, Infinity) - rec(b, Infinity)) || (b.monetary - a.monetary); });
  } else if(rfmSortKey === 'recency_desc'){
    arr.sort(function(a,b){ return (rec(b, -1) - rec(a, -1)) || (b.monetary - a.monetary); });
  } else {
    arr.sort(function(a,b){ return b.monetary - a.monetary; });
  }
  return arr;
}
var RFM_SORT_LABEL = {
  monetary: 'Monetary tertinggi', frequency: 'Frequency tertinggi',
  recency_asc: 'Recency terbaru (paling baru bertransaksi)', recency_desc: 'Recency terlama (paling lama tidak bertransaksi)'
};

function renderCustomerAnalytics(){
  var emptyEl = document.getElementById('rfmEmpty');
  var contentEl = document.getElementById('rfmContent');
  var result = getCustomerAnalytics();

  if(!result.ok){
    contentEl.classList.add('hidden');
    emptyEl.classList.add('show');
    if(result.reason === 'no_column'){
      emptyEl.textContent = 'Analisis RFM membutuhkan kolom identitas pelanggan (misalnya Username Pembeli, ID Pelanggan, No. Handphone, atau Email) untuk membedakan satu pelanggan dengan pelanggan lainnya. Kolom ini tidak ditemukan pada data yang diunggah, sehingga identitas pelanggan tidak dibuat secara otomatis/fiktif. Unggah data yang menyertakan kolom identitas pelanggan untuk mengaktifkan analisis ini.';
    } else {
      emptyEl.textContent = 'Belum ada transaksi selesai dengan identitas pelanggan pada filter yang aktif, sehingga analisis RFM belum dapat dihitung. Coba ubah filter status/provinsi.';
    }
    if(charts.rfmScatter){ charts.rfmScatter.destroy(); charts.rfmScatter = null; }
    return;
  }

  emptyEl.classList.remove('show');
  contentEl.classList.remove('hidden');

  var list = result.list;
  var n = list.length;
  var totalFrequency = 0, totalMonetary = 0, totalRecency = 0, recencyCount = 0, repeatCount = 0, active30 = 0;
  list.forEach(function(c){
    totalFrequency += c.frequency;
    totalMonetary += c.monetary;
    if(c.frequency >= 2) repeatCount++;
    if(c.recency !== null){ totalRecency += c.recency; recencyCount++; if(c.recency <= 30) active30++; }
  });
  var avgFrequency = n ? totalFrequency / n : 0;
  var avgMonetary = n ? totalMonetary / n : 0;
  var avgRecency = recencyCount ? totalRecency / recencyCount : null;
  var refDateTxt = result.referenceDate ? result.referenceDate.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  function pct(v, total){ return total ? Math.round(v / total * 100) : 0; }

  // ---- Kesimpulan singkat ----
  var headline = '<b>' + n.toLocaleString('id-ID') + ' pelanggan</b> bertransaksi dengan total <b>' + idr(totalMonetary) + '</b>. ' +
    '<b>' + pct(repeatCount, n) + '%</b> pelanggan sudah berbelanja lebih dari sekali' +
    (recencyCount ? ', dan <b>' + pct(active30, recencyCount) + '%</b> berbelanja dalam 30 hari terakhir.' : '.');
  document.getElementById('rfmHeadline').innerHTML = headline;

  // ---- Statistik ringkas ----
  var summary = [
    { label:'Pelanggan dianalisis', value: n.toLocaleString('id-ID'), delta: 'dari transaksi selesai pada filter aktif' },
    { label:'Recency rata-rata', value: avgRecency === null ? '—' : avgRecency.toFixed(1) + ' hari', delta: 'sejak transaksi terakhir, per ' + refDateTxt },
    { label:'Frequency rata-rata', value: avgFrequency.toFixed(1) + 'x', delta: 'transaksi per pelanggan' },
    { label:'Monetary rata-rata', value: idr(avgMonetary), delta: 'nilai belanja per pelanggan' },
    { label:'Pelanggan berulang', value: repeatCount.toLocaleString('id-ID'), delta: pct(repeatCount, n) + '% bertransaksi 2x atau lebih' }
  ];
  document.getElementById('rfmStats').innerHTML = summary.map(function(s){
    return '<div class="kpi-card"><div class="kpi-label">'+s.label+'</div><div class="kpi-value tabular">'+s.value+'</div><div class="kpi-delta">'+s.delta+'</div></div>';
  }).join('');

  // Kartu ringkasan RFM di halaman Overview (elemen terpisah) tetap diisi.
  var overviewEl = document.getElementById('rfmSummary');
  if(overviewEl){
    overviewEl.innerHTML = summary.slice(0,4).map(function(s){
      return '<div class="kpi-card"><div class="kpi-label">'+s.label+'</div><div class="kpi-value tabular">'+s.value+'</div><div class="kpi-delta">'+s.delta+'</div></div>';
    }).join('');
  }

  // ---- Distribusi Recency: jumlah + persen, warna dari baru (hijau) ke lama (merah) ----
  var buckets = buildRecencyBuckets(list);
  var maxBucket = Math.max.apply(null, buckets.map(function(b){ return b.count; }).concat([1]));
  var bucketColors = ['var(--brand)', 'color-mix(in srgb, var(--brand) 60%, var(--amber))', 'var(--amber)', 'color-mix(in srgb, var(--amber) 55%, var(--brick))', 'var(--brick)'];
  document.getElementById('rfmRecencyDist').innerHTML = buckets.map(function(b, i){
    var w = b.count ? Math.max(3, b.count / maxBucket * 100) : 0;
    return '<div class="rfm-dist-row"><div class="name">'+b.label+'</div>'+
      '<div class="bar-track"><div class="bar-fill" style="width:'+w+'%; background:'+bucketColors[i % bucketColors.length]+';"></div></div>'+
      '<div class="val tabular"><b>'+b.count.toLocaleString('id-ID')+'</b><span>'+pct(b.count, recencyCount)+'%</span></div></div>';
  }).join('');

  // ---- Scatter Frequency (x) vs Monetary (y), digabung jadi bubble ----
  var ctx = document.getElementById('rfmScatterChart').getContext('2d');
  if(charts.rfmScatter) charts.rfmScatter.destroy();
  var css = getComputedStyle(document.documentElement);
  var mutedColor = css.getPropertyValue('--ink-muted').trim();
  var gridColor = css.getPropertyValue('--chart-grid').trim();
  var rfmStep = monetaryBucketStep(list, 9);
  var rfmBubbles = buildBubbleCells(list, rfmStep, null, null);
  var rfmMaxCount = Math.max.apply(null, rfmBubbles.map(function(b){ return b.count; }).concat([1]));
  charts.rfmScatter = new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'Pelanggan',
        data: rfmBubbles,
        backgroundColor: rfmBubbles.map(function(b){
          var alpha = 0.35 + 0.5 * (b.count / rfmMaxCount);
          return 'rgba(47,111,78,' + alpha.toFixed(2) + ')';
        }),
        borderColor: css.getPropertyValue('--chart-line').trim(),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display:false },
        tooltip: { callbacks: { label: function(item){ return bubbleTooltipLine(item.raw, rfmStep); } } }
      },
      scales: {
        x: { title: { display:true, text:'Frequency (jumlah transaksi)', color: mutedColor, font:{size:11} }, grid: { color: gridColor }, ticks: { precision:0, color: mutedColor }, min: 0.5 },
        y: { title: { display:true, text:'Monetary (Rp)', color: mutedColor, font:{size:11} }, grid: { color: gridColor }, ticks: { callback:function(v){ return idrShort(v); }, color: mutedColor }, min: 0 }
      }
    }
  });

  // ---- Tabel RFM per pelanggan (urutan bisa dipilih, dengan pagination) ----
  var sorted = sortRfmList(list);
  var totalPages = Math.max(1, Math.ceil(n / state.rfmPageSize));
  state.rfmPage = Math.min(state.rfmPage, totalPages-1);
  var start = state.rfmPage * state.rfmPageSize;
  var pageList = sorted.slice(start, start+state.rfmPageSize);

  var tbody = document.getElementById('rfmTableBody');
  if(!pageList.length){
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--ink-muted)">Tidak ada pelanggan yang cocok.</td></tr>';
  } else {
    tbody.innerHTML = pageList.map(function(c){
      return '<tr><td class="rfm-cust-cell">'+escapeHtml(c.customer_id)+'</td><td class="tabular">'+(c.recency === null ? '—' : c.recency)+'</td><td class="tabular">'+c.frequency+'</td><td class="tabular">'+idr(c.monetary)+'</td></tr>';
    }).join('');
  }
  document.getElementById('rfmSort').value = rfmSortKey;
  document.getElementById('rfmTableDesc').textContent = n.toLocaleString('id-ID') + ' pelanggan teridentifikasi, diurutkan dari ' + RFM_SORT_LABEL[rfmSortKey].toLowerCase() + '.';
  document.getElementById('rfmPagerInfo').textContent = 'Halaman ' + (state.rfmPage+1) + ' dari ' + totalPages;
  document.getElementById('rfmPagerPrev').disabled = state.rfmPage <= 0;
  document.getElementById('rfmPagerNext').disabled = state.rfmPage >= totalPages-1;
}

document.getElementById('rfmSort').addEventListener('change', function(e){ rfmSortKey = e.target.value; state.rfmPage = 0; renderCustomerAnalytics(); });
document.getElementById('rfmPagerPrev').addEventListener('click', function(){ state.rfmPage--; renderCustomerAnalytics(); });
document.getElementById('rfmPagerNext').addEventListener('click', function(){ state.rfmPage++; renderCustomerAnalytics(); });
