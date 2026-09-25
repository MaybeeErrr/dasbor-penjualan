"use strict";

/* ---------------- Api: komunikasi dengan backend (Vercel Functions + Neon) ----------------
   - auth.register/login/logout/restoreSession : akun per pengguna (token disimpan di localStorage)
   - datasets.list/create/rename/remove         : dataset penjualan milik akun yang sedang login
   - orders.load/save/clear                     : baris pesanan, selalu terikat ke satu datasetId
   - loadDemo()                                 : ambil data contoh statis (/data/demo-orders.json) */
var Api = (function(){
  var TOKEN_KEY = 'sales-dash-auth-token';
  var PAGE_SIZE = 5000;   // baris per permintaan GET
  var CHUNK_SIZE = 2000;  // baris per permintaan POST (batas body Vercel 4,5 MB)

  function getToken(){ try { return localStorage.getItem(TOKEN_KEY) || ''; } catch(e){ return ''; } }
  function setToken(t){ try { if(t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch(e){} }

  function request(method, url, body){
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if(token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function(res){
        return res.json().catch(function(){ return {}; }).then(function(data){
          if(!res.ok){
            var err = new Error(data.error || ('Permintaan gagal (' + res.status + ')'));
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
  }

  /* ---------------- Akun ---------------- */
  function register(username, password){
    return request('POST', '/api/auth', { action:'register', username: username, password: password })
      .then(function(d){ setToken(d.token); return d; });
  }
  function login(username, password){
    return request('POST', '/api/auth', { action:'login', username: username, password: password })
      .then(function(d){ setToken(d.token); return d; });
  }
  function logout(){ setToken(''); }
  function restoreSession(){
    if(!getToken()) return Promise.reject(new Error('Belum masuk.'));
    return request('GET', '/api/auth');
  }

  /* ---------------- Dataset ---------------- */
  function listDatasets(){ return request('GET', '/api/datasets').then(function(d){ return d.datasets; }); }
  function createDataset(name, source){ return request('POST', '/api/datasets', { name: name, source: source }).then(function(d){ return d.dataset; }); }
  function renameDataset(id, name){ return request('PATCH', '/api/datasets?id=' + id, { name: name }).then(function(d){ return d.dataset; }); }
  function removeDataset(id){ return request('DELETE', '/api/datasets?id=' + id); }

  /* ---------------- Pesanan (per dataset) ---------------- */
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

  function loadOrders(datasetId){
    var all = [], source = null;
    function next(offset){
      return request('GET', '/api/orders?datasetId=' + datasetId + '&offset=' + offset + '&limit=' + PAGE_SIZE).then(function(data){
        source = data.source || source;
        all = all.concat(data.rows);
        if(all.length < data.total && data.rows.length) return next(all.length);
        return { records: all, source: source };
      });
    }
    return next(0);
  }

  function saveOrders(datasetId, records, source, onProgress){
    var rows = records.map(serialize).filter(function(r){ return r.created_at; });
    var total = rows.length, sent = 0;
    function next(){
      if(sent >= total) return Promise.resolve();
      var chunk = rows.slice(sent, sent + CHUNK_SIZE);
      return request('POST', '/api/orders?datasetId=' + datasetId, { rows: chunk, replace: sent === 0, source: source }).then(function(){
        sent += chunk.length;
        if(onProgress) onProgress(sent, total);
        return next();
      });
    }
    return next();
  }

  function clearOrders(datasetId){ return request('DELETE', '/api/orders?datasetId=' + datasetId); }

  function loadDemo(){
    return fetch('/data/demo-orders.json').then(function(res){
      if(!res.ok) throw new Error('Berkas data contoh tidak ditemukan.');
      return res.json();
    });
  }

  return {
    hasToken: function(){ return !!getToken(); },
    auth: { register: register, login: login, logout: logout, restoreSession: restoreSession },
    datasets: { list: listDatasets, create: createDataset, rename: renameDataset, remove: removeDataset },
    orders: { load: loadOrders, save: saveOrders, clear: clearOrders },
    loadDemo: loadDemo
  };
})();
