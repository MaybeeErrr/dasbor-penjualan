"use strict";

/* ---------------- Model Evaluation (gabungan K-Means + Forecasting) ---------------- */
function renderModelEvaluation(){
  var kEl = document.getElementById('meKmeansSummary');
  var kEmptyEl = document.getElementById('meKmeansEmpty');
  var fEl = document.getElementById('meForecastSummary');
  var fEmptyEl = document.getElementById('meForecastEmpty');
  var narrEl = document.getElementById('meNarrative');
  if(!kEl) return;

  if(!state.records.length){
    kEl.innerHTML=''; fEl.innerHTML=''; narrEl.innerHTML='';
    kEmptyEl.style.display=''; kEmptyEl.textContent='Unggah data pesanan terlebih dahulu.';
    fEmptyEl.style.display=''; fEmptyEl.textContent='Unggah data pesanan terlebih dahulu.';
    return;
  }

  var narrParas = [];

  var rfmResult = getCustomerAnalytics();
  var clusterableList = rfmResult.ok ? rfmResult.list.filter(function(c){ return c.recency!==null; }) : [];
  var k = state.kmeansK;
  var kResult = clusterableList.length ? getKMeansResult(clusterableList, k) : { ok:false };
  if(!rfmResult.ok || !kResult.ok){
    kEl.innerHTML='';
    kEmptyEl.style.display='';
    kEmptyEl.textContent = 'Evaluasi clustering belum dapat dihitung karena hasil RFM/K-Means pada Customer Analytics belum tersedia untuk filter yang aktif (lihat halaman Customer Analytics untuk detail persyaratannya).';
  } else {
    kEmptyEl.style.display='none';
    var elbowData = computeElbow(clusterableList, 8);
    var suggestedK = null;
    if(elbowData.length >= 3){
      var bestDrop = -Infinity;
      for(var i=1;i<elbowData.length-1;i++){
        var d2 = elbowData[i-1].wcss - 2*elbowData[i].wcss + elbowData[i+1].wcss;
        if(d2 > bestDrop){ bestDrop = d2; suggestedK = elbowData[i].k; }
      }
    }
    var silTxt = kResult.silhouetteSkipped ? 'Dilewati (jumlah pelanggan terlalu besar)' : (kResult.silhouette===null ? 'Tidak dapat dihitung' : kResult.silhouette.toFixed(3));
    var silZoneTxt = (kResult.silhouette!==null && !kResult.silhouetteSkipped) ? (kResult.silhouette<=0.25?'Pemisahan cluster lemah':(kResult.silhouette<=0.5?'Pemisahan cluster cukup':(kResult.silhouette<=0.7?'Pemisahan cluster baik':'Pemisahan cluster sangat baik'))) : '—';
    var kCards = [
      {label:'K yang digunakan', value:'K = '+k, delta:'dipilih pada Customer Analytics → K-Means Segmentation'},
      {label:'Silhouette Score', value: silTxt, delta: silZoneTxt},
      {label:'WCSS pada K terpilih', value: kResult.wcss.toFixed(2), delta:'Within-Cluster Sum of Squares (skala data terstandardisasi)'},
      {label:'K yang disarankan Elbow', value: suggestedK===null?'—':('K = '+suggestedK), delta:'titik penurunan WCSS paling tajam (heuristik elbow)'}
    ];
    kEl.innerHTML = kCards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');
    narrParas.push('Segmentasi pelanggan saat ini menggunakan <b>K = '+k+'</b> dengan Silhouette Score <b>'+silTxt+'</b>'+(suggestedK!==null?', sementara metode Elbow menyarankan sekitar <b>K = '+suggestedK+'</b> berdasarkan titik penurunan WCSS paling tajam':'')+'. Silhouette Score mengukur seberapa baik tiap pelanggan cocok dengan cluster-nya sendiri dibanding cluster lain, pada rentang -1 sampai 1.');
  }

  var model = getForecastModel();
  var evalRes = evaluateForecast(model);
  if(!evalRes.ok){
    fEl.innerHTML='';
    fEmptyEl.style.display='';
    fEmptyEl.textContent = 'Evaluasi forecasting belum dapat dihitung: data historis pada filter ini hanya '+evalRes.n+' hari, sedangkan evaluasi memerlukan minimal '+evalRes.minNeeded+' hari data transaksi.';
  } else {
    fEmptyEl.style.display='none';
    var fCards = [
      {label:'MAE', value: idr(evalRes.mae), delta:'rata-rata selisih absolut prediksi vs aktual'},
      {label:'RMSE', value: idr(evalRes.rmse), delta:'lebih sensitif terhadap kesalahan besar'},
      {label:'MAPE', value: evalRes.mape===null?'Tidak dapat dihitung':evalRes.mape.toFixed(1)+'%', delta:'rata-rata persentase kesalahan'},
      {label:'Data latih / data uji', value: evalRes.trainSize+' / '+evalRes.testSize+' hari', delta:'pembagian data historis untuk backtesting'}
    ];
    fEl.innerHTML = fCards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');
    narrParas.push('Model forecasting (regresi linier) diuji dengan melatih ulang model pada '+evalRes.trainSize+' hari data historis paling awal, lalu membandingkan hasil prediksinya dengan '+evalRes.testSize+' hari data terbaru yang tidak dipakai untuk melatih model. Hasilnya: MAE <b>'+idr(evalRes.mae)+'</b>, RMSE <b>'+idr(evalRes.rmse)+'</b>'+(evalRes.mape!==null?', dan MAPE <b>'+evalRes.mape.toFixed(1)+'%</b>':'')+'.');
  }

  narrEl.innerHTML = narrParas.length ? narrParas.map(function(p){ return '<p>'+p+'</p>'; }).join('') : '<p>Evaluasi model akan tersedia setelah data cukup untuk menjalankan clustering dan/atau forecasting.</p>';
}

