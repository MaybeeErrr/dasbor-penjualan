"use strict";

/* ---------------- Unduh laporan platform (PDF) ----------------
   Menyusun satu berkas PDF bertema dari laporan yang sedang dimuat pada menu "Laporan Platform":
   sampul, ringkasan eksekutif, lalu satu bagian per jenis laporan (KPI, grafik, corong, tabel).
   - Angka KPI, corong, narasi, dan tabel DIAMBIL dari tampilan yang sudah dirender (sumber yang sama
     dengan layar), jadi isi PDF selalu identik dengan yang terlihat di dasbor.
   - Grafik digambar ulang di kanvas tersembunyi dengan palet terang, supaya hasil cetak tetap jelas
     walau dasbor sedang dalam mode gelap, dan tidak bergantung pada tab yang sedang terbuka.
   - jsPDF + AutoTable dimuat dari cdnjs hanya saat tombol ditekan (memakai pemuat milik NetIncomeExport). */
var ReportExport = (function(){
  var TITLE = 'Laporan Performa Penjualan';
  var C = {
    dark: [18, 48, 36], brand: [47, 111, 78], mid: [96, 160, 124], tint: [232, 240, 235], paper: [247, 250, 248],
    ink: [22, 36, 29], muted: [92, 111, 100], line: [218, 228, 220],
    blue: [46, 106, 168], amber: [201, 138, 34], brick: [176, 71, 59], white: [255, 255, 255]
  };
  var HEX = { brand: '#2F6F4E', blue: '#2E6AA8', amber: '#C98A22', brick: '#B0473B', mid: '#60A07C' };
  var MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

  /* ---------- Util teks ---------- */
  // Font bawaan PDF hanya Latin-1: petakan tanda baca umum dulu, sisanya (emoji dll) dibuang.
  function txt(v){
    return String(v == null ? '' : v)
      .replace(/[\u2013\u2014]/g, '-').replace(/\u2192/g, '>').replace(/\u2026/g, '...')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/[^\u0020-\u00FF]/g, '').replace(/\s+/g, ' ').trim();
  }
  function nodeText(n){ return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function pad(n){ return String(n).padStart(2, '0'); }
  function longDate(key){
    var p = String(key).split('-');
    return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }
  function stamp(d){ return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + '.' + pad(d.getMinutes()); }
  function compact(n){
    var a = Math.abs(n);
    if(a >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' M';
    if(a >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' jt';
    if(a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.0', '') + ' rb';
    return String(Math.round(n * 10) / 10);
  }
  function rgba(hex, a){
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------- Ambil data dari tampilan yang sudah dirender ---------- */
  function scrapeCards(id){
    var el = document.getElementById(id);
    if(!el) return [];
    return Array.prototype.map.call(el.querySelectorAll('.kpi-card'), function(c){
      return { label: nodeText(c.querySelector('.kpi-label')), value: nodeText(c.querySelector('.kpi-value')), delta: nodeText(c.querySelector('.kpi-delta')) };
    });
  }
  function scrapeFunnel(id){
    var el = document.getElementById(id);
    if(!el) return [];
    return Array.prototype.map.call(el.querySelectorAll('.funnel-row'), function(r){
      var lab = r.querySelector('.funnel-label'), bar = r.querySelector('.funnel-bar');
      var tone = !bar ? 'brand' : /src-situs/.test(bar.className) ? 'blue' : /src-aplikasi/.test(bar.className) ? 'amber' : 'brand';
      return {
        label: lab && lab.firstChild ? lab.firstChild.textContent.trim() : '', sub: nodeText(lab && lab.querySelector('.funnel-sub')),
        value: nodeText(bar), width: parseFloat((bar && bar.style.width) || '0') || 0, pct: nodeText(r.querySelector('.funnel-pct')), tone: tone
      };
    });
  }
  function scrapeTable(id){
    var el = document.getElementById(id), tb = el && el.querySelector('table');
    if(!tb) return null;
    return {
      head: Array.prototype.map.call(tb.querySelectorAll('thead th'), nodeText),
      rows: Array.prototype.map.call(tb.querySelectorAll('tbody tr'), function(tr){ return Array.prototype.map.call(tr.children, nodeText); })
    };
  }
  function scrapeChips(){
    var el = document.getElementById('shopeeStatusChips');
    if(!el) return [];
    return Array.prototype.map.call(el.querySelectorAll('.shopee-status-chip.on'), function(c){
      return { label: c.firstChild && c.childNodes[1] ? c.childNodes[1].textContent.trim() : '', range: nodeText(c.querySelector('.range')) };
    });
  }
  function scrapeNarrative(){
    var el = document.getElementById('shopeeRingkasanWrap');
    return el ? Array.prototype.map.call(el.querySelectorAll('p'), nodeText).filter(Boolean) : [];
  }

  /* ---------- Grafik -> gambar (kanvas tersembunyi, palet terang) ---------- */
  function chartImage(type, labels, series, o){
    if(typeof Chart === 'undefined') throw new Error('Pustaka grafik belum termuat. Muat ulang halaman lalu coba lagi.');
    o = o || {};
    var W = 1040, H = o.h || 420;
    var holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + W + 'px;height:' + H + 'px;';
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    holder.appendChild(canvas); document.body.appendChild(holder);
    var pal = [HEX.brand, HEX.blue, HEX.amber, HEX.brick];
    var chart = null;
    try {
      chart = new Chart(canvas.getContext('2d'), {
        type: type,
        data: {
          labels: labels,
          datasets: series.map(function(s, i){
            var col = s.color || pal[i % pal.length], bar = (s.type || type) === 'bar';
            return {
              label: s.name, data: s.values, type: s.type || type, borderColor: col,
              backgroundColor: bar ? col : (s.fill ? rgba(col, 0.14) : col), fill: !!s.fill, tension: 0.3,
              pointRadius: 0, borderWidth: bar ? 0 : 4, borderRadius: bar ? 5 : 0, maxBarThickness: 38,
              yAxisID: s.axis || 'y', order: i
            };
          })
        },
        options: {
          responsive: false, animation: false, devicePixelRatio: 2, interaction: { mode: 'index', intersect: false },
          layout: { padding: { left: 6, right: 10, top: 6, bottom: 2 } },
          plugins: {
            legend: { display: series.length > 1, position: 'bottom', labels: { color: '#5C6F64', boxWidth: 22, boxHeight: 12, padding: 18, font: { size: 20 } } },
            tooltip: { enabled: false }
          },
          scales: Object.assign({
            x: { stacked: !!o.stacked, grid: { display: false }, ticks: { color: '#5C6F64', font: { size: 18 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
            y: { stacked: !!o.stacked, beginAtZero: true, grid: { color: '#E1E9E2' }, border: { display: false }, ticks: { color: '#5C6F64', font: { size: 18 }, callback: function(v){ return compact(v); } } }
          }, o.y2 ? { y2: { position: 'right', beginAtZero: true, grid: { display: false }, border: { display: false }, ticks: { color: '#5C6F64', font: { size: 18 }, callback: function(v){ return (o.y2Fmt || compact)(v); } } } } : {})
        },
        plugins: [{ id: 'rpBg', beforeDraw: function(c){ c.ctx.save(); c.ctx.fillStyle = '#FFFFFF'; c.ctx.fillRect(0, 0, c.width, c.height); c.ctx.restore(); } }]
      });
      return { url: canvas.toDataURL('image/png'), w: W, h: H };
    } finally {
      if(chart) chart.destroy();
      document.body.removeChild(holder);
    }
  }
  function dayLabels(rows){ return rows.map(function(r){ return fmtDayShort(r.date); }); }
  function monthLabels(rows){ return rows.map(function(r){ return fmtDayShort(r.date).replace(/^\d+\s/, ''); }); }
  function secLabel(v){ return fmtDuration(v); }

  /* ---------- Pembangun dokumen ---------- */
  function build(){
    var sh = state.shopee, J = window.jspdf.jsPDF;
    var doc = new J({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var M = 42, CW = W - M * 2, BAND = 84, FOOT = 50, y = 0;
    var now = new Date();

    function fill(c){ doc.setFillColor(c[0], c[1], c[2]); }
    function draw(c){ doc.setDrawColor(c[0], c[1], c[2]); }
    function color(c){ doc.setTextColor(c[0], c[1], c[2]); }
    function font(style, size){ doc.setFont('helvetica', style); doc.setFontSize(size); }
    function alpha(a){ doc.setGState(new doc.GState({ opacity: a })); }
    function diamond(cx, cy, r, c, a){
      alpha(a); fill(c);
      doc.lines([[r, r], [-r, r], [-r, -r], [r, -r]], cx, cy - r, [1, 1], 'F', true);
      alpha(1);
    }
    function fitText(s, maxW, size, min){
      font('bold', size);
      while(size > min && doc.getTextWidth(s) > maxW){ size -= 0.5; doc.setFontSize(size); }
      return size;
    }

    // Periode laporan (dari data harian; cadangan: data bulanan)
    var keys = [];
    [sh.sales && sh.sales.daily, sh.product && sh.product.daily, sh.traffic && sh.traffic.sources.semua && sh.traffic.sources.semua.daily, sh.chat && sh.chat.daily]
      .forEach(function(a){ (a || []).forEach(function(r){ if(r.date) keys.push(r.date); }); });
    if(!keys.length && sh.shopstats && sh.shopstats.stages.dibuat) sh.shopstats.stages.dibuat.monthly.forEach(function(r){ keys.push(r.date); });
    keys.sort();
    var from = keys[0], to = keys[keys.length - 1];
    var periodTxt = from ? (from === to ? longDate(from) : longDate(from) + ' - ' + longDate(to)) : 'Periode tidak tersedia';

    /* --- komponen --- */
    function contStrip(){ fill(C.brand); doc.rect(0, 0, W, 5, 'F'); }
    function ensure(h){
      if(y + h > H - FOOT){ doc.addPage(); contStrip(); y = 44; }
    }
    function sectionPage(num, title, desc){
      doc.addPage();
      fill(C.dark); doc.rect(0, 0, W, BAND, 'F');
      diamond(W - 70, 38, 62, C.brand, 0.55); diamond(W - 140, 70, 30, C.mid, 0.35);
      fill(C.amber); doc.rect(M, 26, 22, 3, 'F');
      font('bold', 8.5); color(C.amber); doc.text(pad(num), M + 30, 30.5);
      font('bold', 21); color(C.white); doc.text(txt(title), M, 56);
      font('normal', 9); alpha(0.8); doc.text(txt(desc), M, 72); alpha(1);
      y = BAND + 24;
    }
    function heading(title, desc){
      ensure(desc ? 38 : 24);
      diamond(M + 4, y + 5, 4, C.brand, 1);
      font('bold', 11); color(C.ink); doc.text(txt(title), M + 15, y + 9);
      if(desc){ font('normal', 8.5); color(C.muted); doc.text(txt(desc), M + 15, y + 22); }
      y += desc ? 36 : 24;
    }
    function drawCard(c, x, cy, w, h, accent, big){
      fill(C.line); doc.roundedRect(x, cy + 1.5, w, h, 6, 6, 'F');           // bayangan tipis
      fill(C.white); draw(C.line); doc.setLineWidth(0.6); doc.roundedRect(x, cy, w, h, 6, 6, 'FD');
      fill(accent); doc.roundedRect(x, cy, 4, h, 2, 2, 'F');
      font('normal', big ? 8.5 : 7.5); color(C.muted);
      doc.text(doc.splitTextToSize(txt(c.label), w - 24).slice(0, 2), x + 14, cy + (big ? 17 : 14));
      var vs = fitText(txt(c.value), w - 24, big ? 17 : 14, 8.5);
      color(C.ink); doc.setFontSize(vs); doc.text(txt(c.value), x + 14, cy + (big ? 42 : 36));
      if(c.delta){
        font('normal', big ? 8 : 7.2); color(C.muted);
        doc.text(doc.splitTextToSize(txt(c.delta), w - 24).slice(0, 2), x + 14, cy + (big ? 57 : 49));
      }
    }
    function cardsRow(cards){
      if(!cards.length) return;
      var accents = [C.brand, C.blue, C.amber, C.brick];
      for(var i = 0; i < cards.length; i += 4){
        var chunk = cards.slice(i, i + 4), gap = 10, k = chunk.length, cw = (CW - gap * (k - 1)) / k, ch = 66;
        ensure(ch + 14);
        chunk.forEach(function(c, j){ drawCard(c, M + j * (cw + gap), y, cw, ch, accents[(i + j) % 4], false); });
        y += ch + 14;
      }
    }
    function chartBlock(title, desc, img){
      var h = CW * img.h / img.w;
      ensure(h + 44);
      heading(title, desc);
      draw(C.line); doc.setLineWidth(0.6); doc.roundedRect(M, y - 2, CW, h + 4, 6, 6, 'S');
      doc.addImage(img.url, 'PNG', M + 2, y, CW - 4, h - 0.5, undefined, 'FAST');
      y += h + 18;
    }
    function funnelBlock(title, desc, rows){
      if(!rows.length) return;
      heading(title, desc);
      var shades = [C.brand, [64, 134, 96], C.mid, [140, 186, 160]];
      var LAB = 150, PCT = 92, trackX = M + LAB, trackW = CW - LAB - PCT;
      rows.forEach(function(r, i){
        font('normal', 7.5);
        var subLines = r.sub ? doc.splitTextToSize(txt(r.sub), LAB - 12).slice(0, 2) : [];
        var rh = Math.max(34, 24 + subLines.length * 9);
        ensure(rh + 4);
        font('bold', 8.8); color(C.ink); doc.text(txt(r.label), M, y + 12);
        if(subLines.length){ font('normal', 7.5); color(C.muted); doc.text(subLines, M, y + 22, { lineHeightFactor: 1.15 }); }
        fill(C.tint); doc.roundedRect(trackX, y + 3, trackW, 22, 4, 4, 'F');
        var bw = Math.max(26, trackW * r.width / 100);
        fill(r.tone === 'blue' ? C.blue : r.tone === 'amber' ? C.amber : shades[Math.min(i, 3)]);
        doc.roundedRect(trackX, y + 3, bw, 22, 4, 4, 'F');
        font('bold', 9); color(r.tone === 'amber' ? C.ink : C.white);
        doc.text(txt(r.value), trackX + bw - 8, y + 17.5, { align: 'right' });
        if(r.pct){ font('normal', 7.5); color(C.muted); doc.text(txt(r.pct.replace('dari tahap sebelumnya', 'dari sebelumnya')), M + CW, y + 17, { align: 'right' }); }
        y += rh;
      });
      y += 10;
    }
    function tableBlock(title, desc, tbl, maxRows, maxCols){
      if(!tbl || !tbl.rows.length) return;
      var rows = tbl.rows.slice(0, maxRows || 30), cols = maxCols || tbl.head.length;
      heading(title, desc + (rows.length < tbl.rows.length ? ' (menampilkan ' + rows.length + ' dari ' + tbl.rows.length + ')' : ''));
      var startPage = doc.getNumberOfPages();
      doc.autoTable({
        startY: y, margin: { left: M, right: M, top: 44, bottom: FOOT },
        head: [tbl.head.slice(0, cols).map(txt)], body: rows.map(function(r){ return r.slice(0, cols).map(txt); }),
        styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 4, overflow: 'linebreak', textColor: C.ink, lineColor: C.line, lineWidth: 0.4 },
        headStyles: { fillColor: C.brand, textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: C.paper },
        didDrawPage: function(d){ if(d.pageNumber > startPage) contStrip(); }
      });
      y = doc.lastAutoTable.finalY + 18;
    }

    /* --- 1. Sampul --- */
    fill(C.dark); doc.rect(0, 0, W, 392, 'F');
    diamond(W - 40, 120, 190, C.brand, 0.5); diamond(W - 150, 330, 86, C.mid, 0.28);
    diamond(M + 7, 64, 7, C.amber, 1);
    font('bold', 9); color(C.amber); doc.text('L A P O R A N   P L A T F O R M', M + 24, 67);
    font('bold', 38); color(C.white);
    var tl = doc.splitTextToSize(TITLE, CW - 80);
    doc.text(tl, M, 150);
    var ty = 150 + tl.length * 42;
    fill(C.amber); doc.rect(M, ty - 16, 54, 3.5, 'F');
    font('normal', 12.5); color(C.white); alpha(0.9); doc.text(from ? 'Periode  ' + periodTxt : periodTxt, M, ty + 14); alpha(1);
    var chips = scrapeChips();
    font('normal', 9.5); alpha(0.7); doc.text('Disusun otomatis dari ' + chips.length + ' jenis laporan', M, ty + 34); alpha(1);

    var topCards = scrapeCards('shopeeRingkasanCards').slice(0, 4);
    var cw2 = (CW - 12) / 2, ch2 = 76, cy0 = 338;
    var ac = [C.brand, C.blue, C.amber, C.brick];
    topCards.forEach(function(c, i){ drawCard(c, M + (i % 2) * (cw2 + 12), cy0 + Math.floor(i / 2) * (ch2 + 12), cw2, ch2, ac[i], true); });
    var ly = cy0 + Math.ceil(topCards.length / 2) * (ch2 + 12) + 34;
    font('bold', 11); color(C.ink); doc.text('Isi laporan', M, ly);
    ly += 12;
    chips.forEach(function(c){
      fill(C.tint); doc.roundedRect(M, ly, CW, 28, 5, 5, 'F');
      diamond(M + 16, ly + 14, 4.5, C.brand, 1);
      font('bold', 9.5); color(C.ink); doc.text(txt(c.label), M + 30, ly + 17.5);
      font('normal', 8.5); color(C.muted); doc.text(txt(c.range), M + CW - 12, ly + 17.5, { align: 'right' });
      ly += 34;
    });
    font('normal', 8); color(C.muted); doc.text('Dibuat pada ' + stamp(now), M, H - 30);

    /* --- 2. Ringkasan eksekutif --- */
    var n = 1;
    sectionPage(n++, 'Ringkasan Eksekutif', 'Angka utama dan narasi otomatis dari seluruh laporan yang diunggah');
    cardsRow(scrapeCards('shopeeRingkasanCards'));
    var paras = scrapeNarrative();
    if(paras.length){
      heading('Narasi otomatis', 'Disusun langsung dari angka pada laporan');
      paras.forEach(function(p, i){
        font('normal', 9.6);
        var lines = doc.splitTextToSize(txt(p), CW - 34), h = lines.length * 13.2 + 20;
        ensure(h + 10);
        fill(C.paper); doc.roundedRect(M, y, CW, h, 6, 6, 'F');
        fill([C.brand, C.blue, C.amber, C.brick][i % 4]); doc.roundedRect(M, y, 4, h, 2, 2, 'F');
        color(C.ink); font('normal', 9.6); doc.text(lines, M + 18, y + 18, { lineHeightFactor: 1.35 });
        y += h + 10;
      });
    }

    /* --- 3. Penjualan --- */
    if(sh.sales){
      var d = sh.sales;
      sectionPage(n++, 'Penjualan', 'Kunjungan, pembeli, dan penjualan dari Tinjauan Penjualan');
      cardsRow(scrapeCards('shopeeSalesCards'));
      chartBlock('Tren harian', 'Pengunjung, pembeli, dan penjualan (Pesanan Dibuat) per hari', chartImage('line', dayLabels(d.daily), [
        { name: 'Pengunjung', values: d.daily.map(function(r){ return r.visitors; }) },
        { name: 'Pembeli (Dibuat)', values: d.daily.map(function(r){ return r.buyersCreated; }) },
        { name: 'Penjualan (Rp)', values: d.daily.map(function(r){ return r.salesCreated; }), axis: 'y2', fill: true }
      ], { y2: true, y2Fmt: function(v){ return 'Rp' + compact(v); } }));
      funnelBlock('Corong pesanan', 'Dibuat > Siap Dikirim: jumlah pembeli dan total penjualan tiap tahap', scrapeFunnel('shopeeSalesFunnel'));
    }

    /* --- 4. Produk & Funnel --- */
    if(sh.product && sh.product.daily.length){
      var pr = sh.product.daily;
      sectionPage(n++, 'Produk & Funnel', 'Dari pengunjung produk sampai pesanan, dari Tinjauan Produk');
      cardsRow(scrapeCards('shopeeProductCards'));
      funnelBlock('Corong produk', 'Pengunjung produk > keranjang > pesanan, dijumlahkan sepanjang periode', scrapeFunnel('shopeeProductFunnel'));
      chartBlock('Tren harian', 'Halaman dilihat, ditambahkan ke keranjang, dan pembeli per hari', chartImage('line', dayLabels(pr), [
        { name: 'Halaman Dilihat', values: pr.map(function(r){ return r.pageViews; }) },
        { name: 'Ditambahkan ke Keranjang', values: pr.map(function(r){ return r.cartProducts; }) },
        { name: 'Pembeli (Dibuat)', values: pr.map(function(r){ return r.buyersCreated; }) }
      ]));
    }

    /* --- 5. Traffic --- */
    if(sh.traffic && sh.traffic.sources.semua){
      var tr = sh.traffic.sources.semua.daily;
      sectionPage(n++, 'Traffic', 'Pengunjung baru dan lama serta perbandingan sumber, dari Tinjauan Traffic');
      cardsRow(scrapeCards('shopeeTrafficCards'));
      chartBlock('Pengunjung baru vs lama', 'Sumber "Semua", per hari', chartImage('bar', dayLabels(tr), [
        { name: 'Pengunjung Baru', values: tr.map(function(r){ return r.newVisitors; }) },
        { name: 'Pengunjung Lama', values: tr.map(function(r){ return r.oldVisitors; }), color: HEX.blue }
      ], { stacked: true }));
      funnelBlock('Perbandingan sumber traffic', 'Situs vs Aplikasi, dijumlahkan sepanjang periode', scrapeFunnel('shopeeTrafficSources'));
    }

    /* --- 6. Chat & Layanan --- */
    if(sh.chat){
      sectionPage(n++, 'Chat & Layanan', 'Volume chat, kecepatan respon, dan chat yang perlu ditindaklanjuti');
      cardsRow(scrapeCards('shopeeChatCards'));
      if(sh.chat.daily.length){
        chartBlock('Tren harian', 'Jumlah chat dan waktu respon rata-rata per hari', chartImage('bar', dayLabels(sh.chat.daily), [
          { name: 'Jumlah Chat', values: sh.chat.daily.map(function(r){ return r.chatCount; }) },
          { name: 'Waktu Respon', values: sh.chat.daily.map(function(r){ return r.avgResponseTime; }), type: 'line', axis: 'y2', color: HEX.amber }
        ], { y2: true, y2Fmt: secLabel }));
      }
      tableBlock('Chat yang perlu direspon', 'Chat masuk yang belum dibalas', scrapeTable('shopeeChatUnreplied'), 20, 6);
      tableBlock('Riwayat percakapan per pengirim', 'Daftar pengirim pada periode ini', scrapeTable('shopeeChatSenders'), 20, 6);
    }

    /* --- 7. Performa bulanan --- */
    if(sh.shopstats && sh.shopstats.stages.dibuat){
      var st = sh.shopstats.stages, created = st.dibuat.monthly;
      var byKey = function(arr){ var m = {}; (arr || []).forEach(function(r){ m[r.date] = r.orders; }); return created.map(function(r){ return m[r.date] === undefined ? 0 : m[r.date]; }); };
      sectionPage(n++, 'Performa Bulanan', 'Pesanan dibuat, siap dikirim, dibayar, dan dibatalkan tiap bulan');
      cardsRow(scrapeCards('shopeeStatsCards'));
      chartBlock('Corong pesanan per bulan', 'Dibuat > Siap Dikirim > Dibayar', chartImage('bar', monthLabels(created), [
        { name: 'Pesanan Dibuat', values: created.map(function(r){ return r.orders; }) },
        { name: 'Pesanan Siap Dikirim', values: byKey(st.siapDikirim && st.siapDikirim.monthly), color: HEX.blue },
        { name: 'Pesanan Dibayar', values: byKey(st.dibayar && st.dibayar.monthly), color: HEX.amber }
      ]));
      funnelBlock('Total tiap tahap', 'Dijumlahkan sepanjang seluruh bulan yang tersedia', scrapeFunnel('shopeeStatsFunnel'));
      tableBlock('Rincian bulanan', 'Pesanan dibuat, penjualan, dan tingkat pembatalan tiap bulan', scrapeTable('shopeeStatsTable'), 24);
    }

    /* --- Footer semua halaman (kecuali sampul) --- */
    var pages = doc.getNumberOfPages();
    for(var i = 2; i <= pages; i++){
      doc.setPage(i);
      draw(C.line); doc.setLineWidth(0.6); doc.line(M, H - 32, W - M, H - 32);
      font('normal', 7.8); color(C.muted);
      doc.text(txt(TITLE + '  |  ' + periodTxt), M, H - 19);
      doc.text('Halaman ' + i + ' / ' + pages, W - M, H - 19, { align: 'right' });
    }
    doc.setProperties({ title: TITLE + ' ' + periodTxt, subject: periodTxt, creator: 'Dasbor Analitik Penjualan' });
    var fname = 'laporan-performa_' + (from ? from + '_' + to : now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())) + '.pdf';
    return { doc: doc, name: fname };
  }

  function hasData(){
    var sh = state.shopee;
    return !!(sh && (sh.sales || sh.product || sh.traffic || sh.chat || sh.shopstats));
  }
  function generate(){
    if(!hasData()) return Promise.reject(new Error('Belum ada laporan yang diunggah.'));
    return NetIncomeExport.ensurePdfLibs().then(function(){
      var out = build();
      out.doc.save(out.name);
      return out.name;
    });
  }

  /* ---------- Tombol ---------- */
  var btn = document.getElementById('btnReportDownload');
  if(btn){
    var idleHtml = btn.innerHTML;
    btn.addEventListener('click', function(){
      if(btn.disabled || btn.classList.contains('busy')) return;
      btn.classList.add('busy'); btn.lastChild.textContent = ' Menyiapkan PDF…';
      if(typeof shopeeClearError === 'function') shopeeClearError();
      generate().catch(function(err){
        if(typeof shopeeShowError === 'function') shopeeShowError(err && err.message ? err.message : 'Gagal membuat PDF.');
      }).then(function(){ btn.classList.remove('busy'); btn.innerHTML = idleHtml; });
    });
  }

  return { generate: generate, hasData: hasData, _build: build };
})();
