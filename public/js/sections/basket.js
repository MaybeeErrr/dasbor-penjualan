"use strict";

/* ---------------- Market Basket Analysis (Algoritma Apriori) ---------------- */
// Implementasi Apriori berjenjang yang sesungguhnya:
//   1) Hitung frequent 1-itemset (L1) dari support tiap produk.
//   2) Bangun kandidat k-itemset dari Lk-1 (join step: gabungkan dua itemset
//      yang berbeda hanya pada elemen terakhir), lalu buang kandidat yang
//      punya subset berukuran (k-1) yang TIDAK frequent (prune step, sesuai
//      sifat "downward closure" Apriori: semua subset dari itemset frequent
//      pasti frequent juga).
//   3) Hitung ulang support tiap kandidat pada transaksi, simpan yang lolos
//      ambang minimum sebagai Lk. Ulangi sampai MBA_MAX_ITEMSET_SIZE atau
//      sampai tidak ada kandidat frequent lagi.
//   4) Dari setiap frequent itemset berukuran >=2, bangkitkan seluruh aturan
//      asosiasi (antecedent -> consequent) dan hitung confidence & lift.
// Menggunakan No. Pesanan sebagai id transaksi dan Nama Produk sebagai item.
// Jika struktur data tidak mendukung (tidak cukup pesanan multi-produk),
// fitur ini TIDAK membuat data buatan — cukup menampilkan penjelasan.
var MBA_MIN_MULTI_ITEM = 5;
var MBA_MAX_PRODUCTS = 30;     // batasi jumlah produk unik yang dianalisis agar tetap responsif di peramban
var MBA_MAX_ITEMSET_SIZE = 3;  // ukuran itemset maksimum (1, 2, 3-item combinations)
var MBA_MAX_CANDIDATES = 4000; // pengaman agar candidate generation tidak meledak pada data besar

function itemsetKey(items){ return items.slice().sort().join('\u0001'); }

// Join step Apriori klasik: dua itemset berukuran (k-1) yang k-2 elemen
// pertamanya (setelah diurutkan) identik digabung menjadi satu kandidat
// berukuran k. Ini yang membuat proses berjenjang (bukan sekadar pasangan).
function joinItemsets(a, b){
  var n = a.length;
  for(var i=0;i<n-1;i++){ if(a[i] !== b[i]) return null; }
  if(a[n-1] === b[n-1]) return null;
  var merged = a.slice(0, n-1).concat([a[n-1], b[n-1]]).sort();
  return merged;
}

// Prune step: sebuah kandidat berukuran k hanya boleh diuji supportnya jika
// SEMUA subset berukuran (k-1)-nya sudah terbukti frequent pada langkah
// sebelumnya (downward closure property).
function allSubsetsFrequent(candidate, prevKeySet){
  for(var i=0;i<candidate.length;i++){
    var subset = candidate.slice(0,i).concat(candidate.slice(i+1));
    if(!prevKeySet[itemsetKey(subset)]) return false;
  }
  return true;
}

function countSupport(itemsArr, transactions){
  return itemsArr.map(function(items){
    var cnt = 0;
    for(var t=0;t<transactions.length;t++){
      var tSet = transactions[t];
      var ok = true;
      for(var i=0;i<items.length;i++){ if(!tSet[items[i]]){ ok=false; break; } }
      if(ok) cnt++;
    }
    return cnt;
  });
}

// Semua subset tak-kosong dari sebuah itemset (dipakai untuk membangkitkan
// aturan antecedent -> consequent dari tiap frequent itemset).
function nonEmptyProperSubsets(items){
  var subsets = [];
  var n = items.length;
  for(var mask=1; mask < (1<<n)-1; mask++){
    var subset = [];
    for(var i=0;i<n;i++){ if(mask & (1<<i)) subset.push(items[i]); }
    subsets.push(subset);
  }
  return subsets;
}

