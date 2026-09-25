"use strict";

// Init: hitung statistik data contoh (statis), lalu muat data tersimpan dari database Neon.
(function init(){
  setStatusPill(false, 'Memuat data…');
  Api.loadDemo()
    .then(function(raw){
      var demoRecords = normalizeDemoRecords(raw);
      var demoOrders = uniqueOrders(demoRecords);
      var demoDays = Object.keys(groupByDay(demoOrders)).length;
      document.getElementById('heroDemoOrders').textContent = demoOrders.length.toLocaleString('id-ID');
      document.getElementById('heroDemoDays').textContent = demoDays;
    })
    .catch(function(){ /* data contoh opsional */ })
    .then(function(){ return Api.loadOrders(); })
    .then(function(res){
      if(res && res.records.length){
        state.preprocessing = { totalRawRows: res.records.length, missingDateDropped:0, duplicatesRemoved:0, validRows: res.records.length, colMap:null, restored:true };
        setRecords(res.records, (res.source || 'Data tersimpan') + ' (dari database)');
      } else {
        setStatusPill(false, 'Belum ada data');
      }
    })
    .catch(function(err){
      setStatusPill(false, 'Belum ada data');
      showError('Tidak dapat memuat data dari database: ' + err.message);
    });
})();
