"use strict";

/* ---------------- Theme ---------------- */
var themeBtn = document.getElementById('themeToggle');
function applyTheme(t){
  if(t){ document.documentElement.setAttribute('data-theme', t); }
  else { document.documentElement.removeAttribute('data-theme'); }
  themeBtn.textContent = (t === 'dark') ? '☀' : '☾';
}
var savedTheme = null;
try { savedTheme = localStorage.getItem('sales-dash-theme'); } catch(e) {}
applyTheme(savedTheme);
themeBtn.addEventListener('click', function(){
  var current = document.documentElement.getAttribute('data-theme');
  var isDarkNow = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var next = isDarkNow ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('sales-dash-theme', next); } catch(e) {}
});
