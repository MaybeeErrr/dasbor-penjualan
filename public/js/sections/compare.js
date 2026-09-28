"use strict";

/* ---------------- Perbandingan dataset (versi lengkap untuk bahan evaluasi) ----------------
   Memuat 2-4 dataset, menghitung puluhan metrik dari data pesanan, lalu menampilkan:
   kartu ringkas, tabel metrik + selisih vs baseline, grafik tren / status / pola mingguan,
   daftar produk-provinsi-metode bayar, dan kesimpulan otomatis.
   Nama kolom data dideteksi otomatis dari header (lihat detectFields). */
var DatasetCompare = (function(){
  var MAX_SELECT = 4;
  var COLOR_VARS = ['--brand', '--blue', '--amber', '--brick'];
  var COLOR_FALLBACK = ['#6FBE8F', '#4A86C5', '#E2B15C', '#E08579'];
  var DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  var DONE_RE = /selesai|complete|deliver|diterima/i;
  var CANCEL_RE = /batal|cancel|gagal|return|kembali|refund/i;

  var selected = [];          // id dataset (string) sesuai urutan dipilih; urutan pertama = baseline
  var cache = {};             // metrik per dataset agar tidak dihitung ulang
  var charts = [];
  var lastResult = null;      // [{ds, label, m, color}]
  var trendState = { metric: 'revenue', mode: 'index' };
  var tableMode = 'all';      // 'all' | 'key'
  var fcState = { h: 7 };     // horizon proyeksi pada panel perbandingan (hari)
  var awaitingNewUntil = 0;   // auto-pilih dataset yang baru diunggah
  var knownIds = null;

  /* ---------- util umum ---------- */
  function $(id){ return document.getElementById(id); }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sameId(a, b){ return a != null && b != null && String(a) === String(b); }
  function cssVar(name, fb){
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    v = v && v.trim();
    return v || fb;
  }
  function colorAt(i){ return cssVar(COLOR_VARS[i % 4], COLOR_FALLBACK[i % 4]); }
  function datasets(){ return (typeof state !== 'undefined' && state.datasets) ? state.datasets : []; }
  function findDs(id){ var l = datasets(); for(var i = 0; i < l.length; i++){ if(sameId(l[i].id, id)) return l[i]; } return null; }

  function num(v){
    if(typeof v === 'number') return isFinite(v) ? v : 0;
    if(v == null) return 0;
    var s = String(v).replace(/[^\d.,-]/g, '');
    if(!s) return 0;
    if(/^-?\d+\.\d{1,2}$/.test(s)) return parseFloat(s);
    if(/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/[.,]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function toDayNum(v){
    var d = null;
    if(v instanceof Date) d = v;
    else if(typeof v === 'number') d = new Date(v);
    else if(v){
      var s = String(v).trim();
      var m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
      if(m) d = new Date(+m[3], +m[2] - 1, +m[1]);
      else { d = new Date(s); if(isNaN(d.getTime())) d = new Date(s.replace(' ', 'T')); }
    }
    if(!d || isNaN(d.getTime())) return null;
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  }
  function fmtInt(n){ return Math.round(n).toLocaleString('id-ID'); }
  function fmtRp(n){ return 'Rp' + Math.round(n).toLocaleString('id-ID'); }
  function fmtDec(n, d){ d = d == null ? 1 : d; return n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function fmtPct(n){ return fmtDec(n, 1) + '%'; }
  function fmtRpShort(n){
    var a = Math.abs(n);
    function t(x){ return String(Math.round(x * 10) / 10).replace('.', ','); }
    if(a >= 1e9) return 'Rp' + t(n / 1e9) + 'M';
    if(a >= 1e6) return 'Rp' + t(n / 1e6) + 'jt';
    if(a >= 1e3) return 'Rp' + t(n / 1e3) + 'rb';
    return 'Rp' + Math.round(n);
  }
  function fmtDay(d){ return new Date(d * 864e5).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function fmtDayShort(d){ return new Date(d * 864e5).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function sum(a){ var s = 0; for(var i = 0; i < a.length; i++) s += a[i]; return s; }
  function trunc(s, n){ s = String(s); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }

  /* ---------- deteksi kolom ---------- */
  var ROLE_ORDER = ['order', 'status', 'date', 'payment', 'variant', 'product', 'subtotal', 'total', 'price', 'qty', 'city', 'province', 'customer'];
  var PAT = {
    order:    ['nopesanan', 'orderid', 'ordersn', 'noorder', 'idpesanan', 'nomorpesanan', 'orderno', 'ordernumber'],
    status:   ['statuspesanan', 'orderstatus', 'status'],
    date:     ['waktupesanan', 'orderdate', 'tanggalpesanan', 'tanggal', 'date', 'waktu', 'createdat', 'time'],
    payment:  ['metodepembayaran', 'paymentmethod', 'payment', 'metode'],
    variant:  ['namavariasi', 'variasi', 'variant'],
    product:  ['namaproduk', 'productname', 'product', 'produk', 'item'],
    subtotal: ['subtotalpesanan', 'subtotal'],
    total:    ['totalpembayaran', 'totalbayar', 'grandtotal', 'ordertotal', 'total'],
    price:    ['hargasetelahdiskon', 'harga', 'price'],
    qty:      ['jumlah', 'qty', 'quantity'],
    city:     ['kotakabupaten', 'kota', 'kabupaten', 'city'],
    province: ['provinsi', 'province'],
    customer: ['usernamepembeli', 'username', 'pembeli', 'pelanggan', 'customer', 'buyer']
  };
  function excluded(role, n){
    if(role === 'total') return n.indexOf('subtotal') !== -1;
    if(role === 'price') return n.indexOf('total') !== -1;
    if(role === 'product') return n.indexOf('variasi') !== -1 || n.indexOf('variant') !== -1 || n.indexOf('jumlah') !== -1;
    return false;
  }
  function detectFields(records){
    var f = {}, used = {};
    if(!records || !records.length) return f;
    var keys = Object.keys(records[0]);
    var norms = keys.map(function(k){ return k.toLowerCase().replace(/[^a-z0-9]/g, ''); });
    ROLE_ORDER.forEach(function(role){
      var pats = PAT[role], found = null, i, j;
      for(j = 0; j < pats.length && !found; j++){
        for(i = 0; i < keys.length; i++){
          if(!used[keys[i]] && norms[i] === pats[j] && !excluded(role, norms[i])){ found = keys[i]; break; }
        }
      }
      for(j = 0; j < pats.length && !found; j++){
        for(i = 0; i < keys.length; i++){
          if(!used[keys[i]] && norms[i].indexOf(pats[j]) !== -1 && !excluded(role, norms[i])){ found = keys[i]; break; }
        }
      }
      if(found){ f[role] = found; used[found] = true; }
    });
    return f;
  }

  /* ---------- hitung metrik satu dataset ---------- */
  function topList(values, limit){
    var map = {}, total = 0;
    values.forEach(function(v){ if(!v) return; map[v] = (map[v] || 0) + 1; total++; });
    return Object.keys(map).map(function(k){ return { n: k, c: map[k], p: total ? map[k] / total * 100 : 0 }; })
      .sort(function(a, b){ return b.c - a.c; }).slice(0, limit || 5);
  }

  function compute(records){
    var f = detectFields(records);
    var m = { fields: f, rows: records ? records.length : 0, empty: !records || !records.length };
    var missing = [];
    if(!f.order) missing.push('No. Pesanan');
    if(!f.date) missing.push('Tanggal pesanan');
    if(!f.status) missing.push('Status');
    if(!f.total && !f.subtotal && !f.price) missing.push('Total pembayaran');
    if(!f.customer) missing.push('Identitas pelanggan');
    if(!f.product) missing.push('Nama produk');
    if(!f.province) missing.push('Provinsi');
    if(!f.payment) missing.push('Metode pembayaran');
    m.missing = missing;
    if(m.empty){ m.span = 0; m.orders = 0; m.revenue = 0; m.baseOrders = 0; return m; }

    function str(r, key){ return key && r[key] != null ? String(r[key]).trim() : ''; }
    var orders = [], map = {};
    records.forEach(function(r, i){
      var oid = f.order ? str(r, f.order) : 'row' + i;
      var o = map[oid];
      if(!o){
        o = map[oid] = {
          day: f.date ? toDayNum(r[f.date]) : null, status: str(r, f.status), payment: str(r, f.payment),
          province: str(r, f.province), city: str(r, f.city), customer: str(r, f.customer),
          total: 0, sub: 0, line: 0, units: 0, items: []
        };
        orders.push(o);
      } else if(o.day == null && f.date){ o.day = toDayNum(r[f.date]); }
      var q = f.qty ? num(r[f.qty]) : 1;
      o.units += q;
      if(f.total && !o.total) o.total = num(r[f.total]);       // nilai per pesanan: ambil baris pertama yang terisi
      if(f.subtotal && !o.sub) o.sub = num(r[f.subtotal]);
      var line = f.price ? num(r[f.price]) * q : 0;
      o.line += line;
      if(f.product){ var pn = str(r, f.product); if(pn) o.items.push({ n: pn, q: q, v: line }); }
    });
    orders.forEach(function(o){
      o.value = o.total || o.sub || o.line;
      o.cancel = !!o.status && CANCEL_RE.test(o.status);
      o.done = !!o.status && !o.cancel && DONE_RE.test(o.status);
    });

    m.orders = orders.length;
    var done = orders.filter(function(o){ return o.done; });
    m.fallbackAll = done.length === 0;
    var base = m.fallbackAll ? orders : done;
    m.baseOrders = base.length;
    m.cancelled = orders.filter(function(o){ return o.cancel; }).length;
    m.completionRate = orders.length ? done.length / orders.length * 100 : null;
    m.cancelRate = f.status && orders.length ? m.cancelled / orders.length * 100 : null;
    if(!f.status){ m.completionRate = null; }

    /* nilai */
    var vals = base.map(function(o){ return o.value; }).sort(function(a, b){ return a - b; });
    m.revenue = sum(vals);
    m.aov = base.length ? m.revenue / base.length : 0;
    m.medianOrder = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : 0;
    m.maxOrder = vals.length ? vals[vals.length - 1] : 0;
    m.units = sum(base.map(function(o){ return o.units; }));
    m.unitsPerOrder = base.length ? m.units / base.length : 0;

    /* pelanggan */
    var cust = {};
    base.forEach(function(o){ if(o.customer){ var c = cust[o.customer] || (cust[o.customer] = { n: 0, v: 0 }); c.n++; c.v += o.value; } });
    var ck = Object.keys(cust);
    m.customers = f.customer ? ck.length : null;
    m.repeatCustomers = f.customer ? ck.filter(function(k){ return cust[k].n >= 2; }).length : null;
    m.repeatRate = ck.length ? m.repeatCustomers / ck.length * 100 : (f.customer ? 0 : null);
    m.ordersPerCustomer = ck.length ? sum(ck.map(function(k){ return cust[k].n; })) / ck.length : null;
    m.revPerCustomer = ck.length ? sum(ck.map(function(k){ return cust[k].v; })) / ck.length : null;

    /* waktu */
    var days = orders.map(function(o){ return o.day; }).filter(function(d){ return d != null; });
    if(days.length){
      m.minDay = Math.min.apply(null, days);
      m.maxDay = Math.max.apply(null, days);
      m.span = m.maxDay - m.minDay + 1;
      m.revSeries = []; m.ordSeries = [];
      for(var i = 0; i < m.span; i++){ m.revSeries.push(0); m.ordSeries.push(0); }
      orders.forEach(function(o){ if(o.day != null) m.ordSeries[o.day - m.minDay]++; });
      base.forEach(function(o){ if(o.day != null) m.revSeries[o.day - m.minDay] += o.value; });
      m.activeDays = m.ordSeries.filter(function(x){ return x > 0; }).length;
      m.activeRate = m.activeDays / m.span * 100;
      m.revPerDay = m.revenue / m.span;
      m.ordersPerDay = m.orders / m.span;
      var bi = 0;
      m.revSeries.forEach(function(v, k){ if(v > m.revSeries[bi]) bi = k; });
      m.bestDayRev = m.revSeries[bi];
      m.bestDay = fmtDay(m.minDay + bi);
      m.period = fmtDay(m.minDay) + ' \u2013 ' + fmtDay(m.maxDay);
      if(m.span >= 2){
        var h = Math.ceil(m.span / 2);
        var a1 = sum(m.revSeries.slice(0, h)) / h, a2 = sum(m.revSeries.slice(h)) / (m.span - h);
        m.trend = a1 > 0 ? (a2 - a1) / a1 * 100 : null;
      } else { m.trend = null; }
      var wd = [0, 0, 0, 0, 0, 0, 0];
      base.forEach(function(o){ if(o.day != null) wd[(new Date(o.day * 864e5).getUTCDay() + 6) % 7] += o.value; });
      m.weekday = wd.map(function(v){ return m.revenue ? v / m.revenue * 100 : 0; });
    } else {
      m.span = 0; m.weekday = [0, 0, 0, 0, 0, 0, 0];
    }

    /* produk */
    var prod = {};
    base.forEach(function(o){ o.items.forEach(function(it){ var p = prod[it.n] || (prod[it.n] = { n: it.n, u: 0, v: 0 }); p.u += it.q; p.v += it.v; }); });
    var pl = Object.keys(prod).map(function(k){ return prod[k]; }).sort(function(a, b){ return b.u - a.u; });
    m.distinctProducts = f.product ? pl.length : null;
    m.topProducts = pl.slice(0, 5);
    m.topProduct = pl.length ? pl[0].n : null;
    var pu = sum(pl.map(function(p){ return p.u; }));
    m.top3Share = pu ? sum(pl.slice(0, 3).map(function(p){ return p.u; })) / pu * 100 : null;

    /* sebaran */
    m.provinces = topList(base.map(function(o){ return o.province; }), 5);
    m.cities = topList(base.map(function(o){ return o.city; }), 5);
    m.payments = topList(base.map(function(o){ return o.payment; }), 5);
    m.topProvince = m.provinces.length ? m.provinces[0].n + ' (' + fmtPct(m.provinces[0].p) + ')' : null;
    m.topPayment = m.payments.length ? m.payments[0].n + ' (' + fmtPct(m.payments[0].p) + ')' : null;
    var st = {};
    orders.forEach(function(o){ var k = o.status || 'Tanpa status'; st[k] = (st[k] || 0) + 1; });
    m.statuses = st;
    return m;
  }

  /* ---------- pemuatan data ---------- */
  function loadMetrics(id){
    var ds = findDs(id);
    if(!ds) return Promise.reject(new Error('Dataset tidak ditemukan'));
    var key = String(ds.id) + '|' + ds.updated_at + '|' + ds.row_count;
    if(cache[key]) return Promise.resolve({ ds: ds, m: cache[key] });
    return Api.orders.load(ds.id).then(function(res){
      var m = compute(res.records);
      console.info('[compare] kolom terdeteksi untuk "' + ds.name + '":', m.fields);
      cache[key] = m;
      return { ds: ds, m: m };
    });
  }

  /* ---------- pemilih dataset ---------- */
  function updateControls(){
    var btn = $('btnRunCompare'), empty = $('compareEmpty'), cnt = $('cmpCount');
    if(btn) btn.disabled = selected.length < 2;
    if(cnt) cnt.innerHTML = '<b>' + selected.length + '</b> dari ' + datasets().length + ' dataset dipilih <span>\u00B7 maks. ' + MAX_SELECT + '</span>';
    if(empty && !lastResult){
      empty.style.display = '';
      empty.textContent = selected.length < 2 ? 'Pilih minimal 2 dataset (maksimal ' + MAX_SELECT + ') untuk dibandingkan.' : 'Klik \u201cBandingkan dataset terpilih\u201d untuk melihat hasilnya.';
    }
  }

  function renderComparePicker(){
    var el = $('comparePickerList');
    if(!el) return;
    var list = datasets();
    selected = selected.filter(function(id){ return !!findDs(id); });
    // dataset yang baru saja ditambahkan lewat tombol "Tambah dataset" ikut terpilih otomatis
    if(knownIds){
      list.forEach(function(ds){
        if(knownIds.indexOf(String(ds.id)) === -1 && Date.now() < awaitingNewUntil && selected.length < MAX_SELECT && selected.indexOf(String(ds.id)) === -1) selected.push(String(ds.id));
      });
    }
    knownIds = list.map(function(ds){ return String(ds.id); });
    if(!list.length){
      el.innerHTML = '<div class="picker-empty">Belum ada dataset tersimpan.</div>';
      updateControls();
      return;
    }
    el.innerHTML = list.map(function(ds){
      var idx = -1;
      for(var i = 0; i < selected.length; i++){ if(sameId(selected[i], ds.id)) idx = i; }
      var on = idx > -1;
      var dis = !on && selected.length >= MAX_SELECT;
      return '<label class="compare-check-row' + (on ? ' on' : '') + (dis ? ' disabled' : '') + '">' +
        '<input type="checkbox" data-id="' + esc(ds.id) + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '>' +
        '<span class="cmp-swatch" style="background:' + (on ? colorAt(idx) : 'transparent') + '"></span>' +
        '<span class="name" title="' + esc(ds.name) + '">' + esc(ds.name) + (idx === 0 ? ' <span class="cmp-tag">Baseline</span>' : '') + '</span>' +
        '<span class="meta">' + (ds.row_count || 0).toLocaleString('id-ID') + ' baris</span></label>';
    }).join('');
    updateControls();
  }

  function labelsFor(list){
    var count = {};
    list.forEach(function(r){ count[r.ds.name] = (count[r.ds.name] || 0) + 1; });
    return list.map(function(r){ return count[r.ds.name] > 1 ? r.ds.name + ' (#' + r.ds.id + ')' : r.ds.name; });
  }

  function run(){
    if(selected.length < 2) return;
    var btn = $('btnRunCompare');
    var original = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = 'Memuat data\u2026'; }
    Promise.all(selected.slice().map(loadMetrics)).then(function(list){
      var labels = labelsFor(list);
      lastResult = list.map(function(r, i){ return { ds: r.ds, label: labels[i], m: r.m, color: colorAt(i) }; });
      render();
    }).catch(function(err){
      console.error('[compare] gagal', err);
      if(typeof dsToast === 'function') dsToast('Gagal membandingkan dataset: ' + (err && err.message ? err.message : err), 'error');
    }).then(function(){
      if(btn) btn.textContent = original;
      updateControls();
    });
  }

  /* ---------- baris tabel metrik ---------- */
  // b: 1 = makin tinggi makin baik, -1 = makin rendah makin baik, 0 = netral
  var ROWS = [
    { sec: 'Volume & pendapatan', ic: 'bars' },
    { k: 'revenue', l: 'Total pendapatan', h: 'Dari pesanan berstatus selesai', t: 'money', b: 1, key: 1 },
    { k: 'orders', l: 'Total pesanan', h: 'Semua status', t: 'int', b: 1, key: 1 },
    { k: 'baseOrders', l: 'Pesanan yang dihitung', h: 'Pesanan selesai', t: 'int', b: 1 },
    { k: 'aov', l: 'Rata-rata nilai pesanan', h: 'Pendapatan \u00F7 pesanan dihitung', t: 'money', b: 1, key: 1 },
    { k: 'medianOrder', l: 'Median nilai pesanan', h: 'Nilai tengah, tahan pencilan', t: 'money', b: 1 },
    { k: 'maxOrder', l: 'Nilai pesanan tertinggi', t: 'money', b: 0 },
    { k: 'units', l: 'Total unit terjual', t: 'int', b: 1 },
    { k: 'unitsPerOrder', l: 'Unit per pesanan', t: 'dec', b: 1 },
    { sec: 'Pelanggan', ic: 'users' },
    { k: 'customers', l: 'Pelanggan unik', t: 'int', b: 1, key: 1 },
    { k: 'repeatCustomers', l: 'Pelanggan repeat', h: 'Membeli \u22652 kali', t: 'int', b: 1 },
    { k: 'repeatRate', l: 'Tingkat repeat customer', h: 'Repeat \u00F7 pelanggan unik', t: 'pct', b: 1, key: 1 },
    { k: 'ordersPerCustomer', l: 'Pesanan per pelanggan', t: 'dec', b: 1 },
    { k: 'revPerCustomer', l: 'Pendapatan per pelanggan', t: 'money', b: 1 },
    { sec: 'Kualitas pesanan', ic: 'check' },
    { k: 'completionRate', l: 'Tingkat pesanan selesai', t: 'pct', b: 1 },
    { k: 'cancelRate', l: 'Tingkat pembatalan', h: 'Makin rendah makin baik', t: 'pct', b: -1, key: 1 },
    { sec: 'Waktu & tren', ic: 'clock' },
    { k: 'period', l: 'Periode data', t: 'text', key: 1 },
    { k: 'span', l: 'Rentang periode', h: 'Dalam hari', t: 'int', b: 0 },
    { k: 'activeDays', l: 'Hari dengan transaksi', t: 'int', b: 1 },
    { k: 'activeRate', l: 'Rasio hari aktif', h: 'Hari ada transaksi \u00F7 rentang', t: 'pct', b: 1 },
    { k: 'revPerDay', l: 'Pendapatan per hari', h: 'Adil untuk periode berbeda', t: 'money', b: 1, key: 1 },
    { k: 'ordersPerDay', l: 'Pesanan per hari', t: 'dec', b: 1 },
    { k: 'bestDayRev', l: 'Pendapatan harian tertinggi', t: 'money', b: 0 },
    { k: 'bestDay', l: 'Hari terbaik', t: 'text' },
    { k: 'trend', l: 'Tren paruh kedua vs pertama', h: 'Rata-rata harian tiap paruh', t: 'chg', b: 1, key: 1 },
    { sec: 'Produk & sebaran', ic: 'box' },
    { k: 'distinctProducts', l: 'Jumlah produk berbeda', t: 'int', b: 0 },
    { k: 'topProduct', l: 'Produk terlaris', t: 'text', key: 1 },
    { k: 'top3Share', l: 'Porsi 3 produk teratas', h: 'Dari total unit; tinggi = terkonsentrasi', t: 'pct', b: 0 },
    { k: 'topProvince', l: 'Provinsi terbanyak', t: 'text' },
    { k: 'topPayment', l: 'Metode bayar terbanyak', t: 'text' }
  ];

  function fmtVal(t, v){
    if(v == null || (typeof v === 'number' && !isFinite(v))) return '\u2014';
    if(t === 'money') return fmtRp(v);
    if(t === 'int') return fmtInt(v);
    if(t === 'dec') return fmtDec(v, 1);
    if(t === 'pct') return fmtPct(v);
    if(t === 'chg') return (v >= 0 ? '\u25B2 ' : '\u25BC ') + fmtPct(Math.abs(v));
    return String(v);
  }

  function deltaHtml(row, v, base){
    if(row.t === 'text' || v == null || base == null) return '';
    var d, txt;
    if(row.t === 'pct' || row.t === 'chg'){
      d = v - base;
      if(Math.abs(d) < 0.05) return '<span class="cmp-delta neutral">\u2248 sama</span>';
      txt = (d > 0 ? '+' : '\u2212') + fmtDec(Math.abs(d), 1) + ' poin';
    } else {
      if(base === 0){ return v === 0 ? '<span class="cmp-delta neutral">\u2248 sama</span>' : ''; }
      d = (v - base) / Math.abs(base) * 100;
      if(Math.abs(d) < 0.05) return '<span class="cmp-delta neutral">\u2248 sama</span>';
      txt = (d > 0 ? '\u25B2 ' : '\u25BC ') + fmtPct(Math.abs(d));
    }
    var cls = 'neutral';
    if(row.b){ cls = ((d > 0) === (row.b > 0)) ? 'good' : 'bad'; }
    return '<span class="cmp-delta ' + cls + '">' + txt + '</span>';
  }

  var ICONS = {
    bars: '<path d="M3 13V8M8 13V3M13 13V6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    users: '<circle cx="6" cy="5.5" r="2.2" stroke="currentColor" stroke-width="1.5"/><path d="M2 13c.4-2.4 2-3.5 4-3.5s3.6 1.1 4 3.5M11 4.2a2 2 0 010 3.8M12.5 9.8c1 .5 1.6 1.5 1.8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    check: '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 8.2l1.8 1.8 3.2-3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    clock: '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.2l2 1.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    box: '<path d="M2.5 5L8 2.5 13.5 5v6L8 13.5 2.5 11V5zM2.5 5L8 7.5 13.5 5M8 7.5v6" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
  };
  function icon(n){ return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }

  /* hitung nilai terbaik per baris */
  function analyze(R){
    var res = {}, score = R.map(function(){ return 0; }), decided = 0;
    ROWS.forEach(function(row){
      if(row.sec) return;
      var vals = R.map(function(r){ return r.m[row.k]; });
      var nums = vals.map(function(v){ return typeof v === 'number' && isFinite(v) ? v : null; });
      var valid = nums.filter(function(v){ return v != null; });
      var best = -1;
      if(row.b && row.t !== 'text' && valid.length >= 2 && Math.max.apply(null, valid) !== Math.min.apply(null, valid)){
        var target = row.b > 0 ? Math.max.apply(null, valid) : Math.min.apply(null, valid);
        best = nums.indexOf(target);
        score[best]++; decided++;
      }
      res[row.k] = { vals: vals, nums: nums, best: best, max: valid.length ? Math.max.apply(null, valid.map(Math.abs)) : 0 };
    });
    return { rows: res, score: score, decided: decided };
  }

  function scoreHtml(R, A){
    return '<div class="cmp-score">' + R.map(function(r, i){
      var pct = A.decided ? A.score[i] / A.decided * 100 : 0;
      var lead = A.score[i] === Math.max.apply(null, A.score) && A.score[i] > 0;
      return '<div class="cmp-score-card' + (lead ? ' lead' : '') + '" style="--c:' + r.color + '">' +
        '<div class="nm"><span class="cmp-swatch" style="background:' + r.color + '"></span><span title="' + esc(r.label) + '">' + esc(trunc(r.label, 30)) + '</span>' + (lead ? '<span class="crown" title="Unggul di metrik terbanyak">\u2605</span>' : '') + '</div>' +
        '<div class="big">' + A.score[i] + '<small> / ' + A.decided + ' metrik unggul</small></div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('') + '</div>';
  }

  function tableHtml(R, A, mode){
    var head = '<tr><th class="cmp-corner">Metrik</th>' + R.map(function(r, i){
      return '<th class="cmp-thv" style="--c:' + r.color + '"><div class="cmp-th-name" title="' + esc(r.label) + '">' + esc(trunc(r.label, 30)) + '</div>' +
        (i === 0 ? '<span class="cmp-tag">Baseline</span>' : '<span class="cmp-th-sub">\u0394 vs baseline</span>') + '</th>';
    }).join('') + '</tr>';
    var body = '', pendingSec = null, secCount = 0;
    function flushSec(){ if(pendingSec){ body += pendingSec; pendingSec = null; } }
    ROWS.forEach(function(row){
      if(row.sec){
        pendingSec = '<tr class="cmp-sec"><td colspan="' + (R.length + 1) + '"><span class="ic">' + icon(row.ic) + '</span>' + esc(row.sec) + '</td></tr>';
        return;
      }
      if(mode === 'key' && !row.key) return;
      flushSec();
      var a = A.rows[row.k];
      body += '<tr class="cmp-row"><td class="cmp-label"><span class="l">' + esc(row.l) + '</span>' + (row.h ? '<span class="h">' + esc(row.h) + '</span>' : '') + '</td>' +
        a.vals.map(function(v, i){
          var txt = row.t === 'text';
          var bar = (!txt && row.t !== 'chg' && a.nums[i] != null && a.max > 0)
            ? '<div class="cmp-bar"><i style="width:' + Math.max(2, Math.abs(a.nums[i]) / a.max * 100) + '%;background:' + R[i].color + '"></i></div>' : '';
          return '<td class="cmp-val' + (txt ? ' txt' : '') + (i === a.best ? ' best' : '') + '">' +
            '<div class="cmp-valtop"><span class="cmp-main' + (txt ? ' cmp-text' : '') + '"' + (txt && v ? ' title="' + esc(v) + '"' : '') + '>' + esc(fmtVal(row.t, v)) + '</span>' +
            (i === a.best ? '<span class="cmp-star" title="Nilai terbaik">\u2605</span>' : '') + '</div>' +
            bar + (i === 0 ? '' : deltaHtml(row, v, a.vals[0])) + '</td>';
        }).join('') + '</tr>';
    });
    return '<div class="table-scroll"><table class="cmp-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  /* ---------- kartu ringkas ---------- */
  function cardsHtml(R){
    return R.map(function(r){
      var m = r.m;
      function row(l, v, cls){ return '<div class="row"><span>' + l + '</span><span class="v ' + (cls || '') + '">' + esc(v) + '</span></div>'; }
      var trendCls = m.trend == null ? '' : (m.trend >= 0 ? 'up' : 'down');
      return '<div class="compare-card" style="border-left-color:' + r.color + '">' +
        '<h4 title="' + esc(r.label) + '">' + esc(r.label) + '</h4>' +
        row('Periode', m.period || '\u2014') +
        row('Total pendapatan', fmtVal('money', m.revenue)) +
        row('Total pesanan', fmtVal('int', m.orders)) +
        row('Rata-rata nilai pesanan', fmtVal('money', m.aov)) +
        row('Pendapatan per hari', fmtVal('money', m.revPerDay)) +
        row('Pelanggan unik', fmtVal('int', m.customers)) +
        row('Tingkat repeat', fmtVal('pct', m.repeatRate)) +
        row('Tingkat pembatalan', fmtVal('pct', m.cancelRate)) +
        row('Produk terlaris', m.topProduct || '\u2014') +
        row('Tren paruh kedua vs pertama', fmtVal('chg', m.trend), trendCls) +
        '</div>';
    }).join('');
  }

  /* ---------- daftar peringkat per dataset ---------- */
  function listsHtml(R, getItems, valueFn, subFn){
    return '<div class="cmp-lists">' + R.map(function(r){
      var items = getItems(r.m) || [];
      var max = items.length ? Math.max.apply(null, items.map(function(x){ return x.bar; })) : 0;
      return '<div class="cmp-list"><h4><span class="cmp-swatch" style="background:' + r.color + '"></span><span title="' + esc(r.label) + '">' + esc(trunc(r.label, 30)) + '</span></h4>' +
        (items.length ? items.map(function(it, i){
          return '<div class="cmp-li"><span class="rk">' + (i + 1) + '</span><div class="body">' +
            '<div class="top"><span class="nm" title="' + esc(it.n) + '">' + esc(it.n) + '</span><span class="vl">' + esc(valueFn(it)) + '</span></div>' +
            '<div class="bar"><i style="width:' + (max ? Math.max(3, it.bar / max * 100) : 0) + '%;background:' + r.color + '"></i></div>' +
            (subFn ? '<div class="sub">' + esc(subFn(it)) + '</div>' : '') + '</div></div>';
        }).join('') : '<div class="cmp-none">Data tidak tersedia</div>') + '</div>';
    }).join('') + '</div>';
  }

  /* ---------- kesimpulan otomatis ---------- */
  function conclusions(R){
    var out = [];
    function nm(r){ return '<b>' + esc(r.label) + '</b>'; }
    function by(k, dir){
      var c = R.filter(function(r){ return typeof r.m[k] === 'number' && isFinite(r.m[k]); });
      if(!c.length) return null;
      c.sort(function(a, b){ return dir === 'asc' ? a.m[k] - b.m[k] : b.m[k] - a.m[k]; });
      return c;
    }
    var rev = by('revenue', 'desc');
    if(rev && rev.length > 1){
      var top = rev[0], low = rev[rev.length - 1];
      var ratio = low.m.revenue > 0 ? ' atau ' + fmtDec(top.m.revenue / low.m.revenue, 2) + '\u00D7 lipat dari ' : ', dibanding ';
      out.push(nm(top) + ' mencatat pendapatan tertinggi, <b>' + fmtRp(top.m.revenue) + '</b>' + ratio + nm(low) + ' (' + fmtRp(low.m.revenue) + ').');
    }
    var spans = R.map(function(r){ return r.m.span; }).filter(function(x){ return x > 0; });
    if(spans.length > 1 && Math.max.apply(null, spans) / Math.min.apply(null, spans) > 1.2){
      var rpd = by('revPerDay', 'desc');
      out.push('Panjang periode tiap dataset berbeda (' + R.map(function(r){ return r.m.span + ' hari'; }).join(' vs ') + '), jadi pembandingan yang paling adil memakai metrik per hari' +
        (rpd ? ': pendapatan per hari tertinggi ada pada ' + nm(rpd[0]) + ' (' + fmtRp(rpd[0].m.revPerDay) + ').' : '.'));
    }
    var ord = by('orders', 'desc'), aov = by('aov', 'desc');
    if(ord && aov && ord.length > 1){
      if(ord[0] !== aov[0]) out.push(nm(ord[0]) + ' unggul dalam <b>jumlah pesanan</b> (' + fmtInt(ord[0].m.orders) + '), sedangkan ' + nm(aov[0]) + ' unggul dalam <b>nilai per pesanan</b> (' + fmtRp(aov[0].m.aov) + '). Artinya keunggulan pendapatan tiap dataset berasal dari sumber yang berbeda.');
      else out.push(nm(ord[0]) + ' unggul sekaligus dalam jumlah pesanan (' + fmtInt(ord[0].m.orders) + ') dan rata-rata nilai pesanan (' + fmtRp(aov[0].m.aov) + ').');
    }
    var rep = by('repeatRate', 'desc');
    if(rep && rep.length > 1 && rep[0].m.repeatRate > 0) out.push('Tingkat pelanggan yang membeli ulang paling tinggi pada ' + nm(rep[0]) + ' (<b>' + fmtPct(rep[0].m.repeatRate) + '</b> dari pelanggan unik).');
    var can = by('cancelRate', 'asc');
    if(can && can.length > 1 && can[can.length - 1].m.cancelRate > 0) out.push('Pembatalan paling rendah terjadi pada ' + nm(can[0]) + ' (<b>' + fmtPct(can[0].m.cancelRate) + '</b>); paling tinggi pada ' + nm(can[can.length - 1]) + ' (' + fmtPct(can[can.length - 1].m.cancelRate) + ').');
    var trd = by('trend', 'desc');
    if(trd && trd.length > 1) out.push('Momentum penjualan terkuat ada pada ' + nm(trd[0]) + ' (paruh kedua periode ' + (trd[0].m.trend >= 0 ? 'naik ' : 'turun ') + '<b>' + fmtPct(Math.abs(trd[0].m.trend)) + '</b> dibanding paruh pertama)' +
      (trd[trd.length - 1].m.trend < 0 ? '; ' + nm(trd[trd.length - 1]) + ' justru turun ' + fmtPct(Math.abs(trd[trd.length - 1].m.trend)) + '.' : '.'));
    var tops = R.map(function(r){ return r.m.topProduct; }).filter(Boolean);
    if(tops.length > 1){
      var uniq = tops.filter(function(x, i){ return tops.indexOf(x) === i; });
      out.push(uniq.length === 1 ? 'Produk terlaris <b>sama di semua dataset</b>: ' + esc(trunc(uniq[0], 90)) + ', sehingga performa produk andalan konsisten antarperiode.' : 'Produk terlaris <b>berbeda antardataset</b>, menandakan pergeseran produk andalan antarperiode \u2014 lihat daftar Produk terlaris di bawah.');
    }
    R.forEach(function(r){ if(r.m.fallbackAll) out.push('Pada ' + nm(r) + ' tidak ditemukan pesanan berstatus selesai, sehingga seluruh pesanan dihitung dalam pendapatan.'); });
    var miss = [];
    R.forEach(function(r){ r.m.missing.forEach(function(x){ if(miss.indexOf(x) === -1) miss.push(x); }); });
    if(miss.length) out.push('Kolom berikut tidak terdeteksi pada sebagian data sehingga metrik terkait ditampilkan \u201c\u2014\u201d: ' + esc(miss.join(', ')) + '.');
    return out.map(function(t){ return '<p>' + t + '</p>'; }).join('');
  }

  /* ---------- grafik ---------- */

  /* ---------- proyeksi per dataset (berdampingan) ---------- */
  function forecastRuns(R){
    if(typeof Forecast === 'undefined') return [];
    return R.map(function(r){
      var m = r.m;
      if(!m.revSeries || m.span < 2) return null;
      // hari dalam minggu (0 = Minggu): nomor hari 0 = Kamis (1 Jan 1970)
      return Forecast.run(m.revSeries, (m.minDay + 4) % 7, { horizon: fcState.h, modelKey: 'auto' });
    });
  }
  function forecastBodyHtml(R){
    var runs = forecastRuns(R);
    if(!runs.some(function(x){ return x; })) return '<div class="state-empty">Proyeksi memerlukan minimal 2 hari data transaksi pada dataset.</div>';
    var rows = '', notes = '';
    R.forEach(function(r, i){
      var f = runs[i], m = r.m;
      if(!f){
        rows += '<tr><td>' + esc(r.label) + '</td><td colspan="7" class="fc-muted">Data belum cukup untuk membuat proyeksi.</td></tr>';
        return;
      }
      var hist = m.span ? sum(m.revSeries) / m.span : 0;
      var chg = hist > 0 ? (f.total / fcState.h / hist - 1) * 100 : null;
      var ev = f.evalRes;
      rows += '<tr><td><span class="cmp-dot" style="background:' + r.color + '"></span> ' + esc(r.label) + '</td>' +
        '<td class="tabular">' + fmtInt(m.span) + ' hari</td>' +
        '<td>' + esc(f.modelName.replace(' (pembanding)', '')) + '</td>' +
        '<td class="tabular"><b>' + fmtRp(f.total) + '</b></td>' +
        '<td class="tabular">' + fmtRp(f.totalLow) + ' \u2013 ' + fmtRp(f.totalHigh) + '</td>' +
        '<td class="tabular">' + (chg === null ? '\u2014' : (chg >= 0 ? '+' : '') + fmtDec(chg, 1) + '%') + '</td>' +
        '<td class="tabular">' + (ev.ok && ev.mape !== null ? fmtDec(ev.mape, 1) + '%' : '\u2014') + '</td>' +
        '<td><span class="fc-badge lvl-' + f.reliability.level + '">' + f.reliability.label + '</span></td></tr>';
      notes += '<li><span class="fc-badge lvl-' + f.reliability.level + '">' + esc(r.label) + '</span><span class="fc-muted">' + f.reliability.reasons.map(esc).join(' ') + '</span></li>';
    });
    return '<div class="cmp-chart"><canvas id="cmpForecast"></canvas></div>' +
      '<div class="table-scroll" style="margin-top:14px;"><table class="fc-table"><thead><tr><th>Dataset</th><th>Riwayat</th><th>Model terpilih</th><th>Proyeksi total (' + fcState.h + ' hari)</th><th>Rentang rendah\u2013tinggi</th><th>Rata-rata/hari vs riwayat</th><th>MAPE backtest</th><th>Keandalan</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<ul class="cmp-fc-notes">' + notes + '</ul>' +
      '<div class="eval-note">Model dipilih otomatis per dataset lewat rolling backtest. Rentang rendah\u2013tinggi memakai persentil 10\u201390 galat backtest. Proyeksi disejajarkan pada langkah ke-N setelah data terakhir tiap dataset, karena tanggalnya bisa berbeda.</div>';
  }
  function forecastConfig(){
    var t = themeOpts(), h = fcState.h, runs = forecastRuns(lastResult), labels = [], k;
    for(k = 1; k <= h; k++) labels.push('H+' + k);
    var sets = [];
    lastResult.forEach(function(r, i){
      var f = runs[i];
      if(!f) return;
      sets.push({ label: r.label, data: f.pred, low: f.low, high: f.high, borderColor: r.color, backgroundColor: withAlpha(r.color, 0.12), borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, fill: false });
    });
    return {
      type: 'line', data: { labels: labels, datasets: sets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: t.tick, boxWidth: 12 } },
          tooltip: { callbacks: {
            label: function(c){ return c.dataset.label + ': ' + fmtRp(c.parsed.y); },
            afterLabel: function(c){ var d = c.dataset; return 'Rentang: ' + fmtRp(d.low[c.dataIndex]) + ' \u2013 ' + fmtRp(d.high[c.dataIndex]); }
          } }
        },
        scales: { x: { ticks: { color: t.tick, maxTicksLimit: 10 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: t.tick, callback: function(v){ return fmtRpShort(v); } }, grid: { color: t.grid } } }
      }
    };
  }
  function redrawForecast(){
    var body = $('cmpFcBody');
    if(!body || !lastResult) return;
    for(var i = charts.length - 1; i >= 0; i--){ if(charts[i].canvas && charts[i].canvas.id === 'cmpForecast'){ charts[i].destroy(); charts.splice(i, 1); } }
    body.innerHTML = forecastBodyHtml(lastResult);
    var cv = $('cmpForecast');
    if(cv && typeof Chart !== 'undefined') charts.push(new Chart(cv, forecastConfig()));
  }

  function destroyCharts(){ charts.forEach(function(c){ try{ c.destroy(); }catch(e){} }); charts = []; }
  function themeOpts(){
    return { tick: cssVar('--ink-muted', '#94A390'), grid: cssVar('--chart-grid', cssVar('--border', '#2B3527')), ink: cssVar('--ink', '#EAF0E6') };
  }
  function withAlpha(c, a){
    if(/^#[0-9a-f]{6}$/i.test(c)){
      var n = parseInt(c.slice(1), 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return c;
  }

  function trendConfig(){
    var R = lastResult.filter(function(r){ return r.m.span > 0; });
    var t = themeOpts(), metric = trendState.metric, mode = trendState.mode;
    var labels = [], sets;
    function series(m){ return metric === 'revenue' ? m.revSeries : m.ordSeries; }
    var lo, i;
    if(mode === 'calendar'){
      lo = Math.min.apply(null, R.map(function(r){ return r.m.minDay; }));
      var hi = Math.max.apply(null, R.map(function(r){ return r.m.maxDay; }));
      for(i = lo; i <= hi; i++) labels.push(fmtDayShort(i));
      sets = R.map(function(r){
        return { r: r, data: labels.map(function(_, k){ var d = lo + k; return (d < r.m.minDay || d > r.m.maxDay) ? null : series(r.m)[d - r.m.minDay]; }) };
      });
    } else {
      var maxSpan = Math.max.apply(null, R.map(function(r){ return r.m.span; }));
      for(i = 1; i <= maxSpan; i++) labels.push(i);
      sets = R.map(function(r){
        var acc = 0, s = series(r.m);
        return { r: r, data: labels.map(function(_, k){ if(k >= r.m.span) return null; if(mode === 'cum'){ acc += s[k]; return acc; } return s[k]; }) };
      });
    }
    return {
      type: 'line',
      data: { labels: labels, datasets: sets.map(function(x){
        return { label: x.r.label, data: x.data, borderColor: x.r.color, backgroundColor: withAlpha(x.r.color, 0.12), borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, spanGaps: false, fill: mode === 'cum' };
      }) },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: t.tick, boxWidth: 14 } },
          tooltip: {
            callbacks: {
              title: function(items){ return mode === 'calendar' ? items[0].label : 'Hari ke-' + items[0].label; },
              label: function(ctx){
                var r = sets[ctx.datasetIndex].r, v = ctx.parsed.y;
                var when = mode === 'calendar' ? '' : ' (' + fmtDayShort(r.m.minDay + ctx.dataIndex) + ')';
                return ctx.dataset.label + when + ': ' + (metric === 'revenue' ? fmtRp(v) : fmtInt(v));
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: t.tick, maxRotation: 50, autoSkipPadding: 12 }, grid: { color: t.grid },
               title: mode === 'calendar' ? { display: false } : { display: true, text: 'Hari sejak awal periode', color: t.tick } },
          y: { beginAtZero: true, ticks: { color: t.tick, callback: function(v){ return metric === 'revenue' ? fmtRpShort(v) : fmtInt(v); } }, grid: { color: t.grid } }
        }
      }
    };
  }

  function statusConfig(){
    var R = lastResult, t = themeOpts();
    var tot = {};
    R.forEach(function(r){ Object.keys(r.m.statuses || {}).forEach(function(k){ tot[k] = (tot[k] || 0) + r.m.statuses[k]; }); });
    var keys = Object.keys(tot).sort(function(a, b){ return tot[b] - tot[a]; });
    var main = keys.slice(0, 5), hasOther = keys.length > 5;
    var pal = [cssVar('--brand', '#6FBE8F'), cssVar('--amber', '#E2B15C'), cssVar('--brick', '#E08579'), cssVar('--blue', '#7FB0E0'), '#A78BCA', cssVar('--border', '#2B3527')];
    var groups = main.concat(hasOther ? ['Lainnya'] : []);
    return {
      type: 'bar',
      data: { labels: R.map(function(r){ return trunc(r.label, 26); }), datasets: groups.map(function(g, gi){
        return { label: g, backgroundColor: pal[gi % pal.length], borderWidth: 0, data: R.map(function(r){
          var total = sum(Object.keys(r.m.statuses || {}).map(function(k){ return r.m.statuses[k]; }));
          if(!total) return 0;
          var c = g === 'Lainnya' ? sum(Object.keys(r.m.statuses).filter(function(k){ return main.indexOf(k) === -1; }).map(function(k){ return r.m.statuses[k]; })) : (r.m.statuses[g] || 0);
          return c / total * 100;
        }) };
      }) },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: t.tick, boxWidth: 12 } },
          tooltip: { callbacks: { label: function(c){ return c.dataset.label + ': ' + fmtPct(c.parsed.x); } } } },
        scales: { x: { stacked: true, max: 100, ticks: { color: t.tick, callback: function(v){ return v + '%'; } }, grid: { color: t.grid } },
                  y: { stacked: true, ticks: { color: t.tick }, grid: { display: false } } }
      }
    };
  }

  function weekdayConfig(){
    var R = lastResult, t = themeOpts();
    return {
      type: 'bar',
      data: { labels: DAY_NAMES, datasets: R.map(function(r){ return { label: r.label, data: r.m.weekday, backgroundColor: r.color, borderRadius: 4 }; }) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: t.tick, boxWidth: 12 } }, tooltip: { callbacks: { label: function(c){ return c.dataset.label + ': ' + fmtPct(c.parsed.y); } } } },
        scales: { x: { ticks: { color: t.tick }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: t.tick, callback: function(v){ return v + '%'; } }, grid: { color: t.grid } } }
      }
    };
  }

  function drawCharts(){
    if(!lastResult) return;
    destroyCharts();
    if(typeof Chart === 'undefined') return;
    [['cmpTrend', trendConfig], ['cmpForecast', forecastConfig], ['cmpStatus', statusConfig], ['cmpWeekday', weekdayConfig]].forEach(function(p){
      var cv = $(p[0]);
      if(cv) charts.push(new Chart(cv, p[1]()));
    });
  }
  function redrawTrend(){
    var cv = $('cmpTrend');
    if(!cv || typeof Chart === 'undefined' || !lastResult) return;
    for(var i = 0; i < charts.length; i++){ if(charts[i].canvas === cv){ charts[i].destroy(); charts.splice(i, 1); break; } }
    charts.push(new Chart(cv, trendConfig()));
  }

  /* ---------- render halaman hasil ---------- */
  function panel(title, desc, inner, extraHead){
    return '<div class="panel"><div class="panel-head"><div><h3>' + title + '</h3>' + (desc ? '<div class="desc">' + desc + '</div>' : '') + '</div>' + (extraHead || '') + '</div>' + inner + '</div>';
  }
  function seg(group, opts, cur){
    return '<div class="cmp-seg" data-group="' + group + '">' + opts.map(function(o){
      return '<button type="button" data-v="' + o[0] + '" class="' + (o[0] === cur ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function render(){
    var box = $('compareResults'), empty = $('compareEmpty');
    if(!box || !lastResult) return;
    var R = lastResult;
    if(empty) empty.style.display = 'none';
    var html = '';
    html += '<div class="compare-cards">' + cardsHtml(R) + '</div>';
    var A = analyze(R);
    html += panel('Tabel perbandingan metrik',
      '\u0394 dihitung terhadap <b>' + esc(R[0].label) + '</b> (baseline). \u2605 = nilai terbaik pada metrik itu; batang kecil menunjukkan besar relatif antardataset.',
      scoreHtml(R, A) + '<div id="cmpTableWrap">' + tableHtml(R, A, tableMode) + '</div>',
      '<div class="cmp-controls">' + seg('table', [['all', 'Lengkap'], ['key', 'Ringkas']], tableMode) + '</div>');
    html += panel('Tren harian',
      'Mode \u201cHari ke-N\u201d menyejajarkan awal periode tiap dataset agar bisa dibandingkan langsung walau tanggalnya berbeda.',
      '<div class="cmp-chart"><canvas id="cmpTrend"></canvas></div>',
      '<div class="cmp-controls">' + seg('metric', [['revenue', 'Pendapatan'], ['orders', 'Pesanan']], trendState.metric) +
        seg('mode', [['index', 'Hari ke-N'], ['cum', 'Kumulatif'], ['calendar', 'Kalender']], trendState.mode) + '</div>');
    html += panel('Proyeksi berdampingan',
      'Proyeksi pendapatan harian per dataset dengan model terbaik menurut rolling backtest, lengkap dengan rentang skenario dan indikator keandalan.',
      '<div id="cmpFcBody">' + forecastBodyHtml(R) + '</div>',
      '<div class="cmp-controls">' + seg('fh', [['7', '7 hari'], ['14', '14 hari'], ['30', '30 hari']], String(fcState.h)) + '</div>');
    html += '<div class="cmp-grid-2">' +
      panel('Komposisi status pesanan', 'Persentase pesanan per status pada tiap dataset.', '<div class="cmp-chart short"><canvas id="cmpStatus"></canvas></div>') +
      panel('Pola pendapatan per hari dalam seminggu', 'Porsi pendapatan (%) pada tiap hari, agar adil walau panjang periode berbeda.', '<div class="cmp-chart short"><canvas id="cmpWeekday"></canvas></div>') +
      '</div>';
    html += panel('Produk terlaris', 'Lima produk dengan unit terjual terbanyak pada tiap dataset.',
      listsHtml(R, function(m){ return (m.topProducts || []).map(function(p){ return { n: p.n, u: p.u, v: p.v, bar: p.u }; }); },
        function(it){ return fmtInt(it.u) + ' unit'; }, function(it){ return it.v ? 'Nilai ' + fmtRp(it.v) : ''; }));
    html += panel('Provinsi teratas', 'Sebaran asal pesanan berdasarkan provinsi (persentase dari pesanan yang dihitung).',
      listsHtml(R, function(m){ return (m.provinces || []).map(function(p){ return { n: p.n, c: p.c, p: p.p, bar: p.c }; }); },
        function(it){ return fmtPct(it.p); }, function(it){ return fmtInt(it.c) + ' pesanan'; }));
    html += panel('Kota / kabupaten teratas', 'Lima kota atau kabupaten dengan pesanan terbanyak.',
      listsHtml(R, function(m){ return (m.cities || []).map(function(p){ return { n: p.n, c: p.c, p: p.p, bar: p.c }; }); },
        function(it){ return fmtPct(it.p); }, function(it){ return fmtInt(it.c) + ' pesanan'; }));
    html += panel('Metode pembayaran', 'Metode pembayaran yang paling sering dipakai.',
      listsHtml(R, function(m){ return (m.payments || []).map(function(p){ return { n: p.n, c: p.c, p: p.p, bar: p.c }; }); },
        function(it){ return fmtPct(it.p); }, function(it){ return fmtInt(it.c) + ' pesanan'; }));
    html += panel('Kesimpulan evaluasi', 'Disusun otomatis dari angka pada halaman ini.', '<div class="insight-narrative">' + conclusions(R) + '</div>');
    box.innerHTML = html;
    box.style.display = '';
    drawCharts();
  }

  /* ---------- event ---------- */
  function init(){
    var picker = $('comparePickerList'), btn = $('btnRunCompare'), box = $('compareResults');
    if(picker) picker.addEventListener('change', function(e){
      var cb = e.target.closest ? e.target.closest('input[type=checkbox]') : null;
      if(!cb) return;
      var id = cb.getAttribute('data-id');
      var at = selected.indexOf(id);
      if(cb.checked && at === -1 && selected.length < MAX_SELECT) selected.push(id);
      if(!cb.checked && at !== -1) selected.splice(at, 1);
      lastResult = null;
      if(box){ destroyCharts(); box.style.display = 'none'; box.innerHTML = ''; }
      renderComparePicker();
    });
    if(btn) btn.addEventListener('click', run);
    if(picker && !$('cmpToolbar')){
      var bar = document.createElement('div');
      bar.id = 'cmpToolbar'; bar.className = 'cmp-toolbar';
      bar.innerHTML = '<span class="cmp-count" id="cmpCount"></span>' +
        '<button type="button" class="btn btn-secondary cmp-add" id="btnAddDatasetCompare"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Tambah dataset</button>';
      picker.parentNode.insertBefore(bar, picker);
      bar.querySelector('#btnAddDatasetCompare').addEventListener('click', function(){
        var fi = $('fileInput');
        awaitingNewUntil = Date.now() + 10 * 60 * 1000;
        if(fi) fi.click();
      });
    }
    if(box) box.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('.cmp-seg button') : null;
      if(!b) return;
      var group = b.parentNode.getAttribute('data-group');
      var val = b.getAttribute('data-v');
      var sibs = b.parentNode.querySelectorAll('button');
      for(var i = 0; i < sibs.length; i++) sibs[i].classList.toggle('on', sibs[i] === b);
      if(group === 'table'){
        tableMode = val;
        var wrap = $('cmpTableWrap');
        if(wrap && lastResult) wrap.innerHTML = tableHtml(lastResult, analyze(lastResult), tableMode);
        return;
      }
      if(group === 'fh'){ fcState.h = parseInt(val, 10) || 7; redrawForecast(); return; }
      trendState[group] = val;
      redrawTrend();
    });
    if(typeof MutationObserver !== 'undefined'){
      new MutationObserver(function(){ if(lastResult) drawCharts(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    }
    renderComparePicker();
  }

  if(typeof document !== 'undefined' && document.getElementById) init();
  if(typeof window !== 'undefined') window.renderComparePicker = renderComparePicker;
  return { compute: compute, detectFields: detectFields, render: renderComparePicker };
})();
