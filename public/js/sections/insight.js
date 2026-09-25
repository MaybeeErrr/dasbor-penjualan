"use strict";

/* ---------------- Intelligent Business Insight ---------------- */
// Seluruh angka dihitung ulang dari state.filtered / state.records saat
// fungsi ini dipanggil — tidak ada nilai contoh maupun hardcoded.
function computeBusinessInsight(){
  var recs = state.filtered;
  var orders = uniqueOrders(recs);
  var completed = orders.filter(function(o){ return /selesai|complete|delivered/i.test(o.status); });
  var base = completed.length ? completed : orders;
  var totalRevenue = base.reduce(function(s,o){ return s+o.total_payment; }, 0);
  var totalTransactions = orders.length;
  var avgTransaction = base.length ? totalRevenue/base.length : 0;

  var custResult = getCustomerAnalytics();
  var totalCustomers = custResult.ok ? custResult.list.length : null;

  var pa = computeProductAnalytics();
  var byRevenue = pa.list.slice().sort(function(a,b){ return b.revenue-a.revenue; });
  var byUnits = pa.list.slice().sort(function(a,b){ return b.units-a.units; });
  var topProductByUnits = byUnits.length ? byUnits[0] : null;
  var topProductByRevenue = byRevenue.length ? byRevenue[0] : null;

  var byDay = groupByDay(base);
  var dayKeys = Object.keys(byDay);
  var bestDay=null, worstDay=null;
  dayKeys.forEach(function(k){
    if(bestDay===null || byDay[k]>byDay[bestDay]) bestDay=k;
    if(worstDay===null || byDay[k]<byDay[worstDay]) worstDay=k;
  });

  var topCustomerByValue = custResult.ok && custResult.list.length ? custResult.list.slice().sort(function(a,b){ return b.monetary-a.monetary; })[0] : null;
  var topCustomerByFreq = custResult.ok && custResult.list.length ? custResult.list.slice().sort(function(a,b){ return b.frequency-a.frequency; })[0] : null;

  var sortedDays = dayKeys.slice().sort();
  var half = Math.floor(sortedDays.length/2);
  var firstHalfAvg = half ? sortedDays.slice(0,half).reduce(function(s,k){ return s+byDay[k]; },0)/half : 0;
  var secondHalfAvg = (sortedDays.length-half) ? sortedDays.slice(half).reduce(function(s,k){ return s+byDay[k]; },0)/(sortedDays.length-half) : 0;
  var trendPct = (half>0 && firstHalfAvg>0) ? ((secondHalfAvg-firstHalfAvg)/firstHalfAvg*100) : null;

  var forecastModel = getForecastModel();

  return {
    totalRevenue: totalRevenue, totalTransactions: totalTransactions, totalCustomers: totalCustomers,
    avgTransaction: avgTransaction, topProductByUnits: topProductByUnits, topProductByRevenue: topProductByRevenue,
    bestDay: bestDay, worstDay: worstDay, byDay: byDay,
    topCustomerByValue: topCustomerByValue, topCustomerByFreq: topCustomerByFreq,
    trendPct: trendPct, forecastModel: forecastModel
  };
}

