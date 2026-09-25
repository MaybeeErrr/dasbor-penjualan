"use strict";

// Init: hitung statistik data contoh (statis) untuk ditampilkan di halaman
// landing sebelum pengguna masuk. Pemuatan dataset sungguhan terjadi setelah
// login berhasil (lihat event "auth:ready" di data/datasets-ui.js).
(function init(){
  Api.loadDemo()
    .then(function(raw){
      // normalizeDemoRecords menulis ke state.preprocessing sebagai efek samping;
      // simpan & pulihkan supaya tidak menimpa status dataset yang sedang aktif.
      var savedPreprocessing = state.preprocessing;
      var demoRecords = normalizeDemoRecords(raw);
      state.preprocessing = savedPreprocessing;
      var demoOrders = uniqueOrders(demoRecords);
      var demoDays = Object.keys(groupByDay(demoOrders)).length;
      document.getElementById('heroDemoOrders').textContent = demoOrders.length.toLocaleString('id-ID');
      document.getElementById('heroDemoDays').textContent = demoDays;
    })
    .catch(function(){ /* data contoh opsional */ });
})();
