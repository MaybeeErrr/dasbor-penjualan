"use strict";

/* ---------------- File handling ---------------- */
var dropzone = document.getElementById('dropzone');
var fileInput = document.getElementById('fileInput');
var uploadError = document.getElementById('uploadError');

function showError(msg){
  uploadError.textContent = msg;
  uploadError.classList.add('show');
}
function clearError(){
  uploadError.classList.remove('show');
  uploadError.textContent = '';
}

/* ---------------- Confirm modal (dipakai untuk hapus dataset, dsb.) ---------------- */
var confirmModalOverlay = document.getElementById('confirmModalOverlay');
var confirmModalTitle = document.getElementById('confirmModalTitle');
var confirmModalDesc = document.getElementById('confirmModalDesc');
var confirmModalCancel = document.getElementById('confirmModalCancel');
var confirmModalConfirm = document.getElementById('confirmModalConfirm');

function showConfirmModal(opts){
  return new Promise(function(resolve){
    if(!confirmModalOverlay || !confirmModalTitle || !confirmModalDesc || !confirmModalCancel || !confirmModalConfirm){
      resolve(true); // fallback: jika markup modal tidak ada, langsung lanjutkan aksi
      return;
    }
    confirmModalTitle.textContent = opts.title || 'Konfirmasi';
    confirmModalDesc.textContent = opts.desc || '';
    confirmModalConfirm.textContent = opts.confirmText || 'Lanjutkan';
    confirmModalCancel.textContent = opts.cancelText || 'Batal';
    confirmModalConfirm.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');

    var settled = false;
    function cleanup(result){
      if(settled) return;
      settled = true;
      confirmModalOverlay.classList.remove('show');
      confirmModalConfirm.removeEventListener('click', onConfirm);
      confirmModalCancel.removeEventListener('click', onCancel);
      confirmModalOverlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onConfirm(){ cleanup(true); }
    function onCancel(){ cleanup(false); }
    function onOverlayClick(e){ if(e.target === confirmModalOverlay) cleanup(false); }
    function onKeydown(e){ if(e.key === 'Escape') cleanup(false); }

    confirmModalConfirm.addEventListener('click', onConfirm);
    confirmModalCancel.addEventListener('click', onCancel);
    confirmModalOverlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
    confirmModalOverlay.classList.add('show');
    confirmModalConfirm.focus();
  });
}

dropzone.addEventListener('click', function(){ fileInput.click(); });
dropzone.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); } });
['dragenter','dragover'].forEach(function(evt){
  dropzone.addEventListener(evt, function(e){ e.preventDefault(); dropzone.classList.add('drag'); });
});
['dragleave','drop'].forEach(function(evt){
  dropzone.addEventListener(evt, function(e){ e.preventDefault(); dropzone.classList.remove('drag'); });
});
dropzone.addEventListener('drop', function(e){
  var f = e.dataTransfer.files && e.dataTransfer.files[0];
  if(!f) return;
  handleFile(f);
});
fileInput.addEventListener('change', function(e){
  var f = e.target.files && e.target.files[0];
  if(!f) return;
  handleFile(f);
});

function setProcessing(active){
  var dz = document.getElementById('dropzone');
  var txt = document.getElementById('dropzoneMainTxt');
  if(dz) dz.classList.toggle('busy', !!active);
  if(txt) txt.textContent = active ? 'Membaca berkas…' : 'Seret berkas ke sini, atau klik untuk memilih';
}

// Membaca & memetakan berkas, lalu membuka popup pratinjau (belum disimpan
// ke database sampai pengguna menekan "Simpan sebagai dataset baru").
function handleFile(file){
  clearError();
  setProcessing(true);
  var name = file.name.toLowerCase();
  var isCsv = name.endsWith('.csv');
  var reader = new FileReader();
  reader.onerror = function(){ setProcessing(false); showError('Gagal membaca berkas. Coba lagi.'); };
  reader.onload = function(e){
    try {
      var wb;
      if(isCsv){
        wb = XLSX.read(e.target.result, {type:'string', cellDates:true});
      } else {
        wb = XLSX.read(e.target.result, {type:'array', cellDates:true});
      }
      var sheetName = wb.SheetNames[0];
      var sheet = wb.Sheets[sheetName];
      var rows = XLSX.utils.sheet_to_json(sheet, {defval:''});
      var records = mapRowsToRecords(rows);
      if(!records.length) throw new Error('Tidak ada baris data yang valid ditemukan setelah membaca berkas.');
      openNewDatasetModal(records, file.name);
    } catch(err){
      showError(err.message || 'Format berkas tidak dikenali. Periksa kembali kolom pada berkas Anda.');
    } finally {
      setProcessing(false);
      fileInput.value = '';
    }
  };
  if(isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

document.getElementById('btnDemo').addEventListener('click', function(){
  clearError();
  Api.loadDemo().then(function(raw){
    state.activeDatasetId = null;
    state.preprocessing = null;
    setActiveDatasetLabel(null);
    setRecords(normalizeDemoRecords(raw), 'Data contoh — rekap pesanan Januari 2026 (pratinjau, tidak disimpan)');
  }).catch(function(err){ showError('Gagal memuat data contoh: ' + err.message); });
});

function setStatusPill(active, text){
  var pill = document.getElementById('dataStatusPill');
  pill.classList.toggle('active', !!active);
  document.getElementById('dataStatusTxt').textContent = text;
}
