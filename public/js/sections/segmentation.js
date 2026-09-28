"use strict";

/* ---------------- Customer Segmentation (K-Means) ---------------- */
// K-Means dijalankan secara dinamis atas nilai R, F, M yang sudah dihitung
// pada Customer Analytics (RFM) di atas — tidak ada data dummy atau hasil
// cluster manual. Fitur ini tidak mengubah perhitungan RFM sama sekali;
// ia hanya membaca daftar pelanggan yang sudah dihasilkan getCustomerAnalytics().
var CLUSTER_COLORS = ['#4E79A7', '#F28E2B', '#E15759', '#59A14F', '#B07AA1'];
var KMEANS_MIN_CUSTOMERS = 4;       // minimal pelanggan agar clustering dijalankan sama sekali
var KMEANS_SILHOUETTE_MAX_N = 1500; // batas jumlah pelanggan agar Silhouette Score tetap dihitung real-time di peramban

function kmeansSquaredDist(a, b){
  var s = 0;
  for(var i=0;i<a.length;i++){ var d = a[i]-b[i]; s += d*d; }
  return s;
}

// Standarisasi (z-score) R, F, M agar skala Monetary (biasanya jauh lebih besar)
// tidak mendominasi perhitungan jarak K-Means.
function standardizeRFM(list){
  function meanStd(arr){
    var m = arr.reduce(function(a,b){ return a+b; }, 0) / arr.length;
    var v = arr.reduce(function(a,b){ return a+(b-m)*(b-m); }, 0) / arr.length;
    return { mean:m, std: Math.sqrt(v) || 1 };
  }
  var rStat = meanStd(list.map(function(c){ return c.recency; }));
  var fStat = meanStd(list.map(function(c){ return c.frequency; }));
  var mStat = meanStd(list.map(function(c){ return c.monetary; }));
  return list.map(function(c){
    return [
      (c.recency - rStat.mean) / rStat.std,
      (c.frequency - fStat.mean) / fStat.std,
      (c.monetary - mStat.mean) / mStat.std
    ];
  });
}

function kmeansPlusPlusInit(points, k){
  var centroids = [points[Math.floor(Math.random()*points.length)].slice()];
  while(centroids.length < k){
    var dist = points.map(function(p){
      var minD = Infinity;
      centroids.forEach(function(c){ var d = kmeansSquaredDist(p,c); if(d<minD) minD=d; });
      return minD;
    });
    var sum = dist.reduce(function(a,b){ return a+b; }, 0);
    if(sum === 0){
      centroids.push(points[Math.floor(Math.random()*points.length)].slice());
      continue;
    }
    var r = Math.random()*sum, acc = 0, chosen = points[points.length-1];
    for(var i=0;i<points.length;i++){
      acc += dist[i];
      if(acc >= r){ chosen = points[i]; break; }
    }
    centroids.push(chosen.slice());
  }
  return centroids;
}

function runKMeansOnce(points, k, maxIter){
  maxIter = maxIter || 200;
  var n = points.length, dim = points[0].length;
  var centroids = kmeansPlusPlusInit(points, k);
  var assignments = new Array(n).fill(-1);
  for(var iter=0; iter<maxIter; iter++){
    var changed = false;
    for(var i=0;i<n;i++){
      var best=0, bestD=Infinity;
      for(var c=0;c<k;c++){
        var d = kmeansSquaredDist(points[i], centroids[c]);
        if(d<bestD){ bestD=d; best=c; }
      }
      if(assignments[i] !== best){ assignments[i]=best; changed=true; }
    }
    var sums=[], counts=[];
    for(var c2=0;c2<k;c2++){ sums.push(new Array(dim).fill(0)); counts.push(0); }
    for(var i2=0;i2<n;i2++){
      counts[assignments[i2]]++;
      for(var d2=0; d2<dim; d2++) sums[assignments[i2]][d2] += points[i2][d2];
    }
    for(var c3=0;c3<k;c3++){
      if(counts[c3] > 0){
        centroids[c3] = sums[c3].map(function(v){ return v/counts[c3]; });
      } else {
        // cluster kosong: pindahkan centroid ke titik terjauh dari centroid-nya saat ini
        var farI=0, farD=-1;
        for(var i3=0;i3<n;i3++){
          var dd = kmeansSquaredDist(points[i3], centroids[assignments[i3]]);
          if(dd>farD){ farD=dd; farI=i3; }
        }
        centroids[c3] = points[farI].slice();
        changed = true;
      }
    }
    if(!changed) break;
  }
  var wcss = 0;
  for(var i4=0;i4<n;i4++) wcss += kmeansSquaredDist(points[i4], centroids[assignments[i4]]);
  return { centroids:centroids, assignments:assignments, wcss:wcss };
}

