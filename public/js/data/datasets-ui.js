"use strict";

/* ---------------- Manajer dataset: daftar, ganti nama, hapus, pindah aktif ---------------- */
var DatasetsUI = (function(){
  var listElLanding = document.getElementById('datasetListLanding');
  var listElSidebar = document.getElementById('datasetListSidebar');
  var addBtnLanding = document.getElementById('btnAddDatasetLanding');
  var addBtnSidebar = document.getElementById('btnAddDatasetSidebar');
  var backBtn = document.getElementById('btnBackToDatasets');

  function fmtDate(iso){
    if(!iso) return '—';
    var d = new Date(iso);
    if(isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'});
  }

  function findDataset(id){
    for(var i=0;i<state.datasets.length;i++){ if(state.datasets[i].id === id) return state.datasets[i]; }
    return null;
  }

  function renderList(){
    var html;
    if(!state.datasets.length){
      html = '<div class="dataset-empty">Belum ada dataset. Tambahkan yang pertama lewat tombol di bawah.</div>';
    } else {
      html = state.datasets.map(function(ds){
        var active = ds.id === state.activeDatasetId;
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
    if(listElSidebar) listElSidebar.innerHTML = html;
    if(typeof renderComparePicker === 'function') renderComparePicker();
  }

  function bindListClicks(container){
    if(!container) return;
    container.addEventListener('click', function(e){
      var item = e.target.closest('.dataset-item');
      if(!item) return;
      var id = parseInt(item.getAttribute('data-id'), 10);
      var actionBtn = e.target.closest('button[data-action]');
      if(actionBtn){
        e.stopPropagation();
        var action = actionBtn.getAttribute('data-action');
        if(action === 'rename') renameDataset(id);
        if(action === 'delete') deleteDataset(id);
        return;
      }
      switchToDataset(id);
    });
  }
  bindListClicks(listElLanding);
  bindListClicks(listElSidebar);

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
  }

  function switchToDataset(id){
    var ds = findDataset(id);
    if(!ds) return;
    clearError();
    setStatusPill(true, ds.name + ' — memuat…');
    Api.orders.load(id).then(function(res){
      state.activeDatasetId = id;
      state.preprocessing = { totalRawRows: res.records.length, missingDateDropped:0, duplicatesRemoved:0, validRows: res.records.length, colMap:null, restored:true };
      setActiveDatasetLabel(ds.name);
      setRecords(res.records, ds.name + ' — ' + res.records.length.toLocaleString('id-ID') + ' baris');
      renderList();
    }).catch(function(err){
      setStatusPill(false, 'Belum ada data');
      showError('Gagal memuat dataset "' + ds.name + '": ' + err.message);
    });
  }

  function renameDataset(id){
    var ds = findDataset(id);
    if(!ds) return;
    var name = window.prompt('Nama baru untuk dataset ini:', ds.name);
    if(name === null) return;
    name = name.trim();
    if(!name) return;
    Api.datasets.rename(id, name).then(function(updated){
      ds.name = updated.name;
      renderList();
      if(state.activeDatasetId === id) setActiveDatasetLabel(updated.name);
    }).catch(function(err){ showError('Gagal mengganti nama: ' + err.message); });
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
      Api.datasets.remove(id).then(function(){
        state.datasets = state.datasets.filter(function(d){ return d.id !== id; });
        if(state.activeDatasetId === id){
          state.activeDatasetId = null;
          state.records = [];
          document.getElementById('dashboard').classList.remove('show');
          setStatusPill(false, 'Belum ada data');
          setActiveDatasetLabel(null);
        }
        renderList();
      }).catch(function(err){ showError('Gagal menghapus dataset: ' + err.message); });
    });
  }

  [addBtnLanding, addBtnSidebar].forEach(function(btn){
    if(btn) btn.addEventListener('click', function(){ document.getElementById('fileInput').click(); });
  });

  if(backBtn){
    backBtn.addEventListener('click', function(){
      document.getElementById('dashboard').classList.remove('show');
    });
  }

  document.addEventListener('auth:ready', function(){
    refreshDatasets().then(function(list){
      if(list.length){
        switchToDataset(list[0].id);
      } else {
        setStatusPill(false, 'Belum ada data');
      }
    });
  });

  return { refresh: refreshDatasets, renderList: renderList, switchTo: switchToDataset };
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
