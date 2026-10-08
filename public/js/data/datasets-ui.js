"use strict";

/* ---------------- Manajer dataset: daftar, ganti nama, hapus, pindah aktif ---------------- */
function dsToast(msg, type){
  var t = document.createElement('div');
  t.className = 'ds-toast' + (type === 'error' ? ' error' : '');
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(function(){ t.classList.add('show'); });
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 250); }, type === 'error' ? 6000 : 2600);
}

var DatasetsUI = (function(){
  var listElLanding = document.getElementById('datasetListLanding');
  var addBtnLanding = document.getElementById('btnAddDatasetLanding');
  var switcherBtn = document.getElementById('datasetSwitcher');
  var switcherName = document.getElementById('dsSwitcherName');
  var switcherMeta = document.getElementById('dsSwitcherMeta');
  var pickerOverlay = document.getElementById('datasetPickerOverlay');
  var pickerList = document.getElementById('datasetPickerList');
  var pickerSearch = document.getElementById('datasetPickerSearch');
  var pickerSub = document.getElementById('datasetPickerSub');
  var pickerClose = document.getElementById('datasetPickerClose');
  var addBtnPicker = document.getElementById('btnAddDatasetPicker');
  var pickerQuery = '';
  var backBtn = document.getElementById('btnBackToDatasets');

  function fmtDate(iso){
    if(!iso) return '—';
    var d = new Date(iso);
    if(isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'});
  }

  /* ID dari database (mis. BIGINT Neon) bisa berupa string; bandingkan selalu sebagai string */
  function sameId(a, b){ return a != null && b != null && String(a) === String(b); }

  function findDataset(id){
    for(var i=0;i<state.datasets.length;i++){ if(sameId(state.datasets[i].id, id)) return state.datasets[i]; }
    return null;
  }

  function renderList(){
    var html;
    if(!state.datasets.length){
      html = '<div class="dataset-empty">Belum ada dataset. Tambahkan yang pertama lewat tombol di bawah.</div>';
    } else {
      html = state.datasets.map(function(ds){
        var active = sameId(ds.id, state.activeDatasetId);
        return '<div class="dataset-item' + (active ? ' active' : '') + '" data-id="' + ds.id + '">' +
          '<div class="dataset-item-main">' +
            '<div class="dataset-item-name">' + escapeHtml(ds.name) + '</div>' +
            '<div class="dataset-item-meta">' + (ds.row_count || 0).toLocaleString('id-ID') + ' baris &middot; diperbarui ' + fmtDate(ds.updated_at) + '</div>' +
          '</div>' +
          '<div class="dataset-item-actions">' +
            '<button type="button" data-action="rename" title="Ganti nama dataset">&#9998;</button>' +
            '<button type="button" data-action="delete" title="Hapus dataset">&#10005;</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }
    if(listElLanding) listElLanding.innerHTML = html;
    renderSwitcher();
    renderPicker();
    if(typeof renderComparePicker === 'function') renderComparePicker();
    if(typeof renderMergePicker === 'function') renderMergePicker();
  }

  /* ----- Kartu "Dataset aktif" di sidebar ----- */
  function renderSwitcher(){
    if(!switcherName || !switcherMeta) return;
    var ds = findDataset(state.activeDatasetId);
    if(ds){
      switcherName.textContent = ds.name;
      switcherMeta.textContent = (ds.row_count || 0).toLocaleString('id-ID') + ' baris \u00b7 ' + fmtDate(ds.updated_at);
      if(switcherBtn) switcherBtn.title = ds.name + ' \u2014 klik untuk berpindah dataset';
    } else {
      switcherName.textContent = state.datasets.length ? 'Pilih dataset' : 'Belum ada dataset';
      switcherMeta.textContent = state.datasets.length ? state.datasets.length + ' dataset tersedia' : 'Tambahkan dataset pertama';
    }
  }

  /* ----- Popup pemilih dataset ----- */
  var ICON_EDIT = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  var ICON_DEL = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_CHECK = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderPicker(){
    if(!pickerList) return;
    var total = state.datasets.length;
    if(pickerSub) pickerSub.textContent = total ? total + ' dataset tersimpan di akun Anda' : 'Belum ada dataset tersimpan';
    var q = pickerQuery.trim().toLowerCase();
    var items = state.datasets.filter(function(ds){ return !q || String(ds.name).toLowerCase().indexOf(q) !== -1; });
    if(!total){
      pickerList.innerHTML = '<div class="picker-empty">Belum ada dataset. Klik <b>Tambah dataset baru</b> untuk mengunggah berkas pertama Anda.</div>';
      return;
    }
    if(!items.length){
      pickerList.innerHTML = '<div class="picker-empty">Tidak ada dataset yang cocok dengan \u201c' + escapeHtml(pickerQuery.trim()) + '\u201d.</div>';
      return;
    }
    pickerList.innerHTML = items.map(function(ds){
      var active = sameId(ds.id, state.activeDatasetId);
      var initial = escapeHtml((String(ds.name).trim().charAt(0) || '?').toUpperCase());
      return '<div class="pk-item' + (active ? ' active' : '') + '" data-id="' + ds.id + '" role="button" tabindex="0"' + (active ? ' aria-current="true"' : '') + '>' +
        '<span class="pk-avatar">' + (active ? ICON_CHECK : initial) + '</span>' +
        '<div class="pk-main">' +
          '<div class="pk-name" title="' + escapeHtml(ds.name) + '">' + escapeHtml(ds.name) + '</div>' +
          '<div class="pk-meta"><span>' + (ds.row_count || 0).toLocaleString('id-ID') + ' baris</span><span>diperbarui ' + fmtDate(ds.updated_at) + '</span></div>' +
        '</div>' +
        (active ? '<span class="pk-badge">Aktif</span>' : '') +
        '<div class="pk-actions">' +
          '<button type="button" data-action="rename" title="Ganti nama" aria-label="Ganti nama ' + escapeHtml(ds.name) + '">' + ICON_EDIT + '</button>' +
          '<button type="button" data-action="delete" title="Hapus" aria-label="Hapus ' + escapeHtml(ds.name) + '">' + ICON_DEL + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function openPicker(){
    if(!pickerOverlay) return;
    pickerQuery = '';
    if(pickerSearch) pickerSearch.value = '';
    renderPicker();
    pickerOverlay.classList.add('show');
    var activeEl = pickerList && pickerList.querySelector('.pk-item.active');
    if(activeEl && activeEl.scrollIntoView) activeEl.scrollIntoView({block:'nearest'});
    setTimeout(function(){ if(state.datasets.length > 5 && pickerSearch) pickerSearch.focus(); else if(activeEl) activeEl.focus(); }, 60);
  }
  function closePicker(){
    if(pickerOverlay) pickerOverlay.classList.remove('show');
    if(switcherBtn) switcherBtn.focus({preventScroll:true});
  }

  function startInlineRename(item, id){
    var ds = findDataset(id);
    var nameEl = item.querySelector('.pk-name');
    if(!ds || !nameEl || item.classList.contains('editing')) return;
    item.classList.add('editing');
    var input = document.createElement('input');
    input.type = 'text'; input.className = 'pk-rename-input'; input.value = ds.name; input.maxLength = 120;
    input.setAttribute('aria-label', 'Nama baru dataset');
    nameEl.replaceWith(input);
    input.focus(); input.select();
    var done = false;
    function finish(save){
      if(done) return; done = true;
      var name = input.value.trim();
      if(!save || !name || name === ds.name){ renderPicker(); return; }
      input.disabled = true;
      input.style.opacity = '.6';
      Api.datasets.rename(ds.id, name).then(function(updated){
        ds.name = updated.name;
        renderList();
        if(sameId(state.activeDatasetId, ds.id)) setActiveDatasetLabel(updated.name);
        dsToast('Nama dataset diperbarui');
      }).catch(function(err){
        console.error('[dataset] gagal ganti nama', err);
        renderPicker();
        dsToast('Gagal mengganti nama: ' + (err && err.message ? err.message : err), 'error');
      });
    }
    input.addEventListener('keydown', function(e){
      e.stopPropagation();
      if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
      if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', function(){ finish(true); });
    input.addEventListener('click', function(e){ e.stopPropagation(); });
  }

  if(switcherBtn) switcherBtn.addEventListener('click', openPicker);
  if(pickerClose) pickerClose.addEventListener('click', closePicker);
  if(pickerOverlay) pickerOverlay.addEventListener('click', function(e){ if(e.target === pickerOverlay) closePicker(); });
  if(pickerSearch) pickerSearch.addEventListener('input', function(){ pickerQuery = pickerSearch.value; renderPicker(); });
  if(addBtnPicker) addBtnPicker.addEventListener('click', function(){
    closePicker();
    document.getElementById('fileInput').click();
  });
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape' || !pickerOverlay || !pickerOverlay.classList.contains('show')) return;
    var confirmEl = document.getElementById('confirmModalOverlay');
    if(confirmEl && confirmEl.classList.contains('show')) return; // dialog konfirmasi menutup dirinya sendiri
    closePicker();
  });
  if(pickerList){
    pickerList.addEventListener('click', function(e){
      var item = e.target.closest('.pk-item');
      if(!item || item.classList.contains('editing')) return;
      var id = item.getAttribute('data-id');
      var actionBtn = e.target.closest('button[data-action]');
      if(actionBtn){
        e.stopPropagation();
        if(actionBtn.getAttribute('data-action') === 'rename') startInlineRename(item, id);
        if(actionBtn.getAttribute('data-action') === 'delete') deleteDataset(id);
        return;
      }
      pickDataset(id);
    });
    pickerList.addEventListener('keydown', function(e){
      var item = e.target.closest('.pk-item');
      if(!item || e.target !== item) return;
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pickDataset(item.getAttribute('data-id')); }
      if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
        e.preventDefault();
        var sib = e.key === 'ArrowDown' ? item.nextElementSibling : item.previousElementSibling;
        if(sib && sib.classList.contains('pk-item')) sib.focus();
      }
    });
  }
  function pickDataset(id){
    if(sameId(id, state.activeDatasetId)){ closePicker(); return; }
    var item = pickerList && pickerList.querySelector('.pk-item[data-id="' + id + '"]');
    if(item){
      item.classList.add('loading');
      var av = item.querySelector('.pk-avatar'); if(av) av.innerHTML = '<span class="pk-spin"></span>';
      var mt = item.querySelector('.pk-meta'); if(mt) mt.innerHTML = '<span>Memuat data\u2026</span>';
    }
    if(pickerList) pickerList.classList.add('busy');
    switchToDataset(id).then(function(ok){
      if(pickerList) pickerList.classList.remove('busy');
      if(ok){
        closePicker();
        var sc = document.getElementById('sidebarClose');
        if(sc && sc.offsetParent !== null) sc.click(); // tutup drawer sidebar di layar kecil
      } else {
        renderPicker();
      }
    });
  }

  function refreshDatasets(){
    return Api.datasets.list().then(function(list){
      state.datasets = list;
      renderList();
      return list;
    });
  }

  function setActiveDatasetLabel(name){
    ['activeDatasetName','activeDatasetNameLanding'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.textContent = name || '—';
    });
    renderSwitcher();
  }

  function switchToDataset(id){
    var ds = findDataset(id);
    if(!ds) return Promise.resolve(false);
    clearError();
    var pill = document.getElementById('dataStatusPill');
    var prevActive = pill ? pill.classList.contains('active') : false;
    var prevTxt = (document.getElementById('dataStatusTxt') || {}).textContent || 'Belum ada data';
    setStatusPill(true, ds.name + ' \u2014 memuat\u2026');
    if(switcherMeta) switcherMeta.textContent = 'Memuat ' + ds.name + '\u2026';
    return Api.orders.load(ds.id).then(function(res){
      state.activeDatasetId = ds.id;
      state.preprocessing = { totalRawRows: res.records.length, missingDateDropped:0, duplicatesRemoved:0, validRows: res.records.length, colMap:null, restored:true };
      setActiveDatasetLabel(ds.name);
      setRecords(res.records, ds.name + ' \u2014 ' + res.records.length.toLocaleString('id-ID') + ' baris');
      renderList();
      return true;
    }).catch(function(err){
      console.error('[dataset] gagal memuat', err);
      setStatusPill(prevActive, prevTxt);
      renderSwitcher();
      var msg = 'Gagal memuat dataset "' + ds.name + '": ' + (err && err.message ? err.message : err);
      showError(msg);
      dsToast(msg, 'error');
      return false;
    });
  }

  function renameDataset(id){
    var ds = findDataset(id);
    if(!ds) return;
    var name = window.prompt('Nama baru untuk dataset ini:', ds.name);
    if(name === null) return;
    name = name.trim();
    if(!name) return;
    Api.datasets.rename(ds.id, name).then(function(updated){
      ds.name = updated.name;
      renderList();
      if(sameId(state.activeDatasetId, ds.id)) setActiveDatasetLabel(updated.name);
    }).catch(function(err){ console.error(err); showError('Gagal mengganti nama: ' + err.message); dsToast('Gagal mengganti nama: ' + err.message, 'error'); });
  }

  function deleteDataset(id){
    var ds = findDataset(id);
    if(!ds) return;
    showConfirmModal({
      title: 'Hapus dataset "' + ds.name + '"?',
      desc: 'Seluruh baris pesanan pada dataset ini akan dihapus permanen dari database. Tindakan ini tidak bisa dibatalkan.',
      confirmText: 'Ya, hapus dataset',
      cancelText: 'Batal',
      danger: true
    }).then(function(ok){
      if(!ok) return;
      Api.datasets.remove(ds.id).then(function(){
        state.datasets = state.datasets.filter(function(d){ return !sameId(d.id, ds.id); });
        var wasActive = sameId(state.activeDatasetId, ds.id);
        if(wasActive){
          state.activeDatasetId = null;
          state.records = [];
          setActiveDatasetLabel(null);
        }
        renderList();
        if(wasActive){
          if(state.datasets.length){
            // masih ada dataset lain: langsung pindah ke sana, tetap di dashboard
            switchToDataset(state.datasets[0].id).then(function(ok){
              if(ok) closePicker();
            });
          } else {
            document.getElementById('dashboard').classList.remove('show');
            setStatusPill(false, 'Belum ada data');
          }
        }
        dsToast('Dataset dihapus');
      }).catch(function(err){ console.error(err); showError('Gagal menghapus dataset: ' + err.message); dsToast('Gagal menghapus dataset: ' + err.message, 'error'); });
    });
  }

  [addBtnLanding].forEach(function(btn){
    if(btn) btn.addEventListener('click', function(){ document.getElementById('fileInput').click(); });
  });

  // Tombol "Ganti dataset" di sidebar: buka popup pemilih dataset (sama dengan kartu "Dataset aktif"),
  // bukan kembali ke halaman awal.
  if(backBtn) backBtn.addEventListener('click', openPicker);

  // Daftar "Dataset Anda" di halaman awal: klik untuk membuka dataset, tombol ✎ / ✕ untuk ganti nama / hapus.
  if(listElLanding){
    listElLanding.addEventListener('click', function(e){
      var item = e.target.closest('.dataset-item');
      if(!item) return;
      var id = item.getAttribute('data-id');
      var actionBtn = e.target.closest('button[data-action]');
      if(actionBtn){
        if(actionBtn.getAttribute('data-action') === 'rename') renameDataset(id);
        if(actionBtn.getAttribute('data-action') === 'delete') deleteDataset(id);
        return;
      }
      if(item.classList.contains('loading')) return;
      item.classList.add('loading');
      switchToDataset(id).then(function(){ item.classList.remove('loading'); });
    });
  }

  document.addEventListener('auth:ready', function(){
    refreshDatasets().then(function(list){
      if(list.length){
        switchToDataset(list[0].id);
      } else {
        setStatusPill(false, 'Belum ada data');
      }
    }).catch(function(err){ console.error(err); setStatusPill(false, 'Gagal memuat daftar dataset (periksa koneksi)'); });
  });

  return { refresh: refreshDatasets, renderList: renderList, switchTo: switchToDataset, setActiveLabel: setActiveDatasetLabel };
})();

/* ---------------- Popup "Tambah dataset baru": pratinjau sebelum disimpan ---------------- */
var stagedNewDatasetRecords = null;
var stagedNewDatasetSource = null;

function openNewDatasetModal(records, fileName){
  stagedNewDatasetRecords = records;
  stagedNewDatasetSource = fileName;
  var orders = uniqueOrders(records);
  var byDay = groupByDay(orders);
  var days = Object.keys(byDay).sort();
  var rowsEl = document.getElementById('newDatasetStatRows');
  var startEl = document.getElementById('newDatasetStatStart');
  var endEl = document.getElementById('newDatasetStatEnd');
  if(rowsEl) rowsEl.textContent = records.length.toLocaleString('id-ID');
  if(startEl) startEl.textContent = days.length ? fmtDayShort(days[0]) : '—';
  if(endEl) endEl.textContent = days.length ? fmtDayShort(days[days.length-1]) : '—';
  var input = document.getElementById('newDatasetName');
  if(input) input.value = fileName.replace(/\.[^.]+$/, '');
  var errEl = document.getElementById('newDatasetError');
  if(errEl) errEl.classList.remove('show');
  var overlay = document.getElementById('newDatasetModalOverlay');
  if(overlay) overlay.classList.add('show');
  if(input) input.focus();
}

function closeNewDatasetModal(){
  stagedNewDatasetRecords = null;
  stagedNewDatasetSource = null;
  var overlay = document.getElementById('newDatasetModalOverlay');
  if(overlay) overlay.classList.remove('show');
}

(function(){
  var overlay = document.getElementById('newDatasetModalOverlay');
  var cancelBtn = document.getElementById('newDatasetCancel');
  var confirmBtn = document.getElementById('newDatasetConfirm');
  if(cancelBtn) cancelBtn.addEventListener('click', closeNewDatasetModal);
  if(overlay) overlay.addEventListener('click', function(e){ if(e.target === overlay) closeNewDatasetModal(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && overlay && overlay.classList.contains('show')) closeNewDatasetModal();
  });
  if(confirmBtn) confirmBtn.addEventListener('click', function(){
    var input = document.getElementById('newDatasetName');
    var errEl = document.getElementById('newDatasetError');
    var name = input ? input.value.trim() : '';
    if(!name){ if(errEl){ errEl.textContent = 'Nama dataset wajib diisi.'; errEl.classList.add('show'); } return; }
    if(!stagedNewDatasetRecords){ closeNewDatasetModal(); return; }
    if(errEl) errEl.classList.remove('show');
    var records = stagedNewDatasetRecords, source = stagedNewDatasetSource;
    var originalLabel = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Menyimpan…';
    Api.datasets.create(name, source).then(function(ds){
      return Api.orders.save(ds.id, records, source, function(done, total){
        confirmBtn.textContent = 'Menyimpan ' + done + '/' + total + '…';
      }).then(function(){ return ds; });
    }).then(function(ds){
      closeNewDatasetModal();
      state.activeDatasetId = ds.id;
      DatasetsUI.refresh().then(function(){
        var el = document.getElementById('activeDatasetName');
        if(el) el.textContent = name;
        var elL = document.getElementById('activeDatasetNameLanding');
        if(elL) elL.textContent = name;
        setRecords(records, name + ' — tersimpan sebagai dataset baru');
      });
    }).catch(function(err){
      if(errEl){ errEl.textContent = 'Gagal menyimpan dataset: ' + err.message; errEl.classList.add('show'); }
    }).then(function(){
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalLabel;
    });
  });
})();