function computeMarketBasket(){
  var recs = state.filtered.filter(function(r){ return OrderStatus.isCompleted(r.status); });
  if(!recs.length) return { ok:false, reason:'no_data' };
  var byOrder = {};
  recs.forEach(function(r){
    if(!r.order_id) return;
    var name = (r.product || '').trim();
    if(!name) return;
    if(!byOrder[r.order_id]) byOrder[r.order_id] = {};
    byOrder[r.order_id][name] = true;
  });
  var orderIds = Object.keys(byOrder);
  if(!orderIds.length) return { ok:false, reason:'no_orders' };
  var rawTransactions = orderIds.map(function(id){ return Object.keys(byOrder[id]); });
  var totalTransactions = rawTransactions.length;
  var multiItemCount = rawTransactions.filter(function(t){ return t.length>=2; }).length;
  if(multiItemCount < MBA_MIN_MULTI_ITEM){
    return { ok:false, reason:'insufficient_multi_item', multiItemCount:multiItemCount, totalTransactions:totalTransactions };
  }

  var freq1Full = {};
  rawTransactions.forEach(function(items){ items.forEach(function(p){ freq1Full[p] = (freq1Full[p]||0)+1; }); });
  var totalUniqueProducts = Object.keys(freq1Full).length;
  var topProducts = Object.keys(freq1Full).sort(function(a,b){ return freq1Full[b]-freq1Full[a]; }).slice(0, MBA_MAX_PRODUCTS);
  var topSet = {}; topProducts.forEach(function(p){ topSet[p]=true; });

  // Transaksi dipangkas ke produk teratas saja (agar kompleksitas kandidat
  // terkendali); transaksi yang jadi kosong setelah pemangkasan dibuang.
  var transactions = rawTransactions
    .map(function(items){ var t={}; items.forEach(function(p){ if(topSet[p]) t[p]=true; }); return t; })
    .filter(function(t){ return Object.keys(t).length>0; });

  var minSupportCount = Math.max(2, Math.ceil(totalTransactions*0.01));

  // ---- L1: frequent 1-itemset ----
  var L1 = topProducts.filter(function(p){ return freq1Full[p] >= minSupportCount; })
    .map(function(p){ return { items:[p], count:freq1Full[p] }; });

  var supportLookup = {}; // itemsetKey -> count, dipakai lagi saat membangkitkan aturan
  L1.forEach(function(it){ supportLookup[itemsetKey(it.items)] = it.count; });

  var levels = { 1: L1 };
  var allFrequentItemsets = L1.slice();
  var truncatedForPerformance = false;

  for(var k=2; k<=MBA_MAX_ITEMSET_SIZE; k++){
    var prev = levels[k-1];
    if(!prev || prev.length < 2) break;
    var prevKeySet = {};
    prev.forEach(function(it){ prevKeySet[itemsetKey(it.items)] = true; });

    // Candidate generation (join step)
    var candMap = {};
    outer:
    for(var i=0;i<prev.length;i++){
      for(var j=i+1;j<prev.length;j++){
        var merged = joinItemsets(prev[i].items, prev[j].items);
        if(!merged) continue;
        var key = itemsetKey(merged);
        if(candMap[key]) continue;
        // Prune step (downward closure)
        if(!allSubsetsFrequent(merged, prevKeySet)) continue;
        candMap[key] = merged;
        if(Object.keys(candMap).length >= MBA_MAX_CANDIDATES){ truncatedForPerformance = true; break outer; }
      }
    }
    var candidates = Object.keys(candMap).map(function(key){ return candMap[key]; });
    if(!candidates.length) break;

    var counts = countSupport(candidates, transactions);
    var Lk = [];
    candidates.forEach(function(cand, idx){
      if(counts[idx] >= minSupportCount){
        Lk.push({ items:cand, count:counts[idx] });
        supportLookup[itemsetKey(cand)] = counts[idx];
      }
    });
    if(!Lk.length) break;
    levels[k] = Lk;
    allFrequentItemsets = allFrequentItemsets.concat(Lk);
  }

  // ---- Bangkitkan aturan asosiasi dari tiap frequent itemset berukuran >=2 ----
  var rules = [];
  Object.keys(levels).forEach(function(kStr){
    var k = parseInt(kStr, 10);
    if(k < 2) return;
    levels[k].forEach(function(itemset){
      var subsets = nonEmptyProperSubsets(itemset.items);
      subsets.forEach(function(antecedent){
        var consequent = itemset.items.filter(function(p){ return antecedent.indexOf(p) === -1; });
        var anteCount = supportLookup[itemsetKey(antecedent)];
        var consCount = supportLookup[itemsetKey(consequent)];
        if(!anteCount || !consCount) return; // dijamin ada oleh downward closure, jaga-jaga saja
        var supportAll = itemset.count / totalTransactions;
        var confidence = itemset.count / anteCount;
        var lift = confidence / (consCount / totalTransactions);
        if(confidence < 0.05) return;
        rules.push({
          a: antecedent.slice().sort().join(' + '),
          b: consequent.slice().sort().join(' + '),
          count: itemset.count,
          support: supportAll,
          confidence: confidence,
          lift: lift,
          size: itemset.items.length
        });
      });
    });
  });
  rules.sort(function(x,y){ return (y.lift-x.lift) || (y.confidence-x.confidence); });

  var frequentItemsets = allFrequentItemsets
    .map(function(it){ return { product: it.items.slice().sort().join(' + '), size: it.items.length, count: it.count, support: it.count/totalTransactions }; })
    .sort(function(a,b){ return b.count-a.count; });

  return {
    ok:true, totalTransactions:totalTransactions, multiItemCount:multiItemCount,
    frequentItemsets: frequentItemsets, rules: rules.slice(0,30), minSupportCount:minSupportCount,
    productUniverse: topProducts.length, totalUniqueProducts: totalUniqueProducts,
    maxItemsetSizeReached: Math.max.apply(null, Object.keys(levels).map(Number)),
    truncatedForPerformance: truncatedForPerformance
  };
}

