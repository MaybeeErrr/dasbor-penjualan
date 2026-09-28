"use strict";

/* ---------------- Core: set records & render ---------------- */
function setRecords(records, sourceLabel){
  state.records = records;
  document.getElementById('dashboard').classList.add('show');
  setStatusPill(true, sourceLabel || (records.length + ' baris dimuat'));
  populateFilters();
  state.tablePage = 0;
  state.rfmPage = 0;
  state.kmeansPage = 0;
  state.paPage = 0;
  render();
  document.getElementById('dashboard').scrollIntoView({behavior:'smooth', block:'start'});
}

function populateFilters(){
  var statuses = Array.from(new Set(state.records.map(function(r){ return r.status || 'Tidak diketahui'; })));
  var selStatus = document.getElementById('filterStatus');
  selStatus.innerHTML = '<option value="__all__">Semua status</option>' + statuses.map(function(s){ return '<option value="'+escapeHtml(s)+'">'+escapeHtml(s)+'</option>'; }).join('');

  var provinces = Array.from(new Set(state.records.map(function(r){ return r.province || ''; }).filter(Boolean))).sort();
  var selProv = document.getElementById('filterProvince');
  selProv.innerHTML = '<option value="__all__">Semua provinsi</option>' + provinces.map(function(p){ return '<option value="'+escapeHtml(p)+'">'+escapeHtml(p)+'</option>'; }).join('');
}

document.getElementById('filterStatus').addEventListener('change', function(){ state.tablePage = 0; state.rfmPage = 0; state.kmeansPage = 0; state.paPage = 0; render(); });
document.getElementById('filterProvince').addEventListener('change', function(){ state.tablePage = 0; state.rfmPage = 0; state.kmeansPage = 0; state.paPage = 0; render(); });
document.getElementById('tableSearch').addEventListener('input', debounce(function(e){
  state.tableSearch = e.target.value.toLowerCase();
  state.tablePage = 0;
  renderTable();
}, 200));

var horizonTabs = document.getElementById('horizonTabs');
horizonTabs.addEventListener('click', function(e){
  var btn = e.target.closest('button');
  if(!btn) return;
  state.horizon = parseInt(btn.getAttribute('data-h'), 10);
  Array.from(horizonTabs.children).forEach(function(b){ b.classList.toggle('active', b === btn); });
  renderForecast();
});

function applyFilters(){
  var statusVal = document.getElementById('filterStatus').value;
  var provVal = document.getElementById('filterProvince').value;
  state.filtered = state.records.filter(function(r){
    if(statusVal && statusVal !== '__all__' && r.status !== statusVal) return false;
    if(provVal && provVal !== '__all__' && r.province !== provVal) return false;
    return true;
  });
}

function uniqueOrders(records){
  var seen = {};
  var out = [];
  records.forEach(function(r){
    if(!seen[r.order_id]){
      seen[r.order_id] = true;
      out.push(r);
    }
  });
  return out;
}
