"use strict";

/* ---------------- Ekspor tabel Pendapatan Bersih ke Excel (.xlsx) dan PDF ----------------
   Menerima data siap pakai dari NetIncome.getExportData():
   { meta:{ dataset, status, province, generatedAt:Date }, rows:[{ key, name, units, kg, revenue, perKg, net }],
     totals:{ units, kg, revenue, net, filled, count }, notes:[string] }
   perKg = 0 berarti isian belum diisi.
   - Excel memakai SheetJS (sudah dimuat di index.html). Kolom "Total bersih" dan baris total berupa rumus,
     jadi angka bisa diubah langsung di Excel.
   - PDF memakai jsPDF + jsPDF-AutoTable yang dimuat dari cdnjs hanya saat tombol PDF ditekan pertama kali. */
var NetIncomeExport = (function(){
  var JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var AUTOTABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';

  function pad(n){ return String(n).padStart(2, '0'); }
  function dateStamp(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateLong(d){
    var months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + '.' + pad(d.getMinutes());
  }
  function slug(s){
    var out = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return out || 'dataset';
  }
  function fileBase(data){ return 'pendapatan-bersih_' + slug(data.meta.dataset) + '_' + dateStamp(data.meta.generatedAt); }
  function filterText(meta){ return 'Status: ' + (meta.status || 'Semua status') + '  |  Provinsi: ' + (meta.province || 'Semua provinsi'); }
  function n0(n){ return Math.round(n).toLocaleString('id-ID'); }
  function n2(n){ return n.toLocaleString('id-ID', { maximumFractionDigits: 2 }); }

  /* ---------------- Excel ---------------- */
  function toExcel(data){
    if(typeof XLSX === 'undefined') throw new Error('Pustaka Excel (SheetJS) belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
    var meta = data.meta, rows = data.rows, t = data.totals;
    var HEAD = ['Produk (SKU / kunci)', 'Nama produk', 'Unit', 'Berat (kg)', 'Omzet (Rp)', 'Bersih per kg (Rp)', 'Total bersih (Rp)'];

    var aoa = [
      ['Pendapatan Bersih per Produk'],
      ['Dataset', meta.dataset || '-'],
      ['Filter', filterText(meta)],
      ['Dibuat', dateLong(meta.generatedAt)],
      [],
      HEAD
    ];
    var headerRow = aoa.length - 1;          // indeks baris (0-based) header
    rows.forEach(function(r){
      aoa.push([r.key, r.name && r.name !== r.key ? r.name : '', r.units, r.kg, r.revenue, r.perKg > 0 ? r.perKg : null, null]);
    });
    var firstData = headerRow + 1, lastData = headerRow + rows.length;
    var totalRow = aoa.length;
    aoa.push(['Total', '', t.units, t.kg, t.revenue, null, null]);
    if(data.notes && data.notes.length){
      aoa.push([]);
      aoa.push(['Catatan']);
      data.notes.forEach(function(n){ aoa.push([n]); });
    }

    var ws = XLSX.utils.aoa_to_sheet(aoa);

    // Rumus: total bersih per baris = kg x bersih per kg (kosong bila belum diisi); baris Total = SUM.
    rows.forEach(function(r, i){
      var xr = firstData + i + 1;            // nomor baris Excel (1-based)
      ws['G' + xr] = r.perKg > 0
        ? { t: 'n', v: r.net, f: 'D' + xr + '*F' + xr, z: '#,##0' }
        : { t: 's', v: '', f: 'IF(F' + xr + '="","",D' + xr + '*F' + xr + ')' };
      if(r.perKg > 0) ws['F' + xr].z = '#,##0';
      ws['D' + xr].z = '#,##0.00';
      ws['E' + xr].z = '#,##0';
      ws['C' + xr].z = '#,##0';
    });
    var tr = totalRow + 1;
    if(rows.length){
      var a = firstData + 1, b = lastData + 1;
      ws['C' + tr] = { t: 'n', v: t.units, f: 'SUM(C' + a + ':C' + b + ')', z: '#,##0' };
      ws['D' + tr] = { t: 'n', v: t.kg, f: 'SUM(D' + a + ':D' + b + ')', z: '#,##0.00' };
      ws['E' + tr] = { t: 'n', v: t.revenue, f: 'SUM(E' + a + ':E' + b + ')', z: '#,##0' };
    }
    ws['G' + tr] = { t: 'n', v: t.net, z: '#,##0' };
    if(rows.length) ws['G' + tr].f = 'SUM(G' + (firstData + 1) + ':G' + (lastData + 1) + ')';

    ws['!cols'] = [{ wch: 26 }, { wch: 46 }, { wch: 9 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: 6 } });

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendapatan Bersih');
    var name = fileBase(data) + '.xlsx';
    XLSX.writeFile(wb, name);
    return name;
  }

  /* ---------------- PDF ---------------- */
  function loadScript(url){
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = resolve;
      s.onerror = function(){ reject(new Error('Gagal memuat pustaka PDF. Periksa koneksi internet lalu coba lagi.')); };
      document.head.appendChild(s);
    });
  }
  function pdfReady(){
    var ns = window.jspdf;
    if(!ns || !ns.jsPDF) return false;
    return typeof ns.jsPDF.API.autoTable === 'function';
  }
  function ensurePdfLibs(){
    if(pdfReady()) return Promise.resolve();
    var p = (window.jspdf && window.jspdf.jsPDF) ? Promise.resolve() : loadScript(JSPDF_URL);
    return p.then(function(){ return loadScript(AUTOTABLE_URL); }).then(function(){
      if(!pdfReady()) throw new Error('Pustaka PDF termuat tetapi tidak dapat dipakai.');
    });
  }
  // Font bawaan PDF hanya mendukung karakter Latin-1; karakter lain (mis. emoji) dibuang agar tidak jadi simbol rusak.
  function pdfText(s){ return String(s == null ? '' : s).replace(/[^\u0020-\u00FF]/g, '').replace(/\s+/g, ' ').trim(); }

  function toPdf(data){
    return ensurePdfLibs().then(function(){
      var meta = data.meta, rows = data.rows, t = data.totals;
      var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      var W = doc.internal.pageSize.getWidth();
      var M = 36;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('Pendapatan Bersih per Produk', M, 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90);
      doc.text('Dataset: ' + pdfText(meta.dataset || '-'), M, 58);
      doc.text(pdfText(filterText(meta)) + '   |   Dibuat: ' + dateLong(meta.generatedAt), M, 72);

      // Ringkasan
      var summary = [
        ['Total pendapatan bersih', 'Rp' + n0(t.net)],
        ['Total berat terjual', n2(t.kg) + ' kg'],
        ['Produk sudah diisi', t.filled + ' / ' + t.count]
      ];
      var boxW = (W - M * 2 - 20) / 3;
      summary.forEach(function(s, i){
        var x = M + i * (boxW + 10);
        doc.setDrawColor(210); doc.setFillColor(245, 248, 246);
        doc.roundedRect(x, 84, boxW, 42, 4, 4, 'FD');
        doc.setTextColor(100); doc.setFontSize(8.5); doc.text(s[0], x + 10, 100);
        doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(s[1], x + 10, 118);
        doc.setFont('helvetica', 'normal');
      });

      var body = rows.map(function(r){
        var label = pdfText(r.key) + (r.name && r.name !== r.key ? '\n' + pdfText(r.name) : '');
        return [label, n0(r.units), n2(r.kg), 'Rp' + n0(r.revenue), r.perKg > 0 ? 'Rp' + n0(r.perKg) : '-', r.perKg > 0 ? 'Rp' + n0(r.net) : '-'];
      });

      doc.autoTable({
        startY: 138,
        margin: { left: M, right: M, bottom: 40 },
        head: [['Produk', 'Unit', 'Berat (kg)', 'Omzet', 'Bersih / kg', 'Total bersih']],
        body: body,
        foot: [['Total', n0(t.units), n2(t.kg), 'Rp' + n0(t.revenue), '', 'Rp' + n0(t.net)]],
        showFoot: 'lastPage',
        rowPageBreak: 'avoid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [47, 111, 78], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [232, 240, 235], textColor: 20, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 252, 251] },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 55 },
          2: { halign: 'right', cellWidth: 70 },
          3: { halign: 'right', cellWidth: 95 },
          4: { halign: 'right', cellWidth: 90 },
          5: { halign: 'right', cellWidth: 105 }
        },
        didParseCell: function(h){
          if(h.section === 'head' && h.column.index > 0) h.cell.styles.halign = 'right';
          if(h.section === 'foot' && h.column.index > 0) h.cell.styles.halign = 'right';
        }
      });

      // Catatan di bawah tabel
      if(data.notes && data.notes.length){
        var y = doc.lastAutoTable.finalY + 16;
        var H = doc.internal.pageSize.getHeight();
        doc.setFontSize(8.5); doc.setTextColor(90);
        data.notes.forEach(function(n){
          var lines = doc.splitTextToSize('- ' + pdfText(n), W - M * 2);
          if(y + lines.length * 11 > H - 30){ doc.addPage(); y = 40; }
          doc.text(lines, M, y);
          y += lines.length * 11 + 2;
        });
      }

      // Nomor halaman
      var pages = doc.getNumberOfPages();
      var H2 = doc.internal.pageSize.getHeight();
      for(var i = 1; i <= pages; i++){
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140);
        doc.text('Halaman ' + i + ' / ' + pages, W - M, H2 - 18, { align: 'right' });
      }

      var name = fileBase(data) + '.pdf';
      doc.save(name);
      return name;
    });
  }

  return { toExcel: toExcel, toPdf: toPdf, _fileBase: fileBase, ensurePdfLibs: ensurePdfLibs, pdfText: pdfText };
})();
