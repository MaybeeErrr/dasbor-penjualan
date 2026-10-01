"use strict";

/* ---------------- PdfReport: pembangun laporan PDF A4 (portrait) untuk semua menu ----------------
   Grafik digambar langsung sebagai vektor (bukan screenshot canvas), sehingga selalu tajam dan
   berpalet terang walau dasbor sedang mode gelap. jsPDF + AutoTable dimuat dari cdnjs saat pertama
   kali dipakai (lewat NetIncomeExport.ensurePdfLibs).
   Pemakaian:
     PdfReport.build({ title, subtitle, dataset, filter }, function(r){
       r.headline('teks'); r.kpis([{label,value,note}]); r.section('Judul','deskripsi');
       r.hbars({items:[{name,v,sub}], fmt:fn, color:[r,g,b]}); r.vbars({labels,values,fmt,highlight});
       r.lines({labels, series:[{name,values,color,dashed,band:{lo:[],hi:[]}}], fmt});
       r.table({head:[], body:[[]], align:[...]}); r.notes([...]);
     }, 'nama-berkas').then(function(name){ ... }); */
var PdfReport = (function(){
  var GREEN = [47, 111, 78], AMBER = [201, 138, 34], BLUE = [46, 106, 168], BRICK = [176, 71, 59];
  var INK = [22, 36, 29], MUTED = [92, 111, 100], LINE = [220, 230, 221], SOFT = [243, 247, 243];
  var M = 36;

  // Font bawaan PDF hanya Latin-1: ubah tanda baca umum dulu supaya tidak hilang, sisanya dibuang.
  function txt(s){
    s = String(s == null ? '' : s).replace(/[\u2013\u2014\u2212]/g, '-').replace(/\u2026/g, '...').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u25B2\u25BC\u25AC]/g, '').replace(/\u2192/g, '->').replace(/\u2265/g, '>=').replace(/\u2264/g, '<=').replace(/\u00F7/g, '/');
    return NetIncomeExport.pdfText(s);
  }
  function stripHtml(s){ var d = document.createElement('div'); d.innerHTML = String(s == null ? '' : s); return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
  function pad(n){ return String(n).padStart(2, '0'); }
  function stamp(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function slug(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'dataset'; }
  function nowLong(d){
    var mo = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return d.getDate() + ' ' + mo[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + '.' + pad(d.getMinutes());
  }
  function fit(doc, s, w){
    s = txt(s);
    if(doc.getTextWidth(s) <= w) return s;
    while(s.length > 1 && doc.getTextWidth(s + '...') > w) s = s.slice(0, -1);
    return s.trim() + '...';
  }

  function Builder(doc, meta){
    this.doc = doc; this.meta = meta;
    this.W = doc.internal.pageSize.getWidth();
    this.H = doc.internal.pageSize.getHeight();
    this.CW = this.W - M * 2;
    this.y = 0;
  }
  var P = Builder.prototype;

  P.space = function(h){
    if(this.y + h > this.H - 46){ this.doc.addPage(); this.y = 44; }
  };

  P.cover = function(){
    var d = this.doc, m = this.meta;
    d.setFillColor(GREEN[0], GREEN[1], GREEN[2]); d.rect(0, 0, this.W, 104, 'F');
    d.setFillColor(AMBER[0], AMBER[1], AMBER[2]); d.rect(0, 104, this.W, 4, 'F');
    d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(21);
    d.text(txt(m.title), M, 48);
    d.setFont('helvetica', 'normal'); d.setFontSize(10.5);
    if(m.subtitle) d.text(fit(d, m.subtitle, this.CW), M, 66);
    d.setFontSize(9);
    d.text(fit(d, 'Dataset: ' + (m.dataset || '-') + '   |   ' + (m.filter || ''), this.CW), M, 84);
    d.text('Dibuat: ' + nowLong(m.generatedAt), M, 97);
    this.y = 126;
  };

  P.headline = function(text, title, tone){
    var d = this.doc, t = txt(stripHtml(text));
    if(!t) return;
    d.setFontSize(10.5);
    var lines = d.splitTextToSize(t, this.CW - 28);
    var h = lines.length * 14 + (title ? 34 : 20);
    this.space(h);
    var tc = tone === 'brick' ? BRICK : (tone === 'amber' ? AMBER : (tone === 'blue' ? BLUE : GREEN));
    var bg = tone === 'brick' ? [251, 240, 238] : (tone === 'amber' ? [253, 246, 232] : (tone === 'blue' ? [236, 243, 250] : [237, 245, 239]));
    d.setFillColor(bg[0], bg[1], bg[2]); d.setDrawColor(LINE[0], LINE[1], LINE[2]);
    d.roundedRect(M, this.y, this.CW, h, 5, 5, 'FD');
    d.setFillColor(tc[0], tc[1], tc[2]); d.rect(M, this.y, 4, h, 'F');
    var ty = this.y + 16;
    if(title){ d.setFont('helvetica', 'bold'); d.setFontSize(9.5); d.setTextColor(tc[0], tc[1], tc[2]); d.text(txt(title).toUpperCase(), M + 16, ty); ty += 16; }
    d.setFont('helvetica', 'normal'); d.setFontSize(10.5); d.setTextColor(INK[0], INK[1], INK[2]);
    d.text(lines, M + 16, ty);
    this.y += h + 12;
  };

  P.kpis = function(list, perRow){
    var d = this.doc, n = perRow || (list.length >= 4 ? 3 : list.length) || 1, gap = 10;
    var bw = (this.CW - gap * (n - 1)) / n, bh = 58;
    for(var i = 0; i < list.length; i++){
      if(i % n === 0) this.space(bh + gap);
      var k = list[i], x = M + (i % n) * (bw + gap), y = this.y;
      var tone = k.tone === 'warn' ? BRICK : (k.tone === 'amber' ? AMBER : (k.tone === 'blue' ? BLUE : GREEN));
      d.setFillColor(255); d.setDrawColor(LINE[0], LINE[1], LINE[2]); d.roundedRect(x, y, bw, bh, 4, 4, 'FD');
      d.setFillColor(tone[0], tone[1], tone[2]); d.rect(x, y + 4, 3, bh - 8, 'F');
      d.setFont('helvetica', 'normal'); d.setFontSize(8.3); d.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      d.text(fit(d, k.label, bw - 20), x + 12, y + 16);
      d.setFont('helvetica', 'bold'); d.setFontSize(13.5); d.setTextColor(INK[0], INK[1], INK[2]);
      d.text(fit(d, k.value, bw - 20), x + 12, y + 35);
      if(k.note){ d.setFont('helvetica', 'normal'); d.setFontSize(7.6); d.setTextColor(MUTED[0], MUTED[1], MUTED[2]); d.text(fit(d, k.note, bw - 20), x + 12, y + 49); }
      if(i % n === n - 1 || i === list.length - 1) this.y += bh + gap;
    }
    this.y += 4;
  };

  P.section = function(title, desc, keep){
    var d = this.doc;
    d.setFontSize(9);
    var lines = desc ? d.splitTextToSize(txt(desc), this.CW) : [];
    this.space(38 + lines.length * 11 + (keep == null ? 120 : keep));
    d.setFont('helvetica', 'bold'); d.setFontSize(13); d.setTextColor(INK[0], INK[1], INK[2]);
    d.text(txt(title), M, this.y + 12);
    d.setDrawColor(GREEN[0], GREEN[1], GREEN[2]); d.setLineWidth(1.4); d.line(M, this.y + 18, M + 34, this.y + 18);
    d.setLineWidth(0.5);
    this.y += 32;
    if(lines.length){
      d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      d.text(lines, M, this.y); this.y += lines.length * 11 + 4;
    }
  };

  P.hbars = function(o){
    var d = this.doc, items = o.items || [], color = o.color || GREEN, fmt = o.fmt || function(v){ return String(v); };
    if(!items.length) return;
    var rowH = 22, labelW = 190, valW = 92, barX = M + labelW, barW = this.CW - labelW - valW;
    var max = Math.max.apply(null, items.map(function(i){ return i.v; }).concat([1]));
    for(var i = 0; i < items.length; i++){
      this.space(rowH + 2);
      var it = items[i], y = this.y;
      d.setFont('helvetica', 'normal'); d.setFontSize(8.8); d.setTextColor(INK[0], INK[1], INK[2]);
      d.text(fit(d, (o.numbered ? (i + 1) + '. ' : '') + it.name, labelW - 8), M, y + 10);
      if(it.sub){ d.setFontSize(7.3); d.setTextColor(MUTED[0], MUTED[1], MUTED[2]); d.text(fit(d, it.sub, labelW - 8), M, y + 19); }
      d.setFillColor(SOFT[0], SOFT[1], SOFT[2]); d.roundedRect(barX, y + 2, barW, 11, 2, 2, 'F');
      var w = Math.max(2, it.v / max * barW);
      var c = it.color || color;
      d.setFillColor(c[0], c[1], c[2]); d.roundedRect(barX, y + 2, w, 11, 2, 2, 'F');
      d.setFont('helvetica', 'bold'); d.setFontSize(8.8); d.setTextColor(INK[0], INK[1], INK[2]);
      d.text(fit(d, fmt(it.v), valW - 4), this.W - M, y + 11, { align: 'right' });
      this.y += rowH;
    }
    this.y += 8;
  };

  P.vbars = function(o){
    var d = this.doc, labels = o.labels || [], vals = o.values || [], fmt = o.fmt || function(v){ return String(Math.round(v)); };
    if(!vals.length) return;
    var h = o.height || 120, axisW = 44, labH = 16;
    this.space(h + labH + 24);
    var x0 = M + axisW, w = this.CW - axisW, y0 = this.y + 8, base = y0 + h;
    var max = Math.max.apply(null, vals.concat([1]));
    d.setDrawColor(LINE[0], LINE[1], LINE[2]); d.setLineWidth(0.4);
    for(var g = 0; g <= 4; g++){
      var gy = base - h * g / 4;
      d.line(x0, gy, x0 + w, gy);
      d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      d.text(txt(fmt(max * g / 4)), x0 - 4, gy + 2.5, { align: 'right' });
    }
    var n = vals.length, slot = w / n, bw = Math.min(26, slot * 0.7);
    var hi = o.highlight === false ? -1 : vals.indexOf(max);
    var every = Math.max(1, Math.ceil(n / (o.maxLabels || 12)));
    for(var i = 0; i < n; i++){
      var bh = vals[i] / max * h, bx = x0 + slot * i + (slot - bw) / 2;
      var c = (i === hi && max > 0) ? (o.hiColor || AMBER) : (o.color || GREEN);
      d.setFillColor(c[0], c[1], c[2]); if(bh > 0) d.rect(bx, base - bh, bw, bh, 'F');
      if(i % every === 0){ d.setFontSize(7); d.setTextColor(MUTED[0], MUTED[1], MUTED[2]); d.text(txt(labels[i]), bx + bw / 2, base + 10, { align: 'center' }); }
    }
    d.setDrawColor(150); d.line(x0, base, x0 + w, base);
    this.y = base + labH + 10;
  };

  // series: [{name, values (null = celah), color, dashed, width, band:{lo:[],hi:[]}}]
  P.lines = function(o){
    var d = this.doc, labels = o.labels || [], series = o.series || [], fmt = o.fmt || function(v){ return String(Math.round(v)); };
    var n = labels.length; if(n < 2) return;
    var h = o.height || 150, axisW = 52;
    this.space(h + 46);
    var x0 = M + axisW, w = this.CW - axisW - 4, y0 = this.y + 8, base = y0 + h;
    var max = 1, i, s;
    series.forEach(function(se){
      se.values.forEach(function(v){ if(v != null && v > max) max = v; });
      if(se.band) se.band.hi.forEach(function(v){ if(v != null && v > max) max = v; });
    });
    var sx = function(i){ return x0 + (n === 1 ? 0 : i / (n - 1)) * w; };
    var sy = function(v){ return base - Math.max(0, v) / max * h; };
    d.setDrawColor(LINE[0], LINE[1], LINE[2]); d.setLineWidth(0.4);
    for(var g = 0; g <= 4; g++){
      var gy = base - h * g / 4; d.line(x0, gy, x0 + w, gy);
      d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      d.text(txt(fmt(max * g / 4)), x0 - 4, gy + 2.5, { align: 'right' });
    }
    series.forEach(function(se){
      if(!se.band) return;
      d.setFillColor(250, 238, 212);
      for(var j = 0; j < n - 1; j++){
        if(se.band.lo[j] == null || se.band.lo[j + 1] == null) continue;
        d.triangle(sx(j), sy(se.band.hi[j]), sx(j + 1), sy(se.band.hi[j + 1]), sx(j), sy(se.band.lo[j]), 'F');
        d.triangle(sx(j + 1), sy(se.band.hi[j + 1]), sx(j + 1), sy(se.band.lo[j + 1]), sx(j), sy(se.band.lo[j]), 'F');
      }
    });
    series.forEach(function(se){
      var c = se.color || GREEN;
      d.setDrawColor(c[0], c[1], c[2]); d.setLineWidth(se.width || 1.6);
      d.setLineDashPattern(se.dashed ? [4, 3] : [], 0);
      for(var j = 0; j < n - 1; j++){
        if(se.values[j] == null || se.values[j + 1] == null) continue;
        d.line(sx(j), sy(se.values[j]), sx(j + 1), sy(se.values[j + 1]));
      }
      d.setLineDashPattern([], 0);
    });
    d.setLineWidth(0.5); d.setDrawColor(150); d.line(x0, base, x0 + w, base);
    var every = Math.max(1, Math.ceil(n / 8));
    d.setFontSize(7); d.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    for(i = 0; i < n; i += every) d.text(txt(labels[i]), sx(i), base + 10, { align: 'center' });
    // legenda
    var lx = x0, ly = base + 24;
    d.setFontSize(8);
    series.forEach(function(se){
      var c = se.color || GREEN;
      d.setDrawColor(c[0], c[1], c[2]); d.setLineWidth(2); d.setLineDashPattern(se.dashed ? [3, 2] : [], 0); d.line(lx, ly - 3, lx + 16, ly - 3); d.setLineDashPattern([], 0);
      d.setTextColor(INK[0], INK[1], INK[2]); d.text(txt(se.name), lx + 20, ly);
      lx += 28 + d.getTextWidth(txt(se.name)) + 12;
    });
    d.setLineWidth(0.5);
    this.y = base + 34;
  };

  P.table = function(o){
    var d = this.doc, align = o.align || [];
    var cols = {};
    (o.head || []).forEach(function(_, i){ cols[i] = { halign: align[i] || 'left' }; if(o.widths && o.widths[i]) cols[i].cellWidth = o.widths[i]; });
    this.space(48);
    d.autoTable({
      startY: this.y, margin: { left: M, right: M, bottom: 44 },
      head: [o.head.map(txt)], body: o.body.map(function(r){ return r.map(txt); }),
      showHead: 'everyPage', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 8.4, cellPadding: 4, overflow: 'linebreak', valign: 'middle', textColor: INK },
      headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 252, 251] },
      columnStyles: cols,
      didParseCell: function(h){ if(h.section === 'head') h.cell.styles.halign = align[h.column.index] || 'left'; }
    });
    this.y = d.lastAutoTable.finalY + 14;
  };

  P.notes = function(list, title){
    var d = this.doc;
    list = (list || []).filter(Boolean);
    if(!list.length) return;
    if(title) this.section(title);
    d.setFont('helvetica', 'normal'); d.setFontSize(8.8); d.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    for(var i = 0; i < list.length; i++){
      var lines = d.splitTextToSize('- ' + txt(stripHtml(list[i])), this.CW);
      this.space(lines.length * 11 + 3);
      d.text(lines, M, this.y); this.y += lines.length * 11 + 3;
    }
    this.y += 6;
  };

  P.empty = function(msg){ this.headline(msg || 'Belum ada data yang dapat ditampilkan pada filter yang aktif.', 'Info'); };

  function footer(doc, meta){
    var pages = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    for(var i = 1; i <= pages; i++){
      doc.setPage(i);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.5); doc.line(M, H - 32, W - M, H - 32);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140);
      doc.text(txt(meta.title) + '  -  ' + txt(meta.dataset || ''), M, H - 20);
      doc.text('Halaman ' + i + ' / ' + pages, W - M, H - 20, { align: 'right' });
    }
  }

  function build(meta, fill, base){
    meta = meta || {}; meta.generatedAt = new Date();
    if(meta.dataset == null) meta.dataset = activeDatasetName();
    if(meta.filter == null) meta.filter = filterText();
    return NetIncomeExport.ensurePdfLibs().then(function(){
      var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      var b = new Builder(doc, meta);
      b.cover();
      fill(b);
      footer(doc, meta);
      var name = base + '_' + slug(meta.dataset) + '_' + stamp(meta.generatedAt) + '.pdf';
      doc.save(name);
      return name;
    });
  }

  function activeDatasetName(){
    var el = document.getElementById('activeDatasetName');
    var t = el ? el.textContent.trim() : '';
    return (t && t !== '\u2014') ? t : 'Data contoh';
  }
  function filterText(){
    var st = document.getElementById('filterStatus'), pv = document.getElementById('filterProvince');
    var s = st && st.value !== '__all__' ? st.value : 'Semua status';
    var p = pv && pv.value !== '__all__' ? pv.value : 'Semua provinsi';
    return 'Status: ' + s + ' | Provinsi: ' + p;
  }

  // Tombol unduh: kunci saat bekerja, tampilkan pesan bila gagal.
  function bind(btnId, task){
    var btn = document.getElementById(btnId);
    if(!btn) return;
    btn.addEventListener('click', function(){
      if(btn.disabled) return;
      var label = btn.innerHTML;
      btn.disabled = true; btn.textContent = 'Menyiapkan PDF\u2026';
      Promise.resolve().then(task).then(function(name){
        if(name && typeof dsToast === 'function') dsToast('PDF diunduh: ' + name);
      }).catch(function(err){
        console.error('[pdf]', err);
        if(typeof dsToast === 'function') dsToast('Gagal membuat PDF: ' + (err && err.message ? err.message : err), 'error');
      }).then(function(){ btn.innerHTML = label; btn.disabled = false; });
    });
  }

  return { build: build, bind: bind, stripHtml: stripHtml, colors: { green: GREEN, amber: AMBER, blue: BLUE, brick: BRICK } };
})();
