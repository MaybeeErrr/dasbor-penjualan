"use strict";

(function(){
  "use strict";

  /* ---------------- Sidebar navigation (view switching) ---------------- */
  var navBtns = Array.prototype.slice.call(document.querySelectorAll('.nav-btn[data-view]'));
  var viewPlanes = Array.prototype.slice.call(document.querySelectorAll('.view-plane'));
  var appTopbarTitle = document.getElementById('appTopbarTitle');

  function activateView(viewKey){
    navBtns.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-view') === viewKey); });
    viewPlanes.forEach(function(p){
      var isActive = p.id === 'view-' + viewKey;
      p.classList.toggle('active', isActive);
      if(isActive && appTopbarTitle){ appTopbarTitle.textContent = p.getAttribute('data-view-name') || ''; }
    });
    closeSidebar();
    document.querySelector('.main-content').scrollTo({top:0, behavior:'smooth'});
  }

  navBtns.forEach(function(b){
    b.addEventListener('click', function(){ activateView(b.getAttribute('data-view')); });
  });
  Array.prototype.slice.call(document.querySelectorAll('[data-goto]')).forEach(function(el){
    el.addEventListener('click', function(){ activateView(el.getAttribute('data-goto')); });
  });

  /* ---------------- Mobile sidebar drawer ---------------- */
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('sidebarScrim');
  function openSidebar(){ sidebar.classList.add('open'); scrim.classList.add('show'); }
  function closeSidebar(){ sidebar.classList.remove('open'); scrim.classList.remove('show'); }
  var menuToggle = document.getElementById('menuToggle');
  if(menuToggle) menuToggle.addEventListener('click', openSidebar);
  var sidebarClose = document.getElementById('sidebarClose');
  if(sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
  if(scrim) scrim.addEventListener('click', closeSidebar);

  /* ---------------- Reset filter ---------------- */
  var btnReset = document.getElementById('btnResetFilter');
  if(btnReset){
    btnReset.addEventListener('click', function(){
      var st = document.getElementById('filterStatus');
      var pv = document.getElementById('filterProvince');
      if(st){ st.value = '__all__'; st.dispatchEvent(new Event('change')); }
      if(pv){ pv.value = '__all__'; pv.dispatchEvent(new Event('change')); }
    });
  }

  /* ---------------- Show app shell once data is loaded ---------------- */
  // The core script toggles the "show" class on #dashboard (setRecords / dataset switch).
  // We mirror that into the landing page's visibility without touching that logic.
  var dashboardEl = document.getElementById('dashboard');
  var landingWrap = document.getElementById('landingWrap');
  var landingTopbar = document.getElementById('landingTopbar');

  function syncShellVisibility(){
    var hasData = dashboardEl.classList.contains('show');
    landingWrap.style.display = hasData ? 'none' : '';
    landingTopbar.style.display = hasData ? 'none' : '';
  }
  if(dashboardEl && window.MutationObserver){
    new MutationObserver(syncShellVisibility).observe(dashboardEl, {attributes:true, attributeFilter:['class']});
  }
  // Tombol "Ganti dataset" (id btnBackToDatasets) ditangani di data/datasets-ui.js;
  // MutationObserver di bawah ini otomatis menampilkan kembali halaman landing
  // begitu class "show" pada #dashboard dilepas.
  syncShellVisibility();

  /* ---------------- Mirror status pill + theme button (landing vs sidebar) ---------------- */
  function mirrorStatus(){
    var src = document.getElementById('dataStatusTxt');
    var dst = document.getElementById('dataStatusTxtLanding');
    var srcPill = document.getElementById('dataStatusPill');
    var dstPill = document.getElementById('dataStatusPillLanding');
    if(src && dst) dst.textContent = src.textContent;
    if(srcPill && dstPill) dstPill.classList.toggle('active', srcPill.classList.contains('active'));
  }
  var statusTxtEl = document.getElementById('dataStatusTxt');
  var statusPillEl = document.getElementById('dataStatusPill');
  if(statusTxtEl && window.MutationObserver){
    new MutationObserver(mirrorStatus).observe(statusTxtEl, {childList:true, characterData:true, subtree:true});
  }
  if(statusPillEl && window.MutationObserver){
    new MutationObserver(mirrorStatus).observe(statusPillEl, {attributes:true, attributeFilter:['class']});
  }
  mirrorStatus();
  var themeToggleLanding = document.getElementById('themeToggleLanding');
  var themeToggleMain = document.getElementById('themeToggle');
  if(themeToggleLanding && themeToggleMain){
    themeToggleLanding.addEventListener('click', function(){ themeToggleMain.click(); themeToggleLanding.textContent = themeToggleMain.textContent; });
  }
  if(themeToggleMain && window.MutationObserver){
    new MutationObserver(function(){ if(themeToggleLanding) themeToggleLanding.textContent = themeToggleMain.textContent; }).observe(themeToggleMain, {childList:true});
  }
})();