/* ---------------- Profil pembelian (cadangan saat Apriori belum bisa berjalan) ----------------
   Hanya menghitung fakta dari data: berapa jenis produk & unit per pesanan, produk yang dibeli
   sendirian, dan (bila ada) kombinasi dari sedikit pesanan multi-produk. Tidak membuat aturan asosiasi. */
function computeBasketProfile(){
  var recs = state.filtered.filter(function(r){ return OrderStatus.isCompleted(r.status); });
  var orders = {};
  recs.forEach(function(r){
    if(!r.order_id) return;
    var name = (r.product || '').trim();
    if(!name) return;
    var o = orders[r.order_id] || (orders[r.order_id] = { products: {}, units: 0 });
    o.products[name] = true;
    o.units += (typeof r.qty === 'number' && !isNaN(r.qty) && r.qty > 0) ? r.qty : 1;
  });
  var ids = Object.keys(orders);
  var total = ids.length;
  if(!total) return null;
  var single = 0, multi = 0, sumItems = 0, sumUnits = 0, multiUnits = 0;
  var soloCount = {}, qtyBuckets = { '1': 0, '2': 0, '3-4': 0, '5+': 0 };
  var multiCombos = [];
  ids.forEach(function(id){
    var o = orders[id], names = Object.keys(o.products), n = names.length;
    sumItems += n; sumUnits += o.units;
    if(n === 1){ single++; soloCount[names[0]] = (soloCount[names[0]] || 0) + 1; }
    else { multi++; multiCombos.push(names.sort()); }
    if(o.units >= 2) multiUnits++;
    var q = o.units >= 5 ? '5+' : (o.units >= 3 ? '3-4' : String(Math.round(o.units)));
    if(qtyBuckets[q] === undefined) q = o.units >= 2 ? '2' : '1';
    qtyBuckets[q]++;
  });
  var top = Object.keys(soloCount).map(function(k){ return { name: k, count: soloCount[k] }; })
    .sort(function(a, b){ return b.count - a.count; }).slice(0, 8);
  return { total: total, single: single, multi: multi, avgItems: sumItems / total, avgUnits: sumUnits / total,
           multiUnits: multiUnits, top: top, qtyBuckets: qtyBuckets, multiCombos: multiCombos };
}

