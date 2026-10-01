"use strict";

/* ---------------- Gabung Dataset ----------------
   Menggabungkan 2+ dataset (mis. satu berkas per bulan) menjadi SATU dataset baru di akun yang sama.
   - Baris tiap dataset dimuat lewat Api.orders.load, digabung di peramban, lalu disimpan sebagai
     dataset baru (Api.datasets.create + Api.orders.save). Dataset asal TIDAK diubah/dihapus.
   - Opsi "buang baris ganda": kunci = order_id | produk | variasi | sku. Bila ganda, baris dari dataset
     dengan periode lebih baru dipakai (agar status pesanan terbaru yang menang).
   - Setelah tersimpan, dataset gabungan langsung dibuka sebagai dataset aktif. */
var DatasetMerge = (function(){
  var selected = [];     // id dataset (string)
  var cache = {};        // id -> { records, source }
  var busy = false;

  function $(id){ return document.getElementById(id); }
  function sameId(a, b){ return a != null && b != null && String(a) === String(b); }
  function datasets(){ return (typeof state !== 'undefined' && state.datasets) ? state.datasets : []; }
  function findDs(id){ var l = datasets(); for(var i = 0; i < l.length; i++){ if(sameId(l[i].id, id)) return l[i]; } return null; }
  function fmtInt(n){ return Math.round(n).toLocaleString('id-ID'); }
  function dayOf(r){ return String(r.created_at || '').slice(0, 10); }
  function fmtDay(k){
    if(!k) return '—';
    var p = k.split('-'), mo = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return parseInt(p[2], 10) + ' ' + mo[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }
  function rowKey(r){ return [r.order_id, r.product, r.variation, r.sku].map(function(v){ return String(v == null ? '' : v).trim(); }).join('\u0001'); }

  function showError(msg){ var e = $('mergeError'); if(!e) return; e.textContent = msg || ''; e.classList.toggle('show', !!msg); }

  function renderPicker(){
    var el = $('mergePickerList');
    if(!el) return;
    var list = datasets();
    selected = selected.filter(function(id){ return !!findDs(id); });
    if(!list.length){
      el.innerHTML = '<div class="picker-empty">Belum ada dataset tersimpan. Unggah dulu dataset bulanan Anda.</div>';
      updateControls();
      return;
    }
    el.innerHTML = list.map(function(ds){
      var on = selected.indexOf(String(ds.id)) > -1;
      return '<label class="compare-check-row' + (on ? ' on' : '') + '">' +
        '<input type="checkbox" data-id="' + escapeHtml(String(ds.id)) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="name" title="' + escapeHtml(ds.name) + '">' + escapeHtml(ds.name) + '</span>' +
        '<span class="meta">' + fmtInt(ds.row_count || 0) + ' baris</span></label>';
    }).join('');
    updateControls();
  }

  function updateControls(){
    var n = selected.length;
    var cnt = $('mgCount'); if(cnt) cnt.textContent = n + ' dipilih';
    var ok = n >= 2 && !busy;
    var pv = $('btnMergePreview'), run = $('btnMergeRun');
    if(pv) pv.disabled = !ok;
    if(run) run.disabled = !ok;
    var em = $('mergeEmpty'); if(em) em.style.display = n >= 2 ? 'none' : '';
    var nm = $('mergeName');
    if(nm && !nm.dataset.touched) nm.value = n >= 2 ? suggestName() : '';
    var prev = $('mergePreview'); if(prev && n < 2) prev.style.display = 'none';
  }

  function suggestName(){
    var names = selected.map(function(id){ var d = findDs(id); return d ? d.name : ''; }).filter(Boolean);
    var s = 'Gabungan: ' + names.join(' + ');
    return s.length > 110 ? 'Gabungan ' + names.length + ' dataset' : s;
  }

  function loadOne(id){
    if(cache[id]) return Promise.resolve(cache[id]);
    return Api.orders.load(id).then(function(res){ cache[id] = res; return res; });
  }

  // Hasil: { parts:[{ds,rows,first,last,dupes,used}], merged:[...], total, dupes, first, last, overlaps:[] }
  function buildMerge(loaded, dedupe){
    var parts = loaded.map(function(x){
      var days = x.res.records.map(dayOf).filter(Boolean).sort();
      return { ds: x.ds, records: x.res.records, first: days[0] || '', last: days[days.length - 1] || '', dupes: 0, used: 0 };
    });
    // urut kronologis: periode paling awal dulu, yang terbaru terakhir (menang saat ganda)
    parts.sort(function(a, b){ return (a.last || '').localeCompare(b.last || '') || (a.first || '').localeCompare(b.first || ''); });

    var seen = {}, merged = [];
    if(dedupe){
      // proses dari yang terbaru ke lama supaya baris terbaru dipertahankan
      for(var i = parts.length - 1; i >= 0; i--){
        var p = parts[i];
        p.records.forEach(function(r){
          var k = rowKey(r);
          if(seen[k]){ p.dupes++; return; }
          seen[k] = true; p.used++; merged.push(r);
        });
      }
    } else {
      parts.forEach(function(p){ p.used = p.records.length; merged = merged.concat(p.records); });
    }
    merged.sort(function(a, b){ return String(a.created_at).localeCompare(String(b.created_at)); });

    var overlaps = [];
    for(var a = 0; a < parts.length; a++){
      for(var b = a + 1; b < parts.length; b++){
        if(parts[a].first && parts[b].first && parts[a].first <= parts[b].last && parts[b].first <= parts[a].last){
          overlaps.push(parts[a].ds.name + ' & ' + parts[b].ds.name);
        }
      }
    }
    var firsts = parts.map(function(p){ return p.first; }).filter(Boolean).sort();
    var lasts = parts.map(function(p){ return p.last; }).filter(Boolean).sort();
    var totalRaw = parts.reduce(function(s, p){ return s + p.records.length; }, 0);
    return { parts: parts, merged: merged, totalRaw: totalRaw, dupes: totalRaw - merged.length, first: firsts[0] || '', last: lasts[lasts.length - 1] || '', overlaps: overlaps };
  }

  function prepare(){
    showError('');
    var dedupe = $('mergeDedupe') && $('mergeDedupe').checked;
    return Promise.all(selected.map(function(id){
      return loadOne(id).then(function(res){ return { ds: findDs(id), res: res }; });
    })).then(function(loaded){ return buildMerge(loaded, dedupe); });
  }

  function renderPreview(r){
    var box = $('mergePreview'); if(!box) return;
    box.style.display = '';
    $('mergePreviewDesc').textContent = 'Periode ' + fmtDay(r.first) + ' – ' + fmtDay(r.last) + ' dari ' + r.parts.length + ' dataset.';
    var uniqueOrders = {};
    r.merged.forEach(function(x){ uniqueOrders[x.order_id] = 1; });
    var kpis = [
      { l: 'Dataset digabung', v: r.parts.length, s: 'dataset asal tetap tersimpan' },
      { l: 'Total baris awal', v: fmtInt(r.totalRaw), s: 'jumlah semua dataset' },
      { l: 'Baris ganda dibuang', v: fmtInt(r.dupes), s: $('mergeDedupe').checked ? 'duplikat antar dataset' : 'opsi dimatikan' },
      { l: 'Baris hasil gabungan', v: fmtInt(r.merged.length), s: 'akan disimpan' },
      { l: 'Pesanan unik', v: fmtInt(Object.keys(uniqueOrders).length), s: 'berdasarkan No. pesanan' }
    ];
    $('mergeKpis').innerHTML = kpis.map(function(k){
      return '<div class="sl-kpi"><div class="sl-kpi-lbl">' + k.l + '</div><div class="sl-kpi-val tabular">' + k.v + '</div><div class="sl-kpi-sub">' + k.s + '</div></div>';
    }).join('');
    $('mergeTableBody').innerHTML = r.parts.map(function(p){
      return '<tr><td>' + escapeHtml(p.ds.name) + '</td><td>' + fmtDay(p.first) + ' – ' + fmtDay(p.last) + '</td><td class="tabular">' + fmtInt(p.records.length) + '</td><td class="tabular">' + fmtInt(p.dupes) + '</td><td class="tabular">' + fmtInt(p.used) + '</td></tr>';
    }).join('');
    var warn = $('mergeWarn'), msgs = [];
    if(r.overlaps.length){
      msgs.push('Periode tumpang tindih: ' + r.overlaps.join('; ') + '. ' + ($('mergeDedupe').checked ? 'Baris ganda sudah dibuang otomatis.' : 'Aktifkan "Buang baris ganda" agar pesanan tidak terhitung dua kali.'));
    }
    var days = {}; r.merged.forEach(function(x){ days[dayOf(x)] = 1; });
    if(r.first && r.last){
      var span = Math.round((new Date(r.last + 'T00:00:00') - new Date(r.first + 'T00:00:00')) / 864e5) + 1;
      var gaps = span - Object.keys(days).length;
      if(gaps > 0) msgs.push(gaps + ' dari ' + span + ' hari pada rentang ini tidak punya transaksi (bisa jadi ada bulan yang belum diunggah).');
    }
    warn.innerHTML = msgs.map(function(m){ return '<div>' + escapeHtml(m) + '</div>'; }).join('');
    warn.classList.toggle('show', msgs.length > 0);
  }

  function setBusy(b, label){
    busy = b;
    var run = $('btnMergeRun'), pv = $('btnMergePreview');
    if(run){ if(label !== undefined) run.textContent = label; }
    if(pv) pv.disabled = b || selected.length < 2;
    if(run) run.disabled = b || selected.length < 2;
  }

  function preview(){
    var btn = $('btnMergePreview'), orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Memuat data…';
    prepare().then(renderPreview).catch(function(err){
      console.error('[gabung]', err); showError('Gagal memuat dataset: ' + (err && err.message ? err.message : err));
    }).then(function(){ btn.textContent = orig; updateControls(); });
  }

  function run(){
    var name = ($('mergeName').value || '').trim();
    if(!name){ showError('Nama dataset gabungan wajib diisi.'); $('mergeName').focus(); return; }
    var runBtn = $('btnMergeRun'), origLabel = runBtn.textContent;
    setBusy(true, 'Memuat data…');
    prepare().then(function(r){
      renderPreview(r);
      if(!r.merged.length) throw new Error('Tidak ada baris untuk digabung.');
      var source = 'Gabungan ' + r.parts.length + ' dataset';
      return Api.datasets.create(name, source).then(function(ds){
        return Api.orders.save(ds.id, r.merged, source, function(done, total){
          runBtn.textContent = 'Menyimpan ' + fmtInt(done) + '/' + fmtInt(total) + '…';
        }).then(function(){ return { ds: ds, r: r }; });
      });
    }).then(function(out){
      return DatasetsUI.refresh().then(function(){ return DatasetsUI.switchTo(out.ds.id); }).then(function(){
        selected = []; cache = {};
        var nm = $('mergeName'); nm.value = ''; delete nm.dataset.touched;
        renderPicker();
        $('mergePreview').style.display = 'none';
        dsToast('Dataset gabungan tersimpan: ' + fmtInt(out.r.merged.length) + ' baris');
        var go = document.querySelector('.nav-btn[data-view="dashboard"]'); if(go) go.click();
      });
    }).catch(function(err){
      console.error('[gabung]', err);
      showError('Gagal menggabungkan dataset: ' + (err && err.message ? err.message : err));
    }).then(function(){ setBusy(false, origLabel); runBtn.textContent = origLabel; updateControls(); });
  }

  var list = $('mergePickerList');
  if(list) list.addEventListener('change', function(e){
    var cb = e.target.closest('input[type="checkbox"][data-id]'); if(!cb) return;
    var id = cb.getAttribute('data-id'), i = selected.indexOf(id);
    if(cb.checked && i === -1) selected.push(id);
    if(!cb.checked && i > -1) selected.splice(i, 1);
    renderPicker();
  });
  var nm = $('mergeName'); if(nm) nm.addEventListener('input', function(){ nm.dataset.touched = nm.value ? '1' : ''; });
  var dd = $('mergeDedupe'); if(dd) dd.addEventListener('change', function(){ var p = $('mergePreview'); if(p && p.style.display !== 'none' && selected.length >= 2) preview(); });
  var bp = $('btnMergePreview'); if(bp) bp.addEventListener('click', preview);
  var br = $('btnMergeRun'); if(br) br.addEventListener('click', run);

  return { render: renderPicker };
})();

function renderMergePicker(){ DatasetMerge.render(); }