/* ---------------- Executive Summary ---------------- */
function renderExecutiveSummary(){
  var stripEl = document.getElementById('execKpiStrip');
  var narrEl = document.getElementById('execNarrative');
  if(!stripEl) return;
  if(!state.records.length){
    stripEl.innerHTML=''; narrEl.innerHTML = '<p>Unggah data pesanan untuk menghasilkan ringkasan eksekutif otomatis.</p>';
    return;
  }
  var ins = computeBusinessInsight();
  var mba = computeMarketBasket();

  stripEl.innerHTML = [
    {l:'Pendapatan', v: idr(ins.totalRevenue)},
    {l:'Transaksi', v: ins.totalTransactions.toLocaleString('id-ID')},
    {l:'Pelanggan', v: ins.totalCustomers===null?'—':ins.totalCustomers.toLocaleString('id-ID')},
    {l:'Rata-rata transaksi', v: idr(ins.avgTransaction)}
  ].map(function(c){ return '<span class="chip">'+c.l+': <b>'+c.v+'</b></span>'; }).join('');

  var paras = [];
  paras.push('Pada periode dan filter data yang sedang aktif, bisnis ini mencatat total pendapatan <b>'+idr(ins.totalRevenue)+'</b> dari <b>'+ins.totalTransactions.toLocaleString('id-ID')+'</b> transaksi'+(ins.totalCustomers!==null?' yang melibatkan <b>'+ins.totalCustomers.toLocaleString('id-ID')+'</b> pelanggan unik':'')+', dengan rata-rata nilai transaksi <b>'+idr(ins.avgTransaction)+'</b>.');

  if(ins.topProductByRevenue){
    paras.push('Produk dengan kontribusi pendapatan terbesar adalah <b>'+escapeHtml(ins.topProductByRevenue.name)+'</b>, sementara produk dengan volume penjualan (unit) terbanyak adalah <b>'+escapeHtml(ins.topProductByUnits?ins.topProductByUnits.name:'-')+'</b>.');
  }

  if(lastClusterSummaries && lastClusterSummaries.length){
    var byCnt = lastClusterSummaries.slice().sort(function(a,b){ return b.cnt-a.cnt; });
    var labelsTxt = lastClusterSummaries.map(function(s){ return s.label+' ('+s.cnt.toLocaleString('id-ID')+' pelanggan)'; }).join(', ');
    paras.push('Segmentasi pelanggan (K-Means, K='+lastKmeansK+') membagi pelanggan menjadi segmen: '+labelsTxt+'. Segmen terbesar adalah <b>'+byCnt[0].label+'</b> dengan '+byCnt[0].cnt.toLocaleString('id-ID')+' pelanggan.');
  }

  var model = ins.forecastModel;
  if(model.hasEnoughData){
    var relSlope = model.avgDaily>0 ? model.reg.slope/model.avgDaily : 0;
    var trendWord = relSlope>0.01?'tren kenaikan':(relSlope<-0.01?'tren penurunan':'tren yang relatif stabil');
    paras.push('Proyeksi penjualan ke depan menunjukkan '+trendWord+' berdasarkan regresi linier atas '+model.actualDays+' hari data historis. Detail akurasi model (MAE/RMSE/MAPE) tersedia pada halaman Model Evaluation.');
  }

  if(mba.ok && mba.rules.length){
    var topRule = mba.rules[0];
    paras.push('Market Basket Analysis menemukan pola pembelian bersamaan, misalnya antara <b>'+escapeHtml(topRule.a)+'</b> dan <b>'+escapeHtml(topRule.b)+'</b> (lift '+topRule.lift.toFixed(2)+'x), yang dapat dimanfaatkan untuk strategi bundling atau cross-selling.');
  }

  paras.push('Rekomendasi tindakan bisnis yang lebih rinci berdasarkan seluruh temuan di atas tersedia pada halaman Business Recommendation.');

  narrEl.innerHTML = paras.map(function(p){ return '<p>'+p+'</p>'; }).join('');
}