function shortProductName(s, max){ s = String(s); return s.length > max ? s.slice(0, max - 1).trim() + '…' : s; }
function mbaPct(a, b, d){ return b ? (a / b * 100).toLocaleString('id-ID', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }) + '%' : '0%'; }

function renderBasketFallback(){
  var wrap = document.getElementById('mbaFallback');
  if(!wrap) return;
  var pr = computeBasketProfile();
  if(!pr){ wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  var singlePct = pr.single / pr.total * 100;
  document.getElementById('mbaFbBanner').innerHTML = singlePct >= 90
    ? 'Hampir semua pembeli hanya mengambil <b>satu jenis produk</b> per pesanan: <b>' + mbaPct(pr.single, pr.total) + '</b> (' + pr.single.toLocaleString('id-ID') + ' dari ' + pr.total.toLocaleString('id-ID') + ' pesanan). Karena itu belum ada pasangan produk yang cukup untuk dianalisis Apriori.'
    : 'Sebanyak <b>' + mbaPct(pr.single, pr.total) + '</b> pesanan hanya berisi satu jenis produk, sedangkan pesanan multi-produk baru ' + pr.multi + '. Jumlahnya belum cukup untuk dianalisis Apriori.';

  var kpis = [
    { l: 'Pesanan satu produk', v: pr.single.toLocaleString('id-ID'), d: mbaPct(pr.single, pr.total) + ' dari total pesanan' },
    { l: 'Pesanan multi-produk', v: pr.multi.toLocaleString('id-ID'), d: mbaPct(pr.multi, pr.total) + ' dari total pesanan' },
    { l: 'Rata-rata jenis produk / pesanan', v: pr.avgItems.toLocaleString('id-ID', { maximumFractionDigits: 2 }), d: 'jenis produk berbeda' },
    { l: 'Rata-rata unit / pesanan', v: pr.avgUnits.toLocaleString('id-ID', { maximumFractionDigits: 2 }), d: 'total jumlah barang' },
    { l: 'Pesanan ≥ 2 unit', v: pr.multiUnits.toLocaleString('id-ID'), d: mbaPct(pr.multiUnits, pr.total) + ' dari total pesanan' }
  ];
  document.getElementById('mbaFbKpis').innerHTML = kpis.map(function(c){
    return '<div class="kpi-card"><div class="kpi-label">' + c.l + '</div><div class="kpi-value tabular">' + c.v + '</div><div class="kpi-delta">' + c.d + '</div></div>';
  }).join('');

  var need = MBA_MIN_MULTI_ITEM, have = Math.min(pr.multi, need);
  document.getElementById('mbaFbProgress').innerHTML =
    '<div class="mba-fb-progress-top"><span>Syarat mengaktifkan Apriori</span><b class="tabular">' + pr.multi + ' / ' + need + ' pesanan multi-produk</b></div>' +
    '<div class="bar-track"><div class="bar-fill" style="width:' + (have / need * 100).toFixed(0) + '%"></div></div>' +
    '<div class="mba-fb-progress-note">Kurang ' + Math.max(0, need - pr.multi) + ' pesanan multi-produk lagi. Unggah data periode lain atau gabungkan beberapa bulan agar analisis bisa berjalan.</div>';

  var maxTop = pr.top.length ? pr.top[0].count : 1;
  document.getElementById('mbaFbTop').innerHTML = pr.top.length ? pr.top.map(function(t){
    return '<div class="mba-solo"><div class="mba-solo-top"><span class="mba-solo-name" title="' + escapeHtml(t.name) + '">' + escapeHtml(shortProductName(t.name, 70)) + '</span>' +
      '<span class="mba-solo-val tabular">' + t.count.toLocaleString('id-ID') + ' pesanan · ' + mbaPct(t.count, pr.total) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(3, t.count / maxTop * 100).toFixed(1) + '%"></div></div></div>';
  }).join('') : '<div class="fc-empty-note">Belum ada pesanan satu produk.</div>';

  var qLabels = [['1', '1 unit'], ['2', '2 unit'], ['3-4', '3–4 unit'], ['5+', '5 unit atau lebih']];
  var maxQ = Math.max.apply(null, qLabels.map(function(q){ return pr.qtyBuckets[q[0]]; })) || 1;
  document.getElementById('mbaFbQty').innerHTML = qLabels.map(function(q){
    var n = pr.qtyBuckets[q[0]];
    return '<div class="mba-solo"><div class="mba-solo-top"><span class="mba-solo-name">' + q[1] + '</span><span class="mba-solo-val tabular">' + n.toLocaleString('id-ID') + ' pesanan · ' + mbaPct(n, pr.total) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(n ? 3 : 0, n / maxQ * 100).toFixed(1) + '%"></div></div></div>';
  }).join('');

  // Saran tindakan (hanya yang didukung data)
  var acts = [];
  var multiUnitShare = pr.multiUnits / pr.total * 100;
  if(multiUnitShare >= 15){
    acts.push({ t: 'Tawarkan paket multi-kemasan', d: mbaPct(pr.multiUnits, pr.total) + ' pesanan sudah membeli 2 unit atau lebih. Buat paket hemat (mis. isi lebih banyak atau harga grosir kecil) agar pembeli jenis ini naik ke nilai pesanan lebih besar.' });
  } else {
    acts.push({ t: 'Dorong pembelian lebih dari 1 unit', d: 'Hanya ' + mbaPct(pr.multiUnits, pr.total) + ' pesanan membeli 2 unit atau lebih. Coba promo "beli 2 lebih hemat" atau gratis ongkir dengan minimum belanja sedikit di atas harga rata-rata.' });
  }
  if(pr.top.length >= 2){
    acts.push({ t: 'Uji coba paket dua produk terlaris', d: 'Produk "' + shortProductName(pr.top[0].name, 45) + '" dan "' + shortProductName(pr.top[1].name, 45) + '" paling sering dibeli. Buat satu paket gabungan sebagai percobaan, lalu unggah data periode berikutnya untuk melihat apakah pesanan multi-produk bertambah.' });
  }
  if(pr.multi > 0 && pr.multiCombos.length){
    var c = pr.multiCombos[0];
    acts.push({ t: 'Pantau kombinasi yang sudah muncul', d: 'Ada ' + pr.multi + ' pesanan multi-produk, misalnya "' + shortProductName(c[0], 40) + '" bersama "' + shortProductName(c[1], 40) + '". Jumlahnya masih terlalu sedikit untuk disimpulkan sebagai pola.' });
  }
  acts.push({ t: 'Kumpulkan data lebih panjang', d: 'Apriori butuh minimal ' + MBA_MIN_MULTI_ITEM + ' pesanan multi-produk. Menggabungkan beberapa bulan data atau menambah penawaran bundling akan membantu fitur ini aktif.' });
  document.getElementById('mbaFbActions').innerHTML = acts.map(function(a, i){
    return '<div class="mba-fb-action"><span class="mba-fb-num">' + (i + 1) + '</span><div><div class="mba-fb-title">' + escapeHtml(a.t) + '</div><div class="mba-fb-desc">' + escapeHtml(a.d) + '</div></div></div>';
  }).join('');
}

function renderMarketBasketAnalysis(){
  var sumEl = document.getElementById('mbaSummary');
  var emptyEl = document.getElementById('mbaEmpty');
  var itemsetsPanel = document.getElementById('mbaItemsetsPanel');
  var itemsetsEl = document.getElementById('mbaItemsets');
  var rulesPanel = document.getElementById('mbaRulesPanel');
  var rulesEl = document.getElementById('mbaRules');
  if(!sumEl) return;

  var fbEl = document.getElementById('mbaFallback');
  if(fbEl) fbEl.style.display = 'none';
  if(!state.records.length){
    sumEl.innerHTML=''; itemsetsPanel.style.display='none'; rulesPanel.style.display='none';
    emptyEl.style.display=''; emptyEl.textContent='Unggah data pesanan terlebih dahulu.';
    return;
  }

  var mba = computeMarketBasket();
  if(!mba.ok){
    sumEl.innerHTML='';
    itemsetsPanel.style.display='none';
    rulesPanel.style.display='none';
    emptyEl.style.display='';
    if(mba.reason==='no_data' || mba.reason==='no_orders'){
      emptyEl.textContent = 'Belum ada transaksi selesai dengan No. Pesanan dan Nama Produk pada filter aktif, sehingga Market Basket Analysis belum dapat dihitung.';
    } else {
      emptyEl.textContent = 'Apriori belum dapat dijalankan: pada filter aktif hanya ada '+mba.multiItemCount+' pesanan multi-produk dari '+mba.totalTransactions+' total pesanan, sedangkan minimal '+MBA_MIN_MULTI_ITEM+' pesanan diperlukan. Fitur ini tidak menampilkan data buatan. Profil pembelian di bawah dihitung langsung dari data Anda.';
      renderBasketFallback();
    }
    return;
  }
  emptyEl.style.display='none';

  var cards = [
    {label:'Total pesanan dianalisis', value: mba.totalTransactions.toLocaleString('id-ID'), delta:'transaksi selesai pada filter aktif'},
    {label:'Pesanan multi-produk', value: mba.multiItemCount.toLocaleString('id-ID'), delta: (mba.totalTransactions ? (mba.multiItemCount/mba.totalTransactions*100).toFixed(1) : '0')+'% dari total pesanan'},
    {label:'Produk dianalisis', value: mba.productUniverse.toLocaleString('id-ID'), delta: 'dari '+mba.totalUniqueProducts.toLocaleString('id-ID')+' produk unik (dibatasi produk terpopuler)'},
    {label:'Ukuran itemset maksimum', value: mba.maxItemsetSizeReached+'-itemset', delta: 'ambang minimum support: '+mba.minSupportCount.toLocaleString('id-ID')+' pesanan (\u2248'+(mba.totalTransactions ? (mba.minSupportCount/mba.totalTransactions*100).toFixed(1) : '0')+'%)'}
  ];
  sumEl.innerHTML = cards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');
  if(mba.truncatedForPerformance){
    sumEl.innerHTML += '<div class="kpi-card warn" style="grid-column:1/-1"><div class="kpi-label">Catatan performa</div><div class="kpi-delta">Jumlah kandidat itemset pada level tertentu terlalu besar untuk dihitung penuh di peramban, sehingga sebagian kandidat dilewati. Hasil di atas tetap valid untuk kandidat yang diproses, namun mungkin tidak lengkap.</div></div>';
  }

  if(mba.frequentItemsets.length){
    itemsetsPanel.style.display='';
    var maxCnt = mba.frequentItemsets[0].count;
    itemsetsEl.innerHTML = mba.frequentItemsets.slice(0,15).map(function(it){
      var pct = Math.max(4, maxCnt>0 ? (it.count/maxCnt*100) : 0);
      var label = it.product + (it.size>1 ? ' ('+it.size+'-itemset)' : '');
      return '<div class="bar-row"><div class="name" title="'+escapeHtml(label)+'">'+escapeHtml(label)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div><div class="bar-val">'+(it.support*100).toFixed(1)+'%</div></div>';
    }).join('');
  } else {
    itemsetsPanel.style.display='none';
  }

  if(mba.rules.length){
    rulesPanel.style.display='';
    var head = '<div class="mba-rule-row head"><div>Antecedent</div><div>Consequent</div><div>Support</div><div>Confidence</div><div>Lift</div></div>';
    var rows = mba.rules.map(function(r){
      var liftCls = r.lift>=1.5?'strong':(r.lift>=1.05?'mild':'weak');
      return '<div class="mba-rule-row"><div class="prod" title="'+escapeHtml(r.a)+'">'+escapeHtml(r.a)+'</div><div class="prod" title="'+escapeHtml(r.b)+'">'+escapeHtml(r.b)+'</div><div class="tabular">'+(r.support*100).toFixed(1)+'%</div><div class="tabular">'+(r.confidence*100).toFixed(1)+'%</div><div><span class="mba-lift-tag '+liftCls+'">'+r.lift.toFixed(2)+'x</span></div></div>';
    }).join('');
    rulesEl.innerHTML = head + rows;
  } else {
    rulesPanel.style.display='none';
  }
}
