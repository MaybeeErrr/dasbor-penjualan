"use strict";

/* ---------------- Utilities ---------------- */
function idr(n){
  if(n === null || n === undefined || isNaN(n)) return '—';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}
function idrShort(n){
  if(n === null || n === undefined || isNaN(n)) return '—';
  var abs = Math.abs(n);
  if(abs >= 1e9) return 'Rp' + (n/1e9).toFixed(1).replace('.0','') + 'M';
  if(abs >= 1e6) return 'Rp' + (n/1e6).toFixed(1).replace('.0','') + 'jt';
  if(abs >= 1e3) return 'Rp' + (n/1e3).toFixed(0) + 'rb';
  return idr(n);
}
function parseIDNumber(v){
  if(v === null || v === undefined || v === '') return 0;
  if(typeof v === 'number') return v;
  var s = String(v).trim();
  if(s === '' || s === '-') return 0;
  s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
// "1000 gr" -> 1000, "1,5 kg" -> 1500, 2000 -> 2000 (angka polos dianggap gram).
function parseWeightGrams(v){
  if(v === null || v === undefined || v === '') return 0;
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  var m = String(v).toLowerCase().replace(/\s+/g,' ').match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|gram|gr|g)?/);
  if(!m) return 0;
  var n = parseFloat(m[1].replace(',', '.'));
  if(isNaN(n)) return 0;
  return /^(kg|kilo)/.test(m[2] || '') ? n * 1000 : n;
}
function toDate(v){
  if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if(!v) return null;
  var s = String(v).trim().replace(' ', 'T');
  var d = new Date(s);
  if(isNaN(d.getTime())){
    d = new Date(v);
  }
  return isNaN(d.getTime()) ? null : d;
}
function dayKey(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDayShort(key){
  var p = key.split('-');
  var months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return p[2] + ' ' + months[parseInt(p[1],10)-1];
}
function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function debounce(fn, ms){
  var t;
  return function(){
    var args = arguments, ctx = this;
    clearTimeout(t);
    t = setTimeout(function(){ fn.apply(ctx, args); }, ms);
  };
}

/* ---------------- Berat baris pesanan (dipakai Pendapatan Bersih dan Forecasting kg) ---------------- */
// Perkiraan berat 1 unit (gram) dari teks; dipakai hanya bila berat tidak tersimpan pada dataset.
function guessUnitGrams(r){
  var texts = [r.sku, r.variation, r.product];
  for(var i = 0; i < texts.length; i++){
    var m = String(texts[i] || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|gram|gr|g)\b/i);
    if(m){
      var n = parseFloat(m[1].replace(',', '.'));
      if(!isNaN(n) && n > 0) return /^(kg|kilo)/i.test(m[2]) ? n * 1000 : n;
    }
  }
  return 0;
}
function lineWeight(r){
  var qty = (typeof r.qty === 'number' && !isNaN(r.qty)) ? r.qty : 0;
  if(r.weight_g > 0) return { grams: r.weight_g, source: 'data' };
  var unit = guessUnitGrams(r);
  if(unit > 0 && qty > 0) return { grams: unit * qty, source: 'guess' };
  return { grams: 0, source: 'none' };
}
