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
