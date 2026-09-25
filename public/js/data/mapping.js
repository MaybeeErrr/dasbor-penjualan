"use strict";

/* ---------------- Column mapping ---------------- */
var COLUMN_ALIASES = {
  order_id: ['no. pesanan','no pesanan','order id','order no','nomor pesanan'],
  status: ['status pesanan','status'],
  created_at: ['waktu pesanan dibuat','tanggal pesanan','tanggal','order date','created at','waktu pesanan'],
  payment_method: ['metode pembayaran','payment method','metode bayar'],
  product: ['nama produk','product name','produk'],
  variation: ['nama variasi','variation'],
  price: ['harga setelah diskon','harga','price'],
  qty: ['jumlah','qty','quantity'],
  subtotal: ['subtotal pesanan','subtotal'],
  total_payment: ['total pembayaran','total payment','total'],
  city: ['kota/kabupaten','kota','city'],
  province: ['provinsi','province'],
  customer_id: ['username (pembeli)','username pembeli','username','id pembeli','id pelanggan','nama pembeli','customer id','customer_id','no. handphone','no handphone','nomor handphone','email (pembeli)','email pembeli','email']
};

function normalizeHeader(h){
  return String(h || '').trim().toLowerCase();
}

// ---- Preprocessing stats: dicatat setiap kali data baru dipetakan/dimuat,
// lalu ditampilkan apa adanya pada panel "Preprocessing & Validasi Data" ----
var FIELD_LABELS = {
  order_id:'No. Pesanan', status:'Status Pesanan', created_at:'Waktu/Tanggal Pesanan', payment_method:'Metode Pembayaran',
  product:'Nama Produk', variation:'Nama Variasi', price:'Harga', qty:'Jumlah', subtotal:'Subtotal Pesanan',
  total_payment:'Total Pembayaran', city:'Kota/Kabupaten', province:'Provinsi', customer_id:'Identitas Pelanggan'
};
state.preprocessing = null;

function finalizeRecords(mapped, totalRaw, colMap){
  var missingDate = 0;
  var withValidDate = mapped.filter(function(rec){
    var ok = toDate(rec.created_at) !== null;
    if(!ok) missingDate++;
    return ok;
  });
  var seen = {};
  var deduped = [];
  var dupCount = 0;
  withValidDate.forEach(function(rec){
    var key = [rec.order_id, rec.product, rec.variation, rec.price, rec.qty, rec.subtotal, rec.total_payment, String(rec.created_at)].join('||');
    if(seen[key]){ dupCount++; return; }
    seen[key] = true;
    deduped.push(rec);
  });
  state.preprocessing = {
    totalRawRows: totalRaw,
    missingDateDropped: missingDate,
    duplicatesRemoved: dupCount,
    validRows: deduped.length,
    colMap: colMap || null
  };
  return deduped;
}

function mapRowsToRecords(rows){
  if(!rows || !rows.length) throw new Error('Berkas tidak berisi data.');
  var headers = Object.keys(rows[0]);
  var normHeaders = headers.map(normalizeHeader);
  var colMap = {};
  Object.keys(COLUMN_ALIASES).forEach(function(field){
    var aliases = COLUMN_ALIASES[field];
    for(var i=0;i<headers.length;i++){
      if(aliases.indexOf(normHeaders[i]) !== -1){ colMap[field] = headers[i]; break; }
    }
  });
  var required = ['created_at'];
  var hasAmount = colMap.total_payment || colMap.subtotal;
  var missing = required.filter(function(f){ return !colMap[f]; });
  if(!hasAmount) missing.push('total_payment/subtotal');
  if(missing.length){
    throw new Error('Kolom wajib tidak ditemukan: ' + missing.join(', ') + '. Pastikan berkas memiliki kolom tanggal dan nilai transaksi.');
  }
  var mapped = rows.map(function(r){
    return {
      order_id: colMap.order_id ? r[colMap.order_id] : (r[colMap.created_at] + '-' + Math.random()),
      status: colMap.status ? String(r[colMap.status] || '').trim() : 'Selesai',
      created_at: colMap.created_at ? r[colMap.created_at] : null,
      payment_method: colMap.payment_method ? String(r[colMap.payment_method] || '').trim() : 'Tidak diketahui',
      product: colMap.product ? String(r[colMap.product] || '').trim() : 'Tidak diketahui',
      variation: colMap.variation ? String(r[colMap.variation] || '').trim() : '',
      price: colMap.price ? parseIDNumber(r[colMap.price]) : 0,
      qty: colMap.qty ? parseIDNumber(r[colMap.qty]) : 1,
      subtotal: colMap.subtotal ? parseIDNumber(r[colMap.subtotal]) : parseIDNumber(r[colMap.total_payment] ? r[colMap.total_payment] : 0),
      total_payment: colMap.total_payment ? parseIDNumber(r[colMap.total_payment]) : parseIDNumber(r[colMap.subtotal] ? r[colMap.subtotal] : 0),
      city: colMap.city ? String(r[colMap.city] || '').trim() : '',
      province: colMap.province ? String(r[colMap.province] || '').trim() : '',
      customer_id: colMap.customer_id ? String(r[colMap.customer_id] || '').trim() : ''
    };
  });
  return finalizeRecords(mapped, rows.length, colMap);
}

function normalizeDemoRecords(raw){
  var mapped = raw.map(function(r){
    return {
      order_id: r.order_id,
      status: r.status || 'Selesai',
      created_at: r.created_at,
      payment_method: r.payment_method || 'Tidak diketahui',
      product: r.product || 'Tidak diketahui',
      variation: r.variation || '',
      price: parseIDNumber(r.price),
      qty: parseIDNumber(r.qty),
      subtotal: parseIDNumber(r.subtotal),
      total_payment: parseIDNumber(r.total_payment),
      city: r.city || '',
      province: r.province || '',
      customer_id: r.customer_id ? String(r.customer_id).trim() : ''
    };
  });
  return finalizeRecords(mapped, raw.length, null);
}
