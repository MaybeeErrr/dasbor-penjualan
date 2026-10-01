"use strict";

/* ---------------- Parser laporan Shopee Seller Centre ----------------
   Menerima berkas .xlsx yang diekspor dari Shopee Seller Centre: Tinjauan Penjualan (Sales
   Overview), Tinjauan Produk (Product Overview), Tinjauan Traffic (Traffic Overview), Performa
   Chat (Chat Performance), dan Statistik Toko (Shop Stats). Berkas-berkas ini punya bentuk khas:
   tiap sheet berisi satu atau lebih "blok" (baris header lalu baris data), dipisahkan oleh baris
   kosong. Blok pertama biasanya ringkasan satu baris untuk seluruh periode; blok berikutnya
   deret harian/bulanan. Modul ini murni (tanpa DOM) supaya bisa diuji langsung, dan dipakai oleh
   sections/shopee.js untuk mengunggah beberapa berkas sekaligus, dikenali otomatis dari header
   kolomnya (bukan dari nama berkas), lalu digabung menjadi satu state.shopee. */
var ShopeeParse = (function(){

  /* ---------- Pembaca nilai gaya Shopee (format Indonesia) ---------- */
  function s(v){ return v === null || v === undefined ? '' : String(v).trim(); }
  function isBlank(v){ return s(v) === ''; }

  function num(v){
    var t = s(v);
    if(t === '' || t === '-') return null;
    var clean = t.replace(/%/g, '').trim();
    var n = parseIDNumber(clean);           // dari core/utils.js: "1.234,56" -> 1234.56
    return isNaN(n) ? null : n;
  }
  function pct(v){ return num(v); }          // sudah dalam skala persen (mis. 14,01 untuk 14,01%)

  var DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
  var RANGE_RE = /^(\d{2}-\d{2}-\d{4})-(\d{2}-\d{2}-\d{4})$/;
  var DATETIME_RE = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/;

  function isDateStr(v){ return DATE_RE.test(s(v)); }
  function isRangeStr(v){ return RANGE_RE.test(s(v)); }

  // "01-09-2026" (DD-MM-YYYY) -> "2026-09-01" (kunci hari yang dipakai seluruh dasbor)
  function shopeeDateToKey(v){
    var m = DATE_RE.exec(s(v));
    if(!m) return null;
    return m[3] + '-' + m[2] + '-' + m[1];
  }
  function shopeeDateTimeToLabel(v){
    var m = DATETIME_RE.exec(s(v));
    if(!m) return s(v);
    return m[3] + '-' + m[2] + '-' + m[1] + ' ' + m[4] + ':' + m[5];
  }
  // "00:30:43" -> detik; '-'/'' -> null
  function durationToSeconds(v){
    var t = s(v);
    if(t === '' || t === '-') return null;
    var p = t.split(':');
    if(p.length !== 3) return null;
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10), sec = parseInt(p[2], 10);
    if(isNaN(h) || isNaN(m) || isNaN(sec)) return null;
    return h * 3600 + m * 60 + sec;
  }

  /* ---------- Pemecah sheet menjadi blok (header + baris data), dipisah baris kosong ---------- */
  function sheetToBlocks(aoa){
    var blocks = [];
    var i = 0;
    while(i < aoa.length && (!aoa[i] || aoa[i].every(isBlank))) i++;
    while(i < aoa.length){
      var header = (aoa[i] || []).map(s);
      i++;
      var rows = [];
      while(i < aoa.length && aoa[i] && !aoa[i].every(isBlank)){ rows.push(aoa[i]); i++; }
      while(i < aoa.length && (!aoa[i] || aoa[i].every(isBlank))) i++;
      var kind = 'list';
      if(rows.length === 1 && isRangeStr(rows[0][0])) kind = 'summary';
      else if(rows.length && rows.filter(function(r){ return isDateStr(r[0]); }).length >= rows.length * 0.6) kind = 'series';
      blocks.push({ header: header, rows: rows, kind: kind });
    }
    return blocks;
  }

  function headerHas(header, needle){
    return header.some(function(h){ return h.indexOf(needle) !== -1; });
  }

  function mapRow(header, row, fieldMap, convert){
    var out = {};
    header.forEach(function(h, idx){
      var key = fieldMap[h];
      if(!key) return;
      var raw = row[idx];
      out[key] = (convert && convert[key]) ? convert[key](raw) : raw;
    });
    return out;
  }

  function rawTable(header, rows){
    return { header: header, rows: rows.map(function(r){ return header.map(function(_, i){ return s(r[i]); }); }) };
  }

  /* ================= Tinjauan Penjualan (Sales Overview) ================= */
  var SALES_SUMMARY_MAP = {
    'Total Pengunjung (Kunjungan)': 'visitors', 'Total Pembeli (Pesanan Dibuat)': 'buyersCreated',
    'Penjualan (Pesanan Dibuat) (IDR)': 'salesCreated', 'Total Pembeli (Pesanan Siap Dikirim)': 'buyersReady',
    'Penjualan (Pesanan Siap Dikirim) (IDR)': 'salesReady', 'Penjualan per Pembeli (Pesanan COD Dibuat + non-COD Dibayar) (IDR)': 'salesPerBuyer',
    'Tingkat Konversi (Pesanan Dibuat dibagi Kunjungan)': 'convCreated', 'Tingkat Konversi (Pesanan Siap Dikirim dibagi Pesanan Dibuat)': 'convReadyOverCreated'
  };
  var SALES_DAILY_MAP = {
    'Tanggal': 'date', 'Total Pengunjung (Kunjungan)': 'visitors', 'Total Pembeli (Pesanan Dibuat)': 'buyersCreated',
    'Total Produk Dipesan': 'productsOrderedQty', 'Produk (Pesanan Dibuat)': 'productsCreatedCount',
    'Penjualan (Pesanan Dibuat) (IDR)': 'salesCreated', 'Tingkat Konversi (Pesanan Dibuat dibagi Kunjungan)': 'convCreated',
    'Total Pembeli (Pesanan Siap Dikirim)': 'buyersReady', 'Produk (Pesanan Siap Dikirim)': 'productsReadyCount',
    'Pesanan (COD Dibuat + non-COD Dibayar)': 'ordersCodPaid', 'Penjualan (Pesanan Siap Dikirim) (IDR)': 'salesReady',
    'Penjualan per Pembeli (Pesanan COD Dibuat + non-COD Dibayar) (IDR)': 'salesPerBuyer', 'Tingkat Konversi (Pesanan Siap Dikirim dibagi Pesanan Dibuat)': 'convReadyOverCreated'
  };
  var NUM_KEYS = ['visitors','buyersCreated','salesCreated','buyersReady','salesReady','salesPerBuyer','productsOrderedQty','productsCreatedCount','productsReadyCount','ordersCodPaid'];
  var PCT_KEYS = ['convCreated','convReadyOverCreated','convReady','convGeneric'];
  function convertersFor(numKeys, pctKeys, dateKey){
    var conv = {};
    (numKeys || []).forEach(function(k){ conv[k] = num; });
    (pctKeys || []).forEach(function(k){ conv[k] = pct; });
    if(dateKey) conv[dateKey] = shopeeDateToKey;
    return conv;
  }

  function parseSalesOverview(sheets){
    var blocks = sheetToBlocks(sheets[0].aoa);
    var summaryBlock = blocks.filter(function(b){ return b.kind === 'summary'; })[0];
    var dailyBlock = blocks.filter(function(b){ return b.kind === 'series'; })[0];
    if(!dailyBlock) return { ok: false, error: 'Blok data harian tidak ditemukan pada Tinjauan Penjualan.' };
    var summary = summaryBlock ? mapRow(summaryBlock.header, summaryBlock.rows[0], SALES_SUMMARY_MAP, convertersFor(NUM_KEYS, PCT_KEYS)) : null;
    var daily = dailyBlock.rows.map(function(r){ return mapRow(dailyBlock.header, r, SALES_DAILY_MAP, convertersFor(NUM_KEYS, PCT_KEYS, 'date')); })
      .filter(function(r){ return r.date; }).sort(function(a,b){ return a.date < b.date ? -1 : 1; });
    return { ok: true, type: 'sales', label: 'Tinjauan Penjualan', summary: summary, daily: daily };
  }

  /* ================= Tinjauan Produk (Product Overview) ================= */
  var PRODUCT_MAP = {
    'Tanggal': 'date', 'Pengunjung Produk (Kunjungan)': 'productVisitors', 'Halaman Produk Dilihat': 'pageViews',
    'Produk Dikunjungi': 'productsVisited', 'Pengunjung Melihat Tanpa Membeli': 'viewersNoBuy',
    'Tingkat Pengunjung Melihat Tanpa Membeli': 'viewNoBuyRate', 'Klik Pencarian': 'searchClicks', 'Suka': 'likes',
    'Pengunjung Produk (Menambahkan Produk ke Keranjang)': 'cartVisitors', 'Dimasukkan ke Keranjang (Produk)': 'cartProducts',
    'Tingkat Konversi Produk Dimasukkan ke Keranjang': 'cartConvRate', 'Total Pembeli (Pesanan Dibuat)': 'buyersCreated',
    'Produk (Pesanan Dibuat)': 'productsCreatedCount', 'Produk Dipesan': 'productsOrderedQty',
    'Total Penjualan (Pesanan Dibuat) (IDR)': 'salesCreated', 'Tingkat Konversi (Pesanan yang Dibuat)': 'convCreated',
    'Total Pembeli (Pesanan Siap Dikirim)': 'buyersReady', 'Produk (Pesanan Siap Dikirim)': 'productsReadyCount',
    'Produk Siap Dikirim': 'productsReadyQty', 'Penjualan (Pesanan Siap Dikirim) (IDR)': 'salesReady',
    'Tingkat Konversi (Pesanan Siap Dikirim)': 'convReady', 'Tingkat Konversi (Pesanan Siap Dikirim dibagi Pesanan Dibuat)': 'convReadyOverCreated'
  };
  var PRODUCT_NUM = ['productVisitors','pageViews','productsVisited','viewersNoBuy','searchClicks','likes','cartVisitors','cartProducts',
    'buyersCreated','productsCreatedCount','productsOrderedQty','salesCreated','buyersReady','productsReadyCount','productsReadyQty','salesReady'];
  var PRODUCT_PCT = ['viewNoBuyRate','cartConvRate','convCreated','convReady','convReadyOverCreated'];

  function parseProductOverview(sheets){
    var blocks = sheetToBlocks(sheets[0].aoa);
    var dailyBlock = blocks.filter(function(b){ return b.kind === 'series'; })[0];
    if(!dailyBlock) return { ok: false, error: 'Blok data harian tidak ditemukan pada Tinjauan Produk.' };
    var daily = dailyBlock.rows.map(function(r){ return mapRow(dailyBlock.header, r, PRODUCT_MAP, convertersFor(PRODUCT_NUM, PRODUCT_PCT, 'date')); })
      .filter(function(r){ return r.date; }).sort(function(a,b){ return a.date < b.date ? -1 : 1; });
    return { ok: true, type: 'product', label: 'Tinjauan Produk', daily: daily };
  }

  /* ================= Tinjauan Traffic (Traffic Overview) ================= */
  var TRAFFIC_MAP = {
    'Tanggal': 'date', 'Produk Dilihat': 'productViews', 'Rata-rata Dilihat': 'avgViews',
    'Rata-rata Waktu Dihabiskan': 'avgTimeSpent', 'Tingkat Pengunjung Melihat Tanpa Membeli': 'viewNoBuyRate',
    'Total Pengunjung': 'visitors', 'Pengunjung Baru': 'newVisitors', 'Pengunjung Lama': 'oldVisitors', 'Jumlah Pengikut Baru': 'newFollowers'
  };
  var TRAFFIC_NUM = ['productViews','avgViews','visitors','newVisitors','oldVisitors','newFollowers'];
  var TRAFFIC_PCT = ['viewNoBuyRate'];
  var TRAFFIC_CONV = convertersFor(TRAFFIC_NUM, TRAFFIC_PCT, 'date');
  TRAFFIC_CONV.avgTimeSpent = durationToSeconds;

  var TRAFFIC_SOURCE_LABEL = { semua: 'Semua Sumber', situs: 'Situs', aplikasi: 'Aplikasi' };
  function trafficSourceKey(sheetName){
    var n = sheetName.toLowerCase();
    if(n.indexOf('situs') !== -1) return 'situs';
    if(n.indexOf('aplikasi') !== -1) return 'aplikasi';
    return 'semua';
  }
  function parseTrafficOverview(sheets){
    var sources = {};
    var any = false;
    sheets.forEach(function(sheet){
      var blocks = sheetToBlocks(sheet.aoa);
      var summaryBlock = blocks.filter(function(b){ return b.kind === 'summary'; })[0];
      var dailyBlock = blocks.filter(function(b){ return b.kind === 'series'; })[0];
      if(!dailyBlock) return;
      var key = trafficSourceKey(sheet.name);
      var daily = dailyBlock.rows.map(function(r){ return mapRow(dailyBlock.header, r, TRAFFIC_MAP, TRAFFIC_CONV); })
        .filter(function(r){ return r.date; }).sort(function(a,b){ return a.date < b.date ? -1 : 1; });
      var summary = summaryBlock ? mapRow(summaryBlock.header, summaryBlock.rows[0], TRAFFIC_MAP, TRAFFIC_CONV) : null;
      sources[key] = { label: TRAFFIC_SOURCE_LABEL[key] || sheet.name, summary: summary, daily: daily };
      any = true;
    });
    if(!any) return { ok: false, error: 'Blok data harian tidak ditemukan pada Tinjauan Traffic.' };
    return { ok: true, type: 'traffic', label: 'Tinjauan Traffic', sources: sources };
  }

  /* ================= Performa Chat (Chat Performance) ================= */
  var CHAT_MAP = {
    'Periode Waktu': 'periodLabel', 'Tanggal': 'date', 'Pengunjung': 'visitors', 'Jumlah Chat': 'chatCount',
    'Pengunjung Bertanya': 'visitorsAsking', 'Pertanyaan Diajukan': 'askRate', 'Chat Dibalas': 'chatReplied',
    'Chat Belum Dibalas': 'chatUnreplied', 'Waktu Respon Rata-rata': 'avgResponseTime', 'CSAT %': 'csat',
    'Waktu Respon Chat Pertama Kali': 'firstResponseTime', 'Persentase Chat Dibalas': 'replyRate',
    'Tingkat Konversi (Jumlah Chat yang Direspon)': 'convReplied', 'Total Pembeli': 'buyers', 'Total Pesanan': 'orders',
    'Produk': 'products', 'Penjualan (IDR)': 'sales', 'Tingkat Konversi (Chat Dibalas)': 'convChatReplied'
  };
  var CHAT_NUM = ['visitors','chatCount','visitorsAsking','chatReplied','chatUnreplied','buyers','orders','products','sales'];
  var CHAT_PCT = ['askRate','csat','replyRate','convReplied','convChatReplied'];
  var CHAT_CONV = convertersFor(CHAT_NUM, CHAT_PCT, 'date');
  CHAT_CONV.avgResponseTime = durationToSeconds;
  CHAT_CONV.firstResponseTime = durationToSeconds;
  CHAT_CONV.periodLabel = function(v){ return s(v); };

  var CSAT_MAP = {
    'Periode Waktu': 'periodLabel', 'CSAT %': 'csat', 'Penilaian Baik': 'good', 'Penilaian Cukup': 'fair',
    'Penilaian Buruk': 'poor', 'Tidak ada alasan dipilih': 'reasonNone', 'Respon terlalu lama': 'reasonSlow',
    'Masalah tidak selesai': 'reasonUnresolved', 'Tidak sopan': 'reasonRude', 'Lainnya': 'reasonOther'
  };
  var CSAT_CONV = convertersFor(['good','fair','poor','reasonNone','reasonSlow','reasonUnresolved','reasonRude','reasonOther'], ['csat']);

  function parseChatPerformance(sheets){
    var out = { ok: true, type: 'chat', label: 'Performa Chat', summary: null, daily: [], csat: null, unreplied: null, senders: null };
    var found = false;
    sheets.forEach(function(sheet){
      var name = sheet.name;
      var blocks = sheetToBlocks(sheet.aoa);
      if(/^Kriteria Utama/i.test(name)){
        var b1 = blocks[0];
        if(b1 && b1.rows.length){ out.summary = mapRow(b1.header, b1.rows[0], CHAT_MAP, CHAT_CONV); found = true; }
      } else if(/^Grafik Kriteria/i.test(name)){
        var b2 = blocks.filter(function(b){ return b.kind === 'series'; })[0];
        if(b2){ out.daily = b2.rows.map(function(r){ return mapRow(b2.header, r, CHAT_MAP, CHAT_CONV); }).filter(function(r){ return r.date; })
          .sort(function(a,b){ return a.date < b.date ? -1 : 1; }); found = true; }
      } else if(/^Rincian CSAT/i.test(name)){
        var b3 = blocks[0];
        if(b3 && b3.rows.length){ out.csat = mapRow(b3.header, b3.rows[0], CSAT_MAP, CSAT_CONV); found = true; }
      } else if(/^Rincian Chat/i.test(name)){
        var b4 = blocks[0];
        if(b4){ out.unreplied = rawTable(b4.header, b4.rows); found = true; }
      } else if(/^Pesan/i.test(name)){
        var b5 = blocks[0];
        if(b5){ out.senders = rawTable(b5.header, b5.rows); found = true; }
      }
    });
    if(!found) return { ok: false, error: 'Tidak ada sheet Performa Chat yang dikenali (Kriteria Utama / Grafik Kriteria / Rincian CSAT / Rincian Chat / Pesan).' };
    return out;
  }

  /* ================= Statistik Toko (Shop Stats, bulanan) ================= */
  var SHOPSTATS_MAP = {
    'Tanggal': 'date', 'Total Penjualan (IDR)': 'sales', 'Total Pesanan': 'orders', 'Penjualan per Pesanan': 'salesPerOrder',
    'Produk Diklik': 'productsClicked', 'Total Pengunjung': 'visitors', 'Tingkat Konversi Pesanan': 'convRate',
    'Pesanan Dibatalkan': 'ordersCancelled', 'Penjualan Dibatalkan': 'salesCancelled',
    'Pesanan Dikembalikan': 'ordersReturned', 'Penjualan Dikembalikan': 'salesReturned'
  };
  var SHOPSTATS_NUM = ['sales','orders','salesPerOrder','productsClicked','visitors','ordersCancelled','salesCancelled','ordersReturned','salesReturned'];
  var SHOPSTATS_CONV = convertersFor(SHOPSTATS_NUM, ['convRate'], 'date');

  var SHOPSTATS_STAGE_LABEL = { dibuat: 'Pesanan Dibuat', siapDikirim: 'Pesanan Siap Dikirim', dibayar: 'Pesanan Dibayar' };
  function shopstatsStageKey(sheetName){
    var n = sheetName.toLowerCase();
    if(n.indexOf('siap') !== -1) return 'siapDikirim';
    if(n.indexOf('dibayar') !== -1) return 'dibayar';
    return 'dibuat';
  }
  function parseShopStats(sheets){
    var stages = {};
    var any = false;
    sheets.forEach(function(sheet){
      var blocks = sheetToBlocks(sheet.aoa);
      var summaryBlock = blocks.filter(function(b){ return b.kind === 'summary'; })[0];
      var monthlyBlock = blocks.filter(function(b){ return b.kind === 'series'; })[0];
      if(!monthlyBlock) return;
      var key = shopstatsStageKey(sheet.name);
      var monthly = monthlyBlock.rows.map(function(r){ return mapRow(monthlyBlock.header, r, SHOPSTATS_MAP, SHOPSTATS_CONV); })
        .filter(function(r){ return r.date; }).sort(function(a,b){ return a.date < b.date ? -1 : 1; });
      var summary = summaryBlock ? mapRow(summaryBlock.header, summaryBlock.rows[0], SHOPSTATS_MAP, SHOPSTATS_CONV) : null;
      stages[key] = { label: SHOPSTATS_STAGE_LABEL[key] || sheet.name, summary: summary, monthly: monthly };
      any = true;
    });
    if(!any) return { ok: false, error: 'Blok data bulanan tidak ditemukan pada Statistik Toko.' };
    return { ok: true, type: 'shopstats', label: 'Statistik Toko', stages: stages };
  }

  /* ================= Deteksi jenis berkas & titik masuk ================= */
  function allHeaders(sheets){
    var h = [];
    sheets.forEach(function(sheet){
      sheetToBlocks(sheet.aoa).forEach(function(b){ h.push(b.header); });
    });
    return h;
  }
  function anyHeaderHas(headers, needle){ return headers.some(function(h){ return headerHas(h, needle); }); }

  function detectType(sheets){
    var headers = allHeaders(sheets);
    var names = sheets.map(function(sh){ return sh.name; });
    if(anyHeaderHas(headers, 'Pesanan Dibatalkan') && anyHeaderHas(headers, 'Pesanan Dikembalikan')) return 'shopstats';
    if(anyHeaderHas(headers, 'CSAT %') || anyHeaderHas(headers, 'Sesi Obrolan') || anyHeaderHas(headers, 'Pesan Belum Dibalas') || names.some(function(n){ return /^Kriteria Utama|^Grafik Kriteria/i.test(n); })) return 'chat';
    if(anyHeaderHas(headers, 'Rata-rata Waktu Dihabiskan') && anyHeaderHas(headers, 'Pengunjung Baru')) return 'traffic';
    if(anyHeaderHas(headers, 'Halaman Produk Dilihat') && anyHeaderHas(headers, 'Suka')) return 'product';
    if(anyHeaderHas(headers, 'Penjualan (Pesanan Dibuat) (IDR)') && anyHeaderHas(headers, 'Penjualan (Pesanan Siap Dikirim) (IDR)')) return 'sales';
    return null;
  }

  // sheets: [{name, aoa}] — aoa = array-of-arrays persis dari XLSX.utils.sheet_to_json(ws,{header:1,defval:''})
  function parseWorkbook(fileName, sheets){
    var type = detectType(sheets);
    if(!type){
      var cols = allHeaders(sheets).map(function(h){ return h.filter(Boolean).slice(0, 4).join(', '); }).filter(Boolean);
      return { ok: false, fileName: fileName, error: 'Jenis laporan Shopee pada "' + fileName + '" tidak dikenali. Kolom yang ditemukan: ' + (cols[0] || '(tidak ada)') + '. Pastikan berkas adalah ekspor Shopee Seller Centre (Tinjauan Penjualan, Tinjauan Produk, Tinjauan Traffic, Performa Chat, atau Statistik Toko).' };
    }
    var result;
    if(type === 'sales') result = parseSalesOverview(sheets);
    else if(type === 'product') result = parseProductOverview(sheets);
    else if(type === 'traffic') result = parseTrafficOverview(sheets);
    else if(type === 'chat') result = parseChatPerformance(sheets);
    else result = parseShopStats(sheets);
    if(!result.ok) return { ok: false, fileName: fileName, error: result.error };
    result.fileName = fileName;
    return result;
  }

  return {
    num: num, pct: pct, durationToSeconds: durationToSeconds, shopeeDateToKey: shopeeDateToKey,
    shopeeDateTimeToLabel: shopeeDateTimeToLabel, isDateStr: isDateStr, isRangeStr: isRangeStr,
    sheetToBlocks: sheetToBlocks, parseWorkbook: parseWorkbook, detectType: detectType
  };
})();