function runKMeansBest(points, k, restarts){
  restarts = restarts || 8;
  if(k <= 1){
    var mean = points[0].map(function(_, d){ return points.reduce(function(a,p){ return a+p[d]; },0)/points.length; });
    var assignments = points.map(function(){ return 0; });
    var wcss = points.reduce(function(a,p){ return a+kmeansSquaredDist(p, mean); }, 0);
    return { centroids:[mean], assignments:assignments, wcss:wcss };
  }
  var best = null;
  for(var r=0;r<restarts;r++){
    var res = runKMeansOnce(points, k);
    if(!best || res.wcss < best.wcss) best = res;
  }
  return best;
}

function silhouetteScore(points, assignments, k){
  var n = points.length;
  if(n < 3) return null;
  var clusters = [];
  for(var c=0;c<k;c++) clusters.push([]);
  for(var i=0;i<n;i++) clusters[assignments[i]].push(i);
  if(clusters.filter(function(c){ return c.length>0; }).length < 2) return null;

  var total = 0, counted = 0;
  for(var i2=0;i2<n;i2++){
    var own = assignments[i2];
    var ownCluster = clusters[own];
    var a;
    if(ownCluster.length <= 1){
      a = 0;
    } else {
      var sumA = 0;
      ownCluster.forEach(function(j){ if(j!==i2) sumA += Math.sqrt(kmeansSquaredDist(points[i2], points[j])); });
      a = sumA/(ownCluster.length-1);
    }
    var b = Infinity;
    for(var c2=0;c2<k;c2++){
      if(c2===own || clusters[c2].length===0) continue;
      var sumB = 0;
      clusters[c2].forEach(function(j){ sumB += Math.sqrt(kmeansSquaredDist(points[i2], points[j])); });
      var avgB = sumB/clusters[c2].length;
      if(avgB<b) b=avgB;
    }
    if(b===Infinity) continue;
    var s = (b-a)/Math.max(a,b);
    if(isNaN(s)) s = 0;
    total += s;
    counted++;
  }
  return counted>0 ? total/counted : null;
}

function getKMeansResult(list, k){
  var n = list.length;
  if(n < KMEANS_MIN_CUSTOMERS) return { ok:false, reason:'too_few_overall', n:n };
  if(n < k * 2) return { ok:false, reason:'too_few_for_k', n:n, k:k };
  var points = standardizeRFM(list);
  var best = runKMeansBest(points, k, 8);
  var skipSilhouette = n > KMEANS_SILHOUETTE_MAX_N;
  var silhouette = skipSilhouette ? null : silhouetteScore(points, best.assignments, k);
  return {
    ok:true, points:points, assignments:best.assignments, centroids:best.centroids,
    wcss:best.wcss, k:k, silhouette:silhouette, silhouetteSkipped:skipSilhouette
  };
}

function computeElbow(list, maxK){
  var n = list.length;
  var kmax = Math.min(maxK, n-1, 8);
  if(kmax < 1) return [];
  var points = standardizeRFM(list);
  var out = [];
  for(var k=1;k<=kmax;k++){
    out.push({ k:k, wcss: runKMeansBest(points, k, 5).wcss });
  }
  return out;
}

