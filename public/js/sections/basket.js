"use strict";

/* ---------------- Market Basket Analysis (Apriori sederhana) ---------------- */
// Menggunakan No. Pesanan sebagai id transaksi dan Nama Produk sebagai item.
// Jika struktur data tidak mendukung (tidak cukup pesanan multi-produk),
// fitur ini TIDAK membuat data buatan — cukup menampilkan penjelasan.
var MBA_MIN_MULTI_ITEM = 5;
var MBA_MAX_PRODUCTS = 40;

function computeMarketBasket(){
  var recs = state.filtered.filter(function(r){ return /selesai|complete|delivered/i.test(r.status); });
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
  var transactions = orderIds.map(function(id){ return Object.keys(byOrder[id]); });
  var totalTransactions = transactions.length;
  var multiItemCount = transactions.filter(function(t){ return t.length>=2; }).length;
  if(multiItemCount < MBA_MIN_MULTI_ITEM){
    return { ok:false, reason:'insufficient_multi_item', multiItemCount:multiItemCount, totalTransactions:totalTransactions };
  }
  var freq1 = {};
  transactions.forEach(function(items){ items.forEach(function(p){ freq1[p] = (freq1[p]||0)+1; }); });
  var totalUniqueProducts = Object.keys(freq1).length;
  var topProducts = Object.keys(freq1).sort(function(a,b){ return freq1[b]-freq1[a]; }).slice(0, MBA_MAX_PRODUCTS);
  var topSet = {}; topProducts.forEach(function(p){ topSet[p]=true; });
  var minSupportCount = Math.max(2, Math.ceil(totalTransactions*0.01));
  var frequentItemsets = topProducts.filter(function(p){ return freq1[p] >= minSupportCount; })
    .map(function(p){ return { product:p, count:freq1[p], support:freq1[p]/totalTransactions }; })
    .sort(function(a,b){ return b.count-a.count; });

  var pairCounts = {};
  transactions.forEach(function(items){
    var filtered = items.filter(function(p){ return topSet[p]; });
    for(var i=0;i<filtered.length;i++){
      for(var j=i+1;j<filtered.length;j++){
        var a=filtered[i], b=filtered[j];
        var key = a<b ? a+'\u0001'+b : b+'\u0001'+a;
        pairCounts[key] = (pairCounts[key]||0)+1;
      }
    }
  });
  var rules = [];
  Object.keys(pairCounts).forEach(function(key){
    var cnt = pairCounts[key];
    if(cnt < minSupportCount) return;
    var parts = key.split('\u0001');
    var a=parts[0], b=parts[1];
    var supportAB = cnt/totalTransactions;
    var lift = supportAB / ((freq1[a]/totalTransactions) * (freq1[b]/totalTransactions));
    var confAtoB = cnt/freq1[a];
    var confBtoA = cnt/freq1[b];
    if(confAtoB >= 0.05) rules.push({ a:a, b:b, count:cnt, support:supportAB, confidence:confAtoB, lift:lift });
    if(confBtoA >= 0.05) rules.push({ a:b, b:a, count:cnt, support:supportAB, confidence:confBtoA, lift:lift });
  });
  rules.sort(function(x,y){ return (y.lift-x.lift) || (y.confidence-x.confidence); });

  return {
    ok:true, totalTransactions:totalTransactions, multiItemCount:multiItemCount,
    frequentItemsets: frequentItemsets, rules: rules.slice(0,30), minSupportCount:minSupportCount,
    productUniverse: topProducts.length, totalUniqueProducts: totalUniqueProducts
  };
}

function renderMarketBasketAnalysis(){
  var sumEl = document.getElementById('mbaSummary');
  var emptyEl = document.getElementById('mbaEmpty');
  var itemsetsPanel = document.getElementById('mbaItemsetsPanel');
  var itemsetsEl = document.getElementById('mbaItemsets');
  var rulesPanel = document.getElementById('mbaRulesPanel');
  var rulesEl = document.getElementById('mbaRules');
  if(!sumEl) return;

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
      emptyEl.textContent = 'Market Basket Analysis membutuhkan struktur transaksi di mana satu No. Pesanan berisi lebih dari satu produk berbeda. Pada filter aktif hanya ditemukan '+mba.multiItemCount+' pesanan multi-produk dari '+mba.totalTransactions+' total pesanan (minimal '+MBA_MIN_MULTI_ITEM+' pesanan multi-produk diperlukan). Fitur ini tidak menampilkan data buatan — unggah data dengan struktur transaksi multi-produk untuk mengaktifkannya.';
    }
    return;
  }
  emptyEl.style.display='none';

  var cards = [
    {label:'Total pesanan dianalisis', value: mba.totalTransactions.toLocaleString('id-ID'), delta:'transaksi selesai pada filter aktif'},
    {label:'Pesanan multi-produk', value: mba.multiItemCount.toLocaleString('id-ID'), delta: (mba.totalTransactions ? (mba.multiItemCount/mba.totalTransactions*100).toFixed(1) : '0')+'% dari total pesanan'},
    {label:'Produk dianalisis', value: mba.productUniverse.toLocaleString('id-ID'), delta: 'dari '+mba.totalUniqueProducts.toLocaleString('id-ID')+' produk unik (dibatasi produk terpopuler)'},
    {label:'Ambang minimum support', value: mba.minSupportCount.toLocaleString('id-ID')+' pesanan', delta:'≈'+(mba.totalTransactions ? (mba.minSupportCount/mba.totalTransactions*100).toFixed(1) : '0')+'% dari total pesanan'}
  ];
  sumEl.innerHTML = cards.map(function(c){ return '<div class="kpi-card"><div class="kpi-label">'+c.label+'</div><div class="kpi-value tabular">'+c.value+'</div><div class="kpi-delta">'+c.delta+'</div></div>'; }).join('');

  if(mba.frequentItemsets.length){
    itemsetsPanel.style.display='';
    var maxCnt = mba.frequentItemsets[0].count;
    itemsetsEl.innerHTML = mba.frequentItemsets.slice(0,10).map(function(it){
      var pct = Math.max(4, maxCnt>0 ? (it.count/maxCnt*100) : 0);
      return '<div class="bar-row"><div class="name" title="'+escapeHtml(it.product)+'">'+escapeHtml(it.product)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div><div class="bar-val">'+(it.support*100).toFixed(1)+'%</div></div>';
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