function renderIntelligentInsight(){
  var kpiEl = document.getElementById('insightKPIGrid');
  var emptyEl = document.getElementById('insightEmpty');
  var pnEl = document.getElementById('insightProductPeriod');
  var custEl = document.getElementById('insightCustomer');
  var narrEl = document.getElementById('insightNarrative');
  if(!kpiEl) return;

  if(!state.records.length){
    kpiEl.innerHTML=''; pnEl.innerHTML=''; custEl.innerHTML=''; narrEl.innerHTML='';
    emptyEl.style.display=''; emptyEl.textContent='Unggah data pesanan terlebih dahulu untuk melihat Intelligent Business Insight.';
    return;
  }
  emptyEl.style.display='none';
  var ins = computeBusinessInsight();

  var kpis = [
    {label:'Total pendapatan', value: idr(ins.totalRevenue), delta:'dari transaksi selesai pada filter aktif'},
    {label:'Total transaksi', value: ins.totalTransactions.toLocaleString('id-ID'), delta:'pesanan unik pada filter aktif'},
    {label:'Jumlah pelanggan', value: ins.totalCustomers===null?'—':ins.totalCustomers.toLocaleString('id-ID'), delta: ins.totalCustomers===null?'kolom identitas pelanggan tidak ditemukan':'pelanggan unik teridentifikasi'},
    {label:'Rata-rata nilai transaksi', value: idr(ins.avgTransaction), delta:'total pendapatan dibagi jumlah transaksi'}
  ];
  kpiEl.innerHTML = kpis.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');

  var rowsPP = [];
  if(ins.topProductByUnits) rowsPP.push({name:'Produk terlaris (unit): '+ins.topProductByUnits.name, val: ins.topProductByUnits.units, fmt: ins.topProductByUnits.units.toLocaleString('id-ID')+' unit'});
  if(ins.topProductByRevenue) rowsPP.push({name:'Pendapatan tertinggi: '+ins.topProductByRevenue.name, val: ins.topProductByRevenue.revenue, fmt: idrShort(ins.topProductByRevenue.revenue)});
  if(ins.bestDay) rowsPP.push({name:'Hari penjualan tertinggi: '+fmtFullDate(ins.bestDay), val: ins.byDay[ins.bestDay], fmt: idrShort(ins.byDay[ins.bestDay])});
  if(ins.worstDay) rowsPP.push({name:'Hari penjualan terendah: '+fmtFullDate(ins.worstDay), val: ins.byDay[ins.worstDay], fmt: idrShort(ins.byDay[ins.worstDay])});
  var maxPP = Math.max.apply(null, rowsPP.map(function(r){ return r.val; }).concat([1]));
  pnEl.innerHTML = rowsPP.length ? rowsPP.map(function(r){
    var pct = Math.max(4, maxPP>0 ? (r.val/maxPP*100) : 0);
    return '<div class="bar-row"><div class="name" title="'+escapeHtml(r.name)+'">'+escapeHtml(r.name)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div><div class="bar-val">'+r.fmt+'</div></div>';
  }).join('') : '<div class="kpi-delta">Belum ada data produk/periode yang dapat dianalisis.</div>';

  var rowsCust = [];
  if(ins.topCustomerByValue) rowsCust.push({name:'Nilai transaksi tertinggi: '+ins.topCustomerByValue.customer_id, val: ins.topCustomerByValue.monetary, fmt: idrShort(ins.topCustomerByValue.monetary)});
  if(ins.topCustomerByFreq) rowsCust.push({name:'Frekuensi transaksi tertinggi: '+ins.topCustomerByFreq.customer_id, val: ins.topCustomerByFreq.frequency, fmt: ins.topCustomerByFreq.frequency+'x'});
  var maxCust = Math.max.apply(null, rowsCust.map(function(r){ return r.val; }).concat([1]));
  custEl.innerHTML = rowsCust.length ? rowsCust.map(function(r){
    var pct = Math.max(4, maxCust>0 ? (r.val/maxCust*100) : 0);
    return '<div class="bar-row"><div class="name" title="'+escapeHtml(r.name)+'">'+escapeHtml(r.name)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:var(--blue);"></div></div><div class="bar-val">'+r.fmt+'</div></div>';
  }).join('') : '<div class="kpi-delta">Analisis pelanggan membutuhkan kolom identitas pelanggan pada data yang diunggah.</div>';

  var paras = [];
  paras.push('Pada filter yang sedang aktif, tercatat total pendapatan sebesar <b>'+idr(ins.totalRevenue)+'</b> dari <b>'+ins.totalTransactions.toLocaleString('id-ID')+'</b> transaksi'+(ins.totalCustomers!==null?', melibatkan <b>'+ins.totalCustomers.toLocaleString('id-ID')+'</b> pelanggan unik':'')+', dengan rata-rata nilai transaksi sebesar <b>'+idr(ins.avgTransaction)+'</b>.');
  if(ins.topProductByUnits || ins.topProductByRevenue){
    var sameProduct = ins.topProductByUnits && ins.topProductByRevenue && ins.topProductByUnits.name===ins.topProductByRevenue.name;
    paras.push('Produk dengan penjualan unit terbanyak adalah <b>'+escapeHtml(ins.topProductByUnits?ins.topProductByUnits.name:'-')+'</b>, sedangkan produk dengan kontribusi pendapatan terbesar adalah <b>'+escapeHtml(ins.topProductByRevenue?ins.topProductByRevenue.name:'-')+'</b>'+(sameProduct?' (produk yang sama).':'.'));
  }
  if(ins.bestDay && ins.worstDay){
    paras.push('Penjualan harian tertinggi terjadi pada <b>'+fmtFullDate(ins.bestDay)+'</b> ('+idr(ins.byDay[ins.bestDay])+'), sementara penjualan terendah pada <b>'+fmtFullDate(ins.worstDay)+'</b> ('+idr(ins.byDay[ins.worstDay])+').');
  }
  if(ins.topCustomerByValue || ins.topCustomerByFreq){
    paras.push('Pelanggan dengan nilai transaksi terbesar adalah <b>'+escapeHtml(ins.topCustomerByValue?ins.topCustomerByValue.customer_id:'-')+'</b> ('+idr(ins.topCustomerByValue?ins.topCustomerByValue.monetary:0)+'), sedangkan pelanggan paling sering bertransaksi adalah <b>'+escapeHtml(ins.topCustomerByFreq?ins.topCustomerByFreq.customer_id:'-')+'</b> ('+(ins.topCustomerByFreq?ins.topCustomerByFreq.frequency:0)+'x transaksi).');
  }
  if(ins.trendPct !== null){
    var trendWord = ins.trendPct>3?'meningkat':(ins.trendPct<-3?'menurun':'relatif stabil');
    paras.push('Dibandingkan paruh pertama periode data pada filter aktif, rata-rata pendapatan harian pada paruh kedua '+trendWord+(Math.abs(ins.trendPct)>=0.05?' sekitar '+Math.abs(ins.trendPct).toFixed(1)+'%':'')+'.');
  }
  if(ins.forecastModel.hasEnoughData){
    paras.push('Model forecasting memproyeksikan tren penjualan ke depan berdasarkan '+ins.forecastModel.actualDays+' hari data historis pada filter aktif — lihat halaman Sales Forecasting dan Model Evaluation untuk detail akurasinya.');
  }
  narrEl.innerHTML = paras.map(function(p){ return '<p>'+p+'</p>'; }).join('');
}

