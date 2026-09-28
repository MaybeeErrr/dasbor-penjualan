"use strict";

/* ---------- Grafik "10 produk dengan pendapatan bersih tertinggi" ----------
   items: [{ name, fullName, net, kg, perKg }] sudah terurut turun.
   getTheme(): { brand:'#rrggbb', ink, muted, grid } dibaca saat menggambar agar ikut mode terang/gelap. */
function niWrapLabel(text, width, maxLines){
  var words = String(text).split(/\s+/), lines = [], cur = '';
  for(var i = 0; i < words.length; i++){
    var next = cur ? cur + ' ' + words[i] : words[i];
    if(next.length > width && cur){ lines.push(cur); cur = words[i]; } else { cur = next; }
  }
  if(cur) lines.push(cur);
  if(lines.length > maxLines){
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S{0,3}$/, '') + '…';
  }
  return lines;
}
function niRgba(hex, a){
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
  if(!m) return hex;
  return 'rgba(' + parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16) + ',' + a + ')';
}
function niBuildChartConfig(items, total, getTheme){
  var fmt = function(n){ return 'Rp' + Math.round(n).toLocaleString('id-ID'); };
  var fmtKg = function(n){ return n.toLocaleString('id-ID', { maximumFractionDigits: 2 }); };
  var pctText = function(v){ return (total > 0 ? v / total * 100 : 0).toFixed(1).replace('.', ',') + '%'; };

  var valueLabels = {
    id: 'niValueLabels',
    afterDatasetsDraw: function(chart){
      var th = getTheme(), ctx = chart.ctx, meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textBaseline = 'middle';
      meta.data.forEach(function(bar, i){
        var it = items[i]; if(!it) return;
        var x = bar.x + 10, y = bar.y;
        ctx.font = '700 13px "Space Grotesk", Inter, sans-serif';
        ctx.fillStyle = th.ink;
        ctx.textAlign = 'left';
        ctx.fillText(fmt(it.net), x, y);
        var w = ctx.measureText(fmt(it.net)).width;
        ctx.font = '500 11.5px Inter, sans-serif';
        ctx.fillStyle = th.muted;
        ctx.fillText(pctText(it.net), x + w + 8, y);
      });
      ctx.restore();
    }
  };

  return {
    type: 'bar',
    data: {
      labels: items.map(function(it){ return niWrapLabel(it.name, (typeof window !== 'undefined' && window.innerWidth < 640) ? 16 : 24, 2); }),
      datasets: [{
        label: 'Pendapatan bersih',
        data: items.map(function(it){ return it.net; }),
        borderRadius: 8,
        borderSkipped: false,
        barPercentage: 0.72,
        categoryPercentage: 0.9,
        backgroundColor: function(c){
          var th = getTheme(), chart = c.chart, area = chart.chartArea;
          var i = c.dataIndex;
          if(!area) return niRgba(th.brand, i === 0 ? 1 : 0.8);
          var g = chart.ctx.createLinearGradient(area.left, 0, area.right, 0);
          g.addColorStop(0, niRgba(th.brand, i === 0 ? 0.7 : 0.5));
          g.addColorStop(1, niRgba(th.brand, i === 0 ? 1 : 0.9));
          return g;
        }
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      layout: { padding: { right: (typeof window !== 'undefined' && window.innerWidth < 640) ? 96 : 130, top: 4, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          padding: 12, displayColors: false, titleFont: { size: 12.5, weight: '600' }, bodyFont: { size: 12.5 }, bodySpacing: 4,
          callbacks: {
            title: function(a){ var it = items[a[0].dataIndex]; return it.fullName || it.name; },
            label: function(c){
              var it = items[c.dataIndex];
              return [
                'Pendapatan bersih: ' + fmt(it.net) + ' (' + pctText(it.net) + ' dari total)',
                'Hitungan: ' + fmtKg(it.kg) + ' kg × ' + fmt(it.perKg) + '/kg'
              ];
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true, grace: '4%',
          border: { display: false },
          grid: { color: function(){ return getTheme().grid; } },
          ticks: { maxTicksLimit: 6, color: function(){ return getTheme().muted; }, font: { size: 11.5 }, callback: function(v){ return idrShort(v); } },
          title: { display: true, text: 'Total pendapatan bersih (Rupiah)', color: function(){ return getTheme().muted; }, font: { size: 11.5, weight: '500' } }
        },
        y: {
          border: { display: false },
          grid: { display: false },
          ticks: { color: function(){ return getTheme().ink; }, font: { size: 12, weight: '600' }, autoSkip: false, padding: 8 }
        }
      }
    },
    plugins: [valueLabels]
  };
}

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
  function netText(p){ var m = marginOf(p); return m > 0 ? idr(p.kg * m) : '—'; }
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

  function themeNow(){
    var css = getComputedStyle(document.documentElement);
    return {
      brand: css.getPropertyValue('--chart-line').trim() || '#2F6F4E',
      ink: css.getPropertyValue('--ink').trim() || '#16241D',
      muted: css.getPropertyValue('--ink-muted').trim() || '#5C6F64',
      grid: css.getPropertyValue('--chart-grid').trim() || '#E1E9E2'
    };
  }
  function destroyChart(){ if(charts.niNet){ charts.niNet.destroy(); charts.niNet = null; } }

  function renderChart(t){
    var wrap = document.getElementById('niChartWrap');
    var box = document.getElementById('niChartBox');
    var empty = document.getElementById('niChartEmpty');
    var insight = document.getElementById('niInsight');
    var items = rows.map(function(p){ return { name:p.key, fullName:p.name || p.key, kg:p.kg, perKg:marginOf(p), net:p.kg * marginOf(p) }; })
      .filter(function(x){ return x.net > 0; })
      .sort(function(a,b){ return b.net - a.net; });
    if(!items.length){
      destroyChart();
      wrap.style.display = 'none';
      insight.style.display = 'none';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    wrap.style.display = '';
    var total = t.net;
    var top = items.slice(0, 10);

    var top3 = items.slice(0, 3).reduce(function(a,x){ return a + x.net; }, 0);
    insight.innerHTML = '<b>' + escapeHtml(top[0].name) + '</b> adalah penyumbang terbesar: ' + idr(top[0].net) +
      ' (' + Math.round(top[0].net / total * 100) + '% dari total).' +
      (items.length >= 3 ? ' Tiga produk teratas menyumbang <b>' + Math.round(top3 / total * 100) + '%</b> dari seluruh pendapatan bersih.' : '') +
      (items.length > 10 ? ' <span class="ni-insight-more">Grafik menampilkan 10 teratas dari ' + items.length + ' produk terisi.</span>' : '');
    insight.style.display = '';

    box.style.height = (70 + top.length * 56) + 'px';
    var cfg = niBuildChartConfig(top, total, themeNow);
    if(charts.niNet){ cfg.options.animation = false; destroyChart(); } // saat mengetik: tanpa animasi ulang
    charts.niNet = new Chart(document.getElementById('niChart').getContext('2d'), cfg);
  }

  // Render penuh: dipanggil saat dataset/filter berubah.
  function render(){
    var emptyEl = document.getElementById('niEmpty');
    var contentEl = document.getElementById('niContent');
    rows = compute();
    if(!rows.length){
      contentEl.classList.add('hidden');
      emptyEl.classList.add('show');
      destroyChart();
      emptyEl.textContent = 'Belum ada produk pada dataset/filter yang aktif. Unggah data transaksi atau ubah filter di Dashboard Utama.';
      return;
    }
    emptyEl.classList.remove('show');
    contentEl.classList.remove('hidden');

    var tbody = document.getElementById('niTableBody');
    tbody.innerHTML = rows.map(function(p, i){
      var m = margins[p.key];
      var val = (typeof m === 'number' && m > 0) ? String(m) : '';
      return '<tr id="niRow' + i + '" class="' + (val ? 'filled' : '') + '">' +
        '<td class="ni-prod" title="' + escapeHtml(p.name || p.key) + '"><div class="ni-name">' + escapeHtml(p.key) + '</div>' +
          (p.name && p.name !== p.key ? '<div class="ni-sub">' + escapeHtml(p.name) + '</div>' : '') + '</td>' +
        '<td class="tabular" data-label="Unit">' + p.units.toLocaleString('id-ID') + '</td>' +
        '<td class="tabular" data-label="Berat">' + fmtKg(p.kg) + ' kg</td>' +
        '<td class="tabular" data-label="Omzet">' + idr(p.revenue) + '</td>' +
        '<td class="ni-in-cell" data-label="Bersih / kg"><div class="ni-input-wrap"><span>Rp</span><input class="search-box ni-input" type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-i="' + i + '" value="' + escapeHtml(val) + '" aria-label="Pendapatan bersih per kg untuk ' + escapeHtml(p.key) + '"><span>/kg</span></div></td>' +
        '<td class="tabular ni-net" data-label="Total bersih" id="niNet' + i + '">' + netText(p) + '</td>' +
        '</tr>';
    }).join('');

    var t = totals();
    renderSummary(t);
    renderFooter(t);
    renderChart(t);
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
    document.getElementById('niNet' + i).textContent = netText(p);
    var rowEl = document.getElementById('niRow' + i);
    if(rowEl) rowEl.classList.toggle('filled', marginOf(p) > 0);
    var t = totals();
    renderSummary(t);
    renderFooter(t);
    renderChart(t);
  }

  document.getElementById('niTableBody').addEventListener('input', onInput);
  document.getElementById('niBtnClear').addEventListener('click', function(){
    var n = Object.keys(margins).length;
    if(!n){
      if(typeof dsToast === 'function') dsToast('Belum ada isian yang perlu dihapus');
      return;
    }
    showConfirmModal({
      title: 'Hapus semua isian?',
      desc: n + ' isian pendapatan bersih per kg akan dihapus dari akun ini, dan total pendapatan bersih kembali menjadi Rp0. Tindakan ini tidak dapat dibatalkan.',
      confirmText: 'Ya, hapus semua',
      cancelText: 'Batal',
      danger: true
    }).then(function(ok){
      if(!ok) return;
      margins = {};
      saveMargins();
      render();
      if(typeof dsToast === 'function') dsToast('Semua isian dihapus');
    });
  });

  document.addEventListener('auth:ready', function(e){
    username = (e && e.detail && e.detail.username) || '';
    loadMargins();
  });

  return { render: render };
})();

function renderNetIncome(){ NetIncome.render(); }