function renderCustomerSegmentation(){
  var emptyEl = document.getElementById('kmeansEmpty');
  var contentEl = document.getElementById('kmeansContent');
  var rfmResult = getCustomerAnalytics();

  function showEmpty(msg){
    contentEl.classList.add('hidden');
    emptyEl.classList.add('show');
    emptyEl.textContent = msg;
    if(charts.kmeansScatter){ charts.kmeansScatter.destroy(); charts.kmeansScatter=null; }
    if(charts.elbow){ charts.elbow.destroy(); charts.elbow=null; }
    lastClusterSummaries = null;
  }

  if(!rfmResult.ok){
    showEmpty('Segmentasi K-Means membutuhkan hasil analisis RFM yang valid. Lengkapi identitas pelanggan pada data yang diunggah, lalu periksa kembali bagian Customer Analytics (RFM) di atas.');
    return;
  }

  var clusterableList = rfmResult.list.filter(function(c){ return c.recency !== null; });
  var k = state.kmeansK;
  var result = getKMeansResult(clusterableList, k);

  if(!result.ok){
    if(result.reason === 'too_few_overall'){
      showEmpty('Jumlah pelanggan dengan data RFM lengkap belum mencukupi untuk clustering (tersedia ' + result.n + ' pelanggan, minimal ' + KMEANS_MIN_CUSTOMERS + '). Tambahkan data transaksi untuk mengaktifkan segmentasi ini.');
    } else {
      showEmpty('Jumlah pelanggan yang tersedia (' + result.n + ') tidak mencukupi untuk K=' + result.k + '. Pilih nilai K yang lebih kecil atau tambahkan data pelanggan.');
    }
    return;
  }

  emptyEl.classList.remove('show');
  contentEl.classList.remove('hidden');

  var css = getComputedStyle(document.documentElement);

  // ---- Elbow chart ----
  var elbowData = computeElbow(clusterableList, 8);
  var ctxElbow = document.getElementById('elbowChart').getContext('2d');
  if(charts.elbow) charts.elbow.destroy();
  charts.elbow = new Chart(ctxElbow, {
    type: 'line',
    data: {
      labels: elbowData.map(function(e){ return 'K=' + e.k; }),
      datasets: [{
        label: 'WCSS',
        data: elbowData.map(function(e){ return e.wcss; }),
        borderColor: css.getPropertyValue('--chart-line').trim(),
        backgroundColor: css.getPropertyValue('--chart-line-soft').trim(),
        pointBackgroundColor: elbowData.map(function(e){ return e.k===k ? css.getPropertyValue('--amber').trim() : css.getPropertyValue('--chart-line').trim(); }),
        pointRadius: elbowData.map(function(e){ return e.k===k ? 6 : 3; }),
        tension: 0.25,
        fill: true
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ display:false } },
      scales: {
        x: { grid:{color: css.getPropertyValue('--chart-grid').trim()}, ticks:{color: css.getPropertyValue('--ink-muted').trim()} },
        y: { grid:{color: css.getPropertyValue('--chart-grid').trim()}, ticks:{color: css.getPropertyValue('--ink-muted').trim()}, title:{display:true, text:'WCSS', color: css.getPropertyValue('--ink-muted').trim(), font:{size:11}} }
      }
    }
  });

  // ---- Bubble berwarna per cluster ----
  // Sama seperti scatter Frequency/Monetary di atas: pelanggan yang bertumpuk
  // pada Frequency & rentang Monetary yang sama digabung jadi satu bubble
  // (ukuran = jumlah pelanggan). Ketika lebih dari satu cluster berbagi
  // Frequency yang sama, bubble tiap cluster digeser sedikit secara mendatar
  // (jitterWidth) supaya tidak saling menimpa dan tetap mudah dibedakan warnanya.
  var kmeansStep = monetaryBucketStep(clusterableList, 8);
  var jitterWidth = 0.16;
  var kmeansBubbles = clusterableList.map(function(cust, i){ return { frequency: cust.frequency, monetary: cust.monetary, customer_id: cust.customer_id, cluster: result.assignments[i] }; });
  var byCluster = [];
  for(var c=0;c<k;c++){
    var clusterList = kmeansBubbles.filter(function(p){ return p.cluster === c; })
      .map(function(p){ return { frequency:p.frequency, monetary:p.monetary, customer_id:p.customer_id }; });
    var cells = buildBubbleCells(clusterList, kmeansStep, function(){ return 0; }, function(){ return (c - (k-1)/2) * jitterWidth; });
    byCluster.push(cells);
  }
  var ctxScatter = document.getElementById('kmeansScatterChart').getContext('2d');
  if(charts.kmeansScatter) charts.kmeansScatter.destroy();
  charts.kmeansScatter = new Chart(ctxScatter, {
    type: 'bubble',
    data: {
      datasets: byCluster.map(function(cells, idx){
        return {
          label: 'Cluster ' + (idx+1),
          data: cells,
          backgroundColor: CLUSTER_COLORS[idx % CLUSTER_COLORS.length] + 'B3',
          borderColor: CLUSTER_COLORS[idx % CLUSTER_COLORS.length],
          borderWidth: 1
        };
      })
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:true, position:'bottom', labels:{ color: css.getPropertyValue('--ink-muted').trim(), boxWidth:10, font:{size:11} } },
        tooltip: { callbacks: { label: function(item){
          return bubbleTooltipLine(item.raw, kmeansStep, item.dataset.label);
        } } }
      },
      scales: {
        x: { title:{display:true, text:'Frequency (jumlah transaksi)', color: css.getPropertyValue('--ink-muted').trim(), font:{size:11}}, grid:{color: css.getPropertyValue('--chart-grid').trim()}, ticks:{precision:0, color: css.getPropertyValue('--ink-muted').trim()}, min:0.5 },
        y: { title:{display:true, text:'Monetary (Rp)', color: css.getPropertyValue('--ink-muted').trim(), font:{size:11}}, grid:{color: css.getPropertyValue('--chart-grid').trim()}, ticks:{callback:function(v){ return idrShort(v); }, color: css.getPropertyValue('--ink-muted').trim()}, min:0 }
      }
    }
  });

  // ---- Ringkasan per cluster (dihitung lebih dulu supaya bisa dipakai juga
  // oleh panel Evaluasi kualitas clustering di sebelahnya) ----
  var summaries = [];
  for(var c4=0;c4<k;c4++){
    var members = clusterableList.filter(function(cust, i){ return result.assignments[i] === c4; });
    var cnt = members.length;
    var avgR = cnt ? members.reduce(function(a,b){ return a+b.recency; },0)/cnt : 0;
    var avgF = cnt ? members.reduce(function(a,b){ return a+b.frequency; },0)/cnt : 0;
    var avgM = cnt ? members.reduce(function(a,b){ return a+b.monetary; },0)/cnt : 0;
    summaries.push({ idx:c4, cnt:cnt, avgR:avgR, avgF:avgF, avgM:avgM });
  }
  interpretClusters(summaries);
  lastClusterSummaries = summaries;
  lastKmeansK = k;

  // ---- Silhouette Score + gauge visual ----
  var silEl = document.getElementById('kmeansSilhouette');
  var silNote = document.getElementById('kmeansSilhouetteNote');
  var silGaugeWrap = document.getElementById('silGaugeWrap');
  var silGaugeTag = document.getElementById('silGaugeTag');
  var silGaugeMarker = document.getElementById('silGaugeMarker');
  var extraStatsEl = document.getElementById('kmeansExtraStats');

  function setGauge(value){
    if(silGaugeWrap) silGaugeWrap.style.display = value === null ? 'none' : '';
    if(value === null) return;
    var pct = Math.max(0, Math.min(100, (value+1)/2*100));
    if(silGaugeMarker) silGaugeMarker.style.left = pct + '%';
    var zone = value <= 0.25 ? 'weak' : (value <= 0.5 ? 'fair' : (value <= 0.7 ? 'good' : 'great'));
    var zoneLabel = { weak:'Lemah', fair:'Cukup', good:'Baik', great:'Sangat baik' }[zone];
    if(silGaugeTag){
      silGaugeTag.textContent = zoneLabel;
      silGaugeTag.className = 'tag sil-tag-' + zone;
    }
  }

  if(result.silhouetteSkipped){
    silEl.textContent = '—';
    silNote.textContent = 'Jumlah pelanggan (' + clusterableList.length + ') terlalu besar untuk dihitung secara real-time di peramban, sehingga Silhouette Score dilewati agar dasbor tetap responsif.';
    setGauge(null);
  } else if(result.silhouette === null){
    silEl.textContent = '—';
    silNote.textContent = 'Silhouette Score belum dapat dihitung untuk konfigurasi cluster saat ini.';
    setGauge(null);
  } else {
    silEl.textContent = result.silhouette.toFixed(3);
    silNote.textContent = 'Mengukur seberapa baik setiap pelanggan cocok dengan cluster-nya sendiri dibanding cluster lain. Rentang -1 sampai 1 — semakin mendekati 1, pemisahan antar-cluster semakin jelas.';
    setGauge(result.silhouette);
  }

  // Statistik tambahan (mengisi ruang di panel evaluasi dengan konteks yang
  // relevan: seberapa besar & seimbang cluster yang terbentuk).
  if(extraStatsEl){
    var totalMembers = summaries.reduce(function(s,x){ return s+x.cnt; }, 0);
    var biggest = summaries.reduce(function(a,b){ return b.cnt>a.cnt ? b : a; }, summaries[0] || {cnt:0,idx:0});
    var smallest = summaries.reduce(function(a,b){ return b.cnt<a.cnt ? b : a; }, summaries[0] || {cnt:0,idx:0});
    var extraCards = [
      { label:'Pelanggan dianalisis', value: totalMembers.toLocaleString('id-ID'), delta: 'terbagi ke ' + k + ' cluster (K=' + k + ')' },
      { label:'Cluster terbesar', value: 'Cluster ' + (biggest.idx+1), delta: biggest.cnt.toLocaleString('id-ID') + ' pelanggan (' + (totalMembers ? (biggest.cnt/totalMembers*100).toFixed(0) : 0) + '%)' },
      { label:'Cluster terkecil', value: 'Cluster ' + (smallest.idx+1), delta: smallest.cnt.toLocaleString('id-ID') + ' pelanggan (' + (totalMembers ? (smallest.cnt/totalMembers*100).toFixed(0) : 0) + '%)' }
    ];
    extraStatsEl.innerHTML = extraCards.map(function(s){
      return '<div class="kpi-card"><div class="kpi-label">'+s.label+'</div><div class="kpi-value tabular">'+s.value+'</div><div class="kpi-delta">'+s.delta+'</div></div>';
    }).join('');
  }

  document.getElementById('kmeansClusterSummary').innerHTML = summaries.map(function(s){
    var color = CLUSTER_COLORS[s.idx % CLUSTER_COLORS.length];
    return '<div class="kpi-card" style="border-left-color:'+color+'">'+
      '<div class="kpi-label"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+color+';margin-right:6px;"></span>Cluster '+(s.idx+1)+'<span class="cluster-label-tag">'+escapeHtml(s.label)+'</span></div>'+
      '<div class="kpi-value tabular">'+s.cnt.toLocaleString('id-ID')+' pelanggan</div>'+
      '<div class="kpi-delta">Recency rata-rata: '+s.avgR.toFixed(1)+' hari</div>'+
      '<div class="kpi-delta">Frequency rata-rata: '+s.avgF.toFixed(1)+'x</div>'+
      '<div class="kpi-delta">Monetary rata-rata: '+idr(s.avgM)+'</div>'+
      '<div class="cluster-explain">'+escapeHtml(s.explanation)+'</div>'+
    '</div>';
  }).join('');

  // ---- Tabel hasil segmentasi (dengan pagination) ----
  var tableList = clusterableList.map(function(cust, i){
    return { customer_id:cust.customer_id, recency:cust.recency, frequency:cust.frequency, monetary:cust.monetary, cluster:result.assignments[i] };
  });
  var n2 = tableList.length;
  var totalPages = Math.max(1, Math.ceil(n2 / state.kmeansPageSize));
  state.kmeansPage = Math.min(state.kmeansPage, totalPages-1);
  var start2 = state.kmeansPage * state.kmeansPageSize;
  var pageList2 = tableList.slice(start2, start2+state.kmeansPageSize);
  var tbody2 = document.getElementById('kmeansTableBody');
  if(!pageList2.length){
    tbody2.innerHTML = '<tr><td colspan="5" style="color:var(--ink-muted)">Tidak ada pelanggan yang cocok.</td></tr>';
  } else {
    tbody2.innerHTML = pageList2.map(function(c){
      var color = CLUSTER_COLORS[c.cluster % CLUSTER_COLORS.length];
      var lbl = summaries[c.cluster] ? summaries[c.cluster].label : '';
      return '<tr><td class="rfm-cust-cell">'+escapeHtml(c.customer_id)+'</td><td class="tabular">'+(c.recency===null?'—':c.recency)+'</td><td class="tabular">'+c.frequency+'</td><td class="tabular">'+idr(c.monetary)+'</td>'+
        '<td><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:'+color+';display:inline-block;flex-shrink:0;"></span>Cluster '+(c.cluster+1)+(lbl?' — '+escapeHtml(lbl):'')+'</span></td></tr>';
    }).join('');
  }
  document.getElementById('kmeansTableDesc').textContent = n2.toLocaleString('id-ID') + ' pelanggan dikelompokkan ke dalam ' + k + ' cluster (K=' + k + ')';
  document.getElementById('kmeansPagerInfo').textContent = 'Halaman ' + (state.kmeansPage+1) + ' dari ' + totalPages;
  document.getElementById('kmeansPagerPrev').disabled = state.kmeansPage <= 0;
  document.getElementById('kmeansPagerNext').disabled = state.kmeansPage >= totalPages-1;
}