/* ---------------- Business Recommendation ---------------- */
function renderBusinessRecommendation(){
  var wrap = document.getElementById('recoList');
  if(!wrap) return;
  if(!state.records.length){
    wrap.innerHTML = '<div class="state-empty">Unggah data pesanan terlebih dahulu untuk melihat rekomendasi bisnis otomatis.</div>';
    return;
  }
  var cards = [];
  var ins = computeBusinessInsight();
  var pa = computeProductAnalytics();

  if(lastClusterSummaries && lastClusterSummaries.length){
    lastClusterSummaries.forEach(function(s){
      var base = 'Cluster '+(s.idx+1)+' ('+s.label+'): '+s.cnt.toLocaleString('id-ID')+' pelanggan, Recency rata-rata '+s.avgR.toFixed(1)+' hari, Frequency rata-rata '+s.avgF.toFixed(1)+'x, Monetary rata-rata '+idr(s.avgM)+'.';
      if(s.scores.r>=0.66 && s.scores.f>=0.5 && s.scores.m>=0.66){
        cards.push({tag:'Loyalty Program', tone:'brand', condition: base, insight:'Segmen ini paling aktif, paling baru bertransaksi, dan memberi kontribusi Monetary tertinggi dibanding segmen lain.', action:'Luncurkan atau perkuat program loyalitas (poin belanja, diskon eksklusif, akses produk baru lebih awal) untuk mempertahankan retensi '+s.cnt.toLocaleString('id-ID')+' pelanggan pada segmen ini.'});
      }
      if(s.scores.r<0.34 && (s.scores.f>=0.4 || s.scores.m>=0.4)){
        cards.push({tag:'Reactivation Campaign', tone:'brick', condition: base, insight:'Pelanggan pada cluster ini sudah lama tidak bertransaksi (Recency tinggi) meskipun frekuensi/nilai transaksinya sebelumnya cukup baik — berisiko churn.', action:'Jalankan kampanye reaktivasi (email/WhatsApp/promo khusus "kami rindu Anda") yang ditargetkan ke '+s.cnt.toLocaleString('id-ID')+' pelanggan pada segmen ini sebelum mereka sepenuhnya berhenti bertransaksi.'});
      }
      if(s.scores.f>=0.6 && s.scores.m<0.66){
        cards.push({tag:'Upselling / Cross-selling', tone:'amber', condition: base, insight:'Pelanggan pada cluster ini cukup sering bertransaksi (Frequency relatif tinggi) namun nilai transaksinya belum setinggi segmen High Value.', action:'Tawarkan bundling produk, upgrade ukuran/varian, atau rekomendasi produk pelengkap saat mereka bertransaksi untuk menaikkan nilai rata-rata transaksi.'});
      }
    });
  }

  var sortedByRevenue = pa.list.slice().sort(function(a,b){ return a.revenue-b.revenue; });
  var bottom = sortedByRevenue.slice(0,3);
  if(bottom.length){
    cards.push({tag:'Evaluasi Produk', tone:'amber', condition: bottom.map(function(p){ return p.name; }).join('; ')+' mencatat pendapatan terendah di antara produk lain pada data ini (terendah: '+idr(bottom[0].revenue)+').', insight:'Produk-produk ini kurang diminati pasar dibanding produk lain pada dataset yang sama.', action:'Evaluasi harga, deskripsi produk, atau lakukan promosi/bundling untuk produk-produk ini; pertimbangkan menghentikan produksi/stok jika performa tetap rendah dalam jangka panjang.'});
  }

  var model = ins.forecastModel;
  if(model.hasEnoughData){
    var relSlope = model.avgDaily>0 ? model.reg.slope/model.avgDaily : 0;
    if(relSlope > 0.01){
      cards.push({tag:'Manajemen Stok', tone:'brand', condition:'Tren penjualan pada '+model.actualDays+' hari data historis menunjukkan kenaikan rata-rata sekitar '+(relSlope*100).toFixed(1)+'%/hari (regresi linier).', insight:'Permintaan diproyeksikan terus meningkat pada horizon ke depan.', action:'Tingkatkan stok produk terlaris ('+(ins.topProductByUnits?ins.topProductByUnits.name:'produk terlaris')+') dan siapkan kapasitas operasional untuk mengantisipasi lonjakan permintaan.'});
    } else if(relSlope < -0.01){
      cards.push({tag:'Strategi Promosi', tone:'brick', condition:'Tren penjualan pada '+model.actualDays+' hari data historis menunjukkan penurunan rata-rata sekitar '+(Math.abs(relSlope)*100).toFixed(1)+'%/hari (regresi linier).', insight:'Permintaan diproyeksikan melambat pada horizon ke depan.', action:'Pertimbangkan promosi bertarget, diskon musiman, atau kampanye pemasaran untuk mendorong kembali permintaan sebelum tren penurunan berlanjut.'});
    }
  }

  if(!cards.length){
    wrap.innerHTML = '<div class="state-empty">Rekomendasi otomatis akan muncul setelah data cukup untuk dianalisis (RFM, segmentasi pelanggan K-Means, Product Analytics, dan Forecasting).</div>';
    return;
  }
  wrap.innerHTML = cards.map(function(c){
    return '<div class="reco-card tone-'+c.tone+'"><div class="reco-tag">'+escapeHtml(c.tag)+'</div>'+
      '<div class="reco-block"><b>Kondisi ditemukan:</b> '+escapeHtml(c.condition)+'</div>'+
      '<div class="reco-block"><b>Insight:</b> '+escapeHtml(c.insight)+'</div>'+
      '<div class="reco-block"><b>Tindakan disarankan:</b> '+escapeHtml(c.action)+'</div></div>';
  }).join('');
}
