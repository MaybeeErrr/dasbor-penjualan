"use strict";

/* ---------------- Pendapatan Bersih (per kilogram produk) ----------------
   Alur:
   1. Daftar produk dibaca otomatis dari dataset aktif (kunci = SKU Induk; jika tidak ada, Nama Produk).
   2. Berat terjual per produk = jumlah kolom "Berat Produk" (gram, sudah dikali Jumlah) / 1000.
      Dataset lama yang belum menyimpan berat: berat diperkirakan dari teks SKU/nama (mis. "1KG", "450gram") x Jumlah.
   3. Pengguna mengisi pendapatan bersih per kg untuk tiap produk.
   4. Pendapatan bersih produk = kg terjual x pendapatan bersih per kg; total = jumlah seluruh produk.
   Pesanan berstatus batal / pengembalian tidak dihitung. Isian disimpan di peramban, per akun (localStorage),
   dan berlaku untuk semua dataset karena satu produk punya pendapatan bersih per kg yang sama. */
var NetIncome = (function(){
  var STORE_PREFIX = 'sales-dash-net-per-kg:';
  var margins = {};     // { productKey: rupiah per kg }
  var rows = [];        // hasil hitung terakhir (urutan sama dengan baris tabel)
  var username = '';
  var CANCELLED = /batal|cancel|pengembalian|return|refund/i;

  /* ---------- penyimpanan isian ---------- */
  function storeKey(){ return STORE_PREFIX + (username || '_'); }
  function loadMargins(){
    margins = {};
    try {
      var raw = localStorage.getItem(storeKey());
      if(raw){ var obj = JSON.parse(raw); if(obj && typeof obj === 'object') margins = obj; }
    } catch(e){ margins = {}; }
  }
  function saveMargins(){
    try { localStorage.setItem(storeKey(), JSON.stringify(margins)); } catch(e){ /* mode privat/penuh: abaikan */ }
  }

  /* ---------- berat ---------- */
  // Perkiraan berat 1 unit (gram) dari teks; dipakai hanya bila berat tidak tersimpan pada dataset.
  function guessUnitGrams(r){
    var texts = [r.sku, r.variation, r.product];
    for(var i = 0; i < texts.length; i++){
      var m = String(texts[i] || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|gram|gr|g)\b/i);
      if(m){
        var n = parseFloat(m[1].replace(',', '.'));
        if(!isNaN(n) && n > 0) return /^(kg|kilo)/i.test(m[2]) ? n * 1000 : n;
      }
    }
    return 0;
  }
  function lineWeight(r){
    var qty = (typeof r.qty === 'number' && !isNaN(r.qty)) ? r.qty : 0;
    if(r.weight_g > 0) return { grams: r.weight_g, source: 'data' };
    var unit = guessUnitGrams(r);
    if(unit > 0 && qty > 0) return { grams: unit * qty, source: 'guess' };
    return { grams: 0, source: 'none' };
  }

  /* ---------- perhitungan ---------- */
  function compute(){
    var base = state.filtered.filter(function(r){ return !CANCELLED.test(r.status || ''); });
    var map = {};
    base.forEach(function(r){
      var key = (r.sku || r.product || 'Tidak diketahui').trim() || 'Tidak diketahui';
      var p = map[key];
      if(!p) p = map[key] = { key:key, name:(r.product || '').trim(), units:0, grams:0, revenue:0, orders:{}, guessed:0, missing:0 };
      var qty = (typeof r.qty === 'number' && !isNaN(r.qty)) ? r.qty : 0;
      var w = lineWeight(r);
      p.units += qty;
      p.grams += w.grams;
      p.revenue += (typeof r.subtotal === 'number' && !isNaN(r.subtotal)) ? r.subtotal : 0;
      if(r.order_id) p.orders[r.order_id] = true;
      if(w.source === 'guess') p.guessed++;
      if(w.source === 'none') p.missing++;
    });
    var list = Object.keys(map).map(function(k){
      var p = map[k];
      p.kg = p.grams / 1000;
      p.transactions = Object.keys(p.orders).length;
      return p;
    });
    list.sort(function(a,b){ return b.kg - a.kg || b.revenue - a.revenue; });
    return list;
  }

  function marginOf(p){
    var v = margins[p.key];
    return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0;
  }
  function fmtKg(n){ return n.toLocaleString('id-ID', { maximumFractionDigits: 2 }); }

  function totals(){
    var t = { kg:0, net:0, filled:0, filledKg:0, count:rows.length, guessed:0, missing:0 };
    rows.forEach(function(p){
      var m = marginOf(p);
      t.kg += p.kg;
      t.guessed += p.guessed;
      t.missing += p.missing;
      if(m > 0){ t.filled++; t.filledKg += p.kg; t.net += p.kg * m; }
    });
    return t;
  }

  /* ---------- tampilan ---------- */
  function renderSummary(t){
    var avg = t.filledKg > 0 ? t.net / t.filledKg : 0;
    var cards = [
      { label:'Total pendapatan bersih', value: idr(t.net), delta:'jumlah (kg terjual x pendapatan bersih per kg) seluruh produk', cls:'' },
      { label:'Total berat terjual', value: fmtKg(t.kg) + ' kg', delta:'dari pesanan yang tidak batal/dikembalikan', cls:'amber' },
      { label:'Produk sudah diisi', value: t.filled + ' / ' + t.count, delta:'produk tanpa isian dihitung Rp0', cls: (t.filled < t.count ? 'warn' : '') },
      { label:'Rata-rata bersih per kg', value: idr(avg), delta:'tertimbang berat, hanya produk yang sudah diisi', cls:'' }
    ];
    document.getElementById('niSummary').innerHTML = cards.map(function(c){
      return '<div class="kpi-card ' + c.cls + '"><div class="kpi-label">' + c.label + '</div><div class="kpi-value tabular">' + c.value + '</div><div class="kpi-delta">' + c.delta + '</div></div>';
    }).join('');

    var notes = [];
    if(t.count && t.filled < t.count) notes.push((t.count - t.filled) + ' produk belum diisi pendapatan bersih per kg-nya, sehingga belum masuk ke total.');
    if(t.guessed) notes.push(t.guessed + ' baris pesanan tidak menyimpan berat, jadi beratnya diperkirakan dari teks SKU/nama produk. Unggah ulang berkas asli agar memakai kolom "Berat Produk".');
    if(t.missing) notes.push(t.missing + ' baris pesanan tidak punya data berat yang bisa dibaca dan dihitung 0 kg.');
    var noteEl = document.getElementById('niNote');
    noteEl.innerHTML = notes.map(function(n){ return '<div>• ' + escapeHtml(n) + '</div>'; }).join('');
    noteEl.style.display = notes.length ? '' : 'none';
  }

  function renderFooter(t){
    document.getElementById('niFootKg').textContent = fmtKg(t.kg) + ' kg';
    document.getElementById('niFootNet').textContent = idr(t.net);
  }

  function renderChart(){
    var css = getComputedStyle(document.documentElement);
    var items = rows.map(function(p){ return { name:p.key, net:p.kg * marginOf(p) }; })
      .filter(function(x){ return x.net > 0; })
      .sort(function(a,b){ return b.net - a.net; }).slice(0, 10);
    var wrap = document.getElementById('niChartWrap');
    var empty = document.getElementById('niChartEmpty');
    if(!items.length){
      wrap.style.display = 'none';
      empty.style.display = '';
      if(charts.niNet){ charts.niNet.destroy(); charts.niNet = null; }
      return;
    }
    wrap.style.display = '';
    empty.style.display = 'none';
    var labels = items.map(function(x){ return x.name.length > 36 ? x.name.slice(0,33) + '…' : x.name; });
    var data = items.map(function(x){ return x.net; });
    if(charts.niNet){
      charts.niNet.data.labels = labels;
      charts.niNet.data.datasets[0].data = data;
      charts.niNet.update();
      return;
    }
    charts.niNet = new Chart(document.getElementById('niChart').getContext('2d'), {
      type: 'bar',
      data: { labels: labels, datasets: [{ label:'Pendapatan bersih', data:data, backgroundColor: css.getPropertyValue('--chart-line').trim(), borderRadius:4, maxBarThickness:22 }] },
      options: {
        indexAxis: 'y', responsive:true, maintainAspectRatio:false,
        plugins: { legend:{ display:false }, tooltip:{ callbacks:{ label:function(i){ return idr(i.parsed.x); } } } },
        scales: {
          x: { grid:{ color: css.getPropertyValue('--chart-grid').trim() }, ticks:{ callback:function(v){ return idrShort(v); }, color: css.getPropertyValue('--ink-muted').trim() } },
          y: { grid:{ display:false }, ticks:{ color: css.getPropertyValue('--ink-muted').trim(), font:{ size:11 } } }
        }
      }
    });
  }

  // Render penuh: dipanggil saat dataset/filter berubah.
  function render(){
    var emptyEl = document.getElementById('niEmpty');
    var contentEl = document.getElementById('niContent');
    rows = compute();
    if(!rows.length){
      contentEl.classList.add('hidden');
      emptyEl.classList.add('show');
      emptyEl.textContent = 'Belum ada produk pada dataset/filter yang aktif. Unggah data transaksi atau ubah filter di Dashboard Utama.';
      if(charts.niNet){ charts.niNet.destroy(); charts.niNet = null; }
      return;
    }
    emptyEl.classList.remove('show');
    contentEl.classList.remove('hidden');

    var tbody = document.getElementById('niTableBody');
    tbody.innerHTML = rows.map(function(p, i){
      var m = margins[p.key];
      var val = (typeof m === 'number' && m > 0) ? String(m) : '';
      return '<tr>' +
        '<td title="' + escapeHtml(p.name || p.key) + '"><div class="ni-name">' + escapeHtml(p.key) + '</div>' +
          (p.name && p.name !== p.key ? '<div class="ni-sub">' + escapeHtml(p.name) + '</div>' : '') + '</td>' +
        '<td class="tabular">' + p.units.toLocaleString('id-ID') + '</td>' +
        '<td class="tabular">' + fmtKg(p.kg) + '</td>' +
        '<td class="tabular">' + idr(p.revenue) + '</td>' +
        '<td><div class="ni-input-wrap"><span>Rp</span><input class="search-box ni-input" type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-i="' + i + '" value="' + escapeHtml(val) + '" aria-label="Pendapatan bersih per kg untuk ' + escapeHtml(p.key) + '"><span>/kg</span></div></td>' +
        '<td class="tabular ni-net" id="niNet' + i + '">' + idr(p.kg * marginOf(p)) + '</td>' +
        '</tr>';
    }).join('');

    var t = totals();
    renderSummary(t);
    renderFooter(t);
    renderChart();
  }

  // Pembaruan ringan saat mengetik (tanpa membangun ulang tabel, agar fokus input tidak hilang).
  function onInput(e){
    var el = e.target;
    if(!el.classList || !el.classList.contains('ni-input')) return;
    var i = parseInt(el.getAttribute('data-i'), 10);
    var p = rows[i];
    if(!p) return;
    var v = parseIDNumber(el.value);
    if(v > 0) margins[p.key] = v; else delete margins[p.key];
    saveMargins();
    document.getElementById('niNet' + i).textContent = idr(p.kg * marginOf(p));
    var t = totals();
    renderSummary(t);
    renderFooter(t);
    renderChart();
  }

  document.getElementById('niTableBody').addEventListener('input', onInput);
  document.getElementById('niBtnClear').addEventListener('click', function(){
    if(!Object.keys(margins).length) return;
    if(!window.confirm('Hapus semua isian pendapatan bersih per kg?')) return;
    margins = {};
    saveMargins();
    render();
  });

  document.addEventListener('auth:ready', function(e){
    username = (e && e.detail && e.detail.username) || '';
    loadMargins();
  });

  return { render: render };
})();

function renderNetIncome(){ NetIncome.render(); }
