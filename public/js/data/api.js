"use strict";

/* ---------------- Api: komunikasi dengan backend (Vercel Functions + Neon) ----------------
   - loadDemo()            : ambil data contoh statis (/data/demo-orders.json)
   - loadOrders()          : ambil semua pesanan dari database (per halaman)
   - saveOrders(...)       : ganti isi database dengan data baru (dikirim per potongan)
   - clearOrders()         : hapus semua data di database
   Jika server meminta kata sandi (APP_PASSWORD), akan muncul prompt sekali per sesi. */
var Api = (function(){
  var TOKEN_KEY = 'sales-dash-token';
  var PAGE_SIZE = 5000;   // baris per permintaan GET
  var CHUNK_SIZE = 2000;  // baris per permintaan POST (batas body Vercel 4,5 MB)

  function getToken(){ try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch(e){ return ''; } }
  function setToken(t){ try { sessionStorage.setItem(TOKEN_KEY, t); } catch(e){} }

  function request(method, url, body, retried){
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if(token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function(res){
        if(res.status === 401 && !retried){
          var pw = window.prompt('Masukkan kata sandi dasbor:');
          if(pw === null || pw === '') throw new Error('Kata sandi diperlukan untuk mengakses database.');
          setToken(pw);
          return request(method, url, body, true);
        }
        return res.json().catch(function(){ return {}; }).then(function(data){
          if(!res.ok) throw new Error(data.error || ('Permintaan gagal (' + res.status + ')'));
          return data;
        });
      });
  }

  function pad(n){ return String(n).padStart(2, '0'); }
  // Waktu lokal tanpa zona (YYYY-MM-DDTHH:mm:ss) agar hari/jam tidak bergeser saat disimpan.
  function toLocalIso(v){
    var d = toDate(v);
    if(!d) return null;
    return dayKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function serialize(r){
    return {
      order_id: r.order_id, status: r.status, created_at: toLocalIso(r.created_at),
      payment_method: r.payment_method, product: r.product, variation: r.variation,
      price: r.price, qty: r.qty, subtotal: r.subtotal, total_payment: r.total_payment,
      city: r.city, province: r.province, customer_id: r.customer_id || ''
    };
  }

  function loadDemo(){
    return fetch('/data/demo-orders.json').then(function(res){
      if(!res.ok) throw new Error('Berkas data contoh tidak ditemukan.');
      return res.json();
    });
  }

  function loadOrders(){
    var all = [], source = null;
    function next(offset){
      return request('GET', '/api/orders?offset=' + offset + '&limit=' + PAGE_SIZE).then(function(data){
        source = data.source || source;
        all = all.concat(data.rows);
        if(all.length < data.total && data.rows.length) return next(all.length);
        return { records: all, source: source };
      });
    }
    return next(0);
  }

  function saveOrders(records, source, onProgress){
    var rows = records.map(serialize).filter(function(r){ return r.created_at; });
    var total = rows.length, sent = 0;
    function next(){
      if(sent >= total) return Promise.resolve();
      var chunk = rows.slice(sent, sent + CHUNK_SIZE);
      return request('POST', '/api/orders', { rows: chunk, replace: sent === 0, source: source }).then(function(){
        sent += chunk.length;
        if(onProgress) onProgress(sent, total);
        return next();
      });
    }
    return next();
  }

  function clearOrders(){ return request('DELETE', '/api/orders'); }

  return { loadDemo: loadDemo, loadOrders: loadOrders, saveOrders: saveOrders, clearOrders: clearOrders };
})();