var kmeansKTabs = document.getElementById('kmeansKTabs');
kmeansKTabs.addEventListener('click', function(e){
  var btn = e.target.closest('button');
  if(!btn) return;
  state.kmeansK = parseInt(btn.getAttribute('data-k'), 10);
  state.kmeansPage = 0;
  Array.from(kmeansKTabs.children).forEach(function(b){ b.classList.toggle('active', b===btn); });
  renderCustomerSegmentation();
});
document.getElementById('kmeansPagerPrev').addEventListener('click', function(){ state.kmeansPage--; renderCustomerSegmentation(); });
document.getElementById('kmeansPagerNext').addEventListener('click', function(){ state.kmeansPage++; renderCustomerSegmentation(); });

/* ---------------- Interpretasi cluster K-Means -> label bisnis ---------------- */
// Dihitung dari rata-rata R, F, M AKTUAL tiap cluster (relatif antar-cluster
// pada K yang sedang dipilih) — bukan label tetap/hardcoded. Setiap cluster
// diberi skor 0..1 pada tiap dimensi (skor R dibalik karena Recency makin
// kecil makin baik), lalu diklasifikasikan ke kategori bisnis yang paling
// sesuai dengan kombinasi skornya.
function interpretClusters(summaries){
  var n = summaries.length;
  if(!n) return summaries;
  var rVals = summaries.map(function(s){ return s.avgR; });
  var fVals = summaries.map(function(s){ return s.avgF; });
  var mVals = summaries.map(function(s){ return s.avgM; });
  var rMin=Math.min.apply(null,rVals), rMax=Math.max.apply(null,rVals);
  var fMin=Math.min.apply(null,fVals), fMax=Math.max.apply(null,fVals);
  var mMin=Math.min.apply(null,mVals), mMax=Math.max.apply(null,mVals);
  function norm(v,min,max){ return max>min ? (v-min)/(max-min) : 0.5; }
  summaries.forEach(function(s){
    var rScore = 1 - norm(s.avgR, rMin, rMax);
    var fScore = norm(s.avgF, fMin, fMax);
    var mScore = norm(s.avgM, mMin, mMax);
    s.scores = { r:rScore, f:fScore, m:mScore };
    var label, explanation;
    if(rScore>=0.66 && fScore>=0.5 && mScore>=0.66){
      label='High Value Customer';
      explanation='Baru saja bertransaksi, cukup sering membeli, dan nilai transaksinya tinggi — segmen paling bernilai saat ini.';
    } else if(rScore<0.34 && (fScore>=0.4 || mScore>=0.4)){
      label='At Risk Customer';
      explanation='Sudah cukup lama tidak bertransaksi meskipun sebelumnya cukup aktif/bernilai — berisiko churn jika tidak direaktivasi.';
    } else if(fScore>=0.66 && mScore<0.66){
      label='Loyal Customer';
      explanation='Sering bertransaksi (frekuensi tinggi) meski nilai rata-rata per transaksinya belum setinggi segmen High Value.';
    } else if(rScore>=0.5 && fScore<0.34 && mScore<0.5){
      label='New / Occasional Customer';
      explanation='Baru-baru ini bertransaksi namun frekuensinya masih rendah — berpotensi menjadi pelanggan tetap jika ditindaklanjuti.';
    } else if(rScore<0.5 && fScore<0.34 && mScore<0.34){
      label='Hibernating / Low-Value Customer';
      explanation='Recency, Frequency, dan Monetary sama-sama rendah dibanding segmen lain — kontribusinya terhadap bisnis saat ini kecil.';
    } else {
      label='Potential Loyalist';
      explanation='Karakteristik RFM berada pada level menengah di seluruh dimensi — berpotensi naik kelas menjadi pelanggan loyal dengan pendekatan yang tepat.';
    }
    s.label = label;
    s.explanation = explanation + ' (Recency rata-rata ' + s.avgR.toFixed(1) + ' hari, Frequency rata-rata ' + s.avgF.toFixed(1) + 'x, Monetary rata-rata ' + idr(s.avgM) + '.)';
  });
  return summaries;
}

function fmtFullDate(key){
  var d = new Date(key);
  if(isNaN(d.getTime())) return key;
  return d.toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'});
}
