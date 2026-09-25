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

/* ---------------- Confirm modal (dipakai sebelum menghapus/mengganti data) ---------------- */
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

// Jika sudah ada data yang dimuat, minta konfirmasi sebelum menjalankan
// aksi yang akan menggantikan/menghapusnya (unggah berkas baru, muat data
// contoh, atau bersihkan data) — supaya tidak langsung hilang tanpa sengaja.
function withReplaceConfirm(action, opts){
  if(state.records && state.records.length){
    showConfirmModal(opts).then(function(ok){ if(ok) action(); else if(opts.onCancel) opts.onCancel(); });
  } else {
    action();
  }
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
  withReplaceConfirm(function(){ handleFile(f); }, {
    title: 'Ganti data yang sudah dimuat?',
    desc: 'Anda sudah memiliki data pesanan aktif di dasbor ini. Mengunggah "' + f.name + '" akan menggantikan data tersebut sepenuhnya, dan tidak bisa dibatalkan setelah diproses.',
    confirmText: 'Ya, ganti data',
    cancelText: 'Batal',
    danger: true,
    onCancel: function(){ fileInput.value = ''; }
  });
});
fileInput.addEventListener('change', function(e){
  var f = e.target.files && e.target.files[0];
  if(!f) return;
  withReplaceConfirm(function(){ handleFile(f); }, {
    title: 'Ganti data yang sudah dimuat?',
    desc: 'Anda sudah memiliki data pesanan aktif di dasbor ini. Mengunggah "' + f.name + '" akan menggantikan data tersebut sepenuhnya, dan tidak bisa dibatalkan setelah diproses.',
    confirmText: 'Ya, ganti data',
    cancelText: 'Batal',
    danger: true,
    onCancel: function(){ fileInput.value = ''; }
  });
});

function setProcessing(active){
  var dz = document.getElementById('dropzone');
  var txt = document.getElementById('dropzoneMainTxt');
  var pill = document.getElementById('dataStatusPill');
  var pillTxt = document.getElementById('dataStatusTxt');
  if(dz) dz.classList.toggle('busy', !!active);
  if(txt) txt.textContent = active ? 'Memproses berkas…' : 'Seret berkas ke sini, atau klik untuk memilih';
  if(active && pill && pillTxt){ pill.classList.add('busy'); pillTxt.textContent = 'Memproses data…'; }
  else if(pill){ pill.classList.remove('busy'); }
}

// Simpan hasil unggahan ke database Neon (lewat /api/orders), dikirim per potongan.
function persistRecords(records, source){
  setStatusPill(true, source + ' — menyimpan ke database…');
  Api.saveOrders(records, source, function(done, total){
    setStatusPill(true, source + ' — menyimpan ' + done + '/' + total + '…');
  }).then(function(){
    setStatusPill(true, source + ' — tersimpan di database');
  }).catch(function(err){
    setStatusPill(true, source);
    showError('Data tampil di dasbor, tetapi gagal disimpan ke database: ' + err.message);
  });
}

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
      setRecords(records, file.name);
      persistRecords(records, file.name);
    } catch(err){
      showError(err.message || 'Format berkas tidak dikenali. Periksa kembali kolom pada berkas Anda.');
    } finally {
      setProcessing(false);
    }
  };
  if(isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

document.getElementById('btnDemo').addEventListener('click', function(){
  clearError();
  function loadDemo(){
    Api.loadDemo().then(function(raw){
      setRecords(normalizeDemoRecords(raw), 'Data contoh — rekap pesanan Januari 2026');
    }).catch(function(err){ showError('Gagal memuat data contoh: ' + err.message); });
  }
  withReplaceConfirm(loadDemo, {
    title: 'Ganti dengan data contoh?',
    desc: 'Anda sudah memiliki data pesanan aktif di dasbor ini. Memuat data contoh akan menggantikan tampilan data tersebut. Data yang tersimpan di database tidak diubah.',
    confirmText: 'Ya, pakai data contoh',
    cancelText: 'Batal',
    danger: true
  });
});
function performClearData(){
  clearError();
  fileInput.value = '';
  state.records = [];
  document.getElementById('dashboard').classList.remove('show');
  setStatusPill(false, 'Belum ada data');
  Api.clearOrders().catch(function(err){ showError('Gagal menghapus data di database: ' + err.message); });
}
document.getElementById('btnClear').addEventListener('click', function(){
  if(!state.records || !state.records.length){ performClearData(); return; }
  showConfirmModal({
    title: 'Hapus data saat ini?',
    desc: 'Data pesanan yang sudah dimuat akan dihapus dari dasbor ini (termasuk dari database Neon). Tindakan ini tidak bisa dibatalkan.',
    confirmText: 'Ya, hapus data',
    cancelText: 'Batal',
    danger: true
  }).then(function(ok){ if(ok) performClearData(); });
});

function setStatusPill(active, text){
  var pill = document.getElementById('dataStatusPill');
  pill.classList.toggle('active', !!active);
  document.getElementById('dataStatusTxt').textContent = text;
}
