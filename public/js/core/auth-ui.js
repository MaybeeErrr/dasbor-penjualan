"use strict";

/* ---------------- Gerbang akun: login/register, memblokir akses sebelum masuk ---------------- */
var AuthUI = (function(){
  var overlay = document.getElementById('authOverlay');
  var formLogin = document.getElementById('authFormLogin');
  var formRegister = document.getElementById('authFormRegister');
  var errorEl = document.getElementById('authError');
  var toRegisterBtn = document.getElementById('authToRegister');
  var toLoginBtn = document.getElementById('authToLogin');
  var titleEl = document.getElementById('authTitle');
  var subEl = document.getElementById('authSub');
  var switchToRegisterWrap = document.getElementById('authSwitchToRegisterWrap');
  var switchToLoginWrap = document.getElementById('authSwitchToLoginWrap');

  function showError(msg){ if(errorEl){ errorEl.textContent = msg; errorEl.classList.add('show'); } }
  function clearError(){ if(errorEl){ errorEl.textContent = ''; errorEl.classList.remove('show'); } }

  function showOverlay(){ if(overlay) overlay.classList.remove('hidden'); }
  function hideOverlay(){ if(overlay) overlay.classList.add('hidden'); }

  function switchMode(mode){
    clearError();
    var isRegister = mode === 'register';
    if(formLogin) formLogin.style.display = isRegister ? 'none' : '';
    if(formRegister) formRegister.style.display = isRegister ? '' : 'none';
    if(titleEl) titleEl.textContent = isRegister ? 'Buat akun baru' : 'Masuk ke akun Anda';
    if(subEl) subEl.textContent = isRegister
      ? 'Satu akun bisa menyimpan banyak dataset penjualan, masing-masing dianalisis dan bisa dibandingkan.'
      : 'Dataset penjualan Anda tersimpan aman per akun.';
    if(switchToRegisterWrap) switchToRegisterWrap.style.display = isRegister ? 'none' : '';
    if(switchToLoginWrap) switchToLoginWrap.style.display = isRegister ? '' : 'none';
  }
  if(toRegisterBtn) toRegisterBtn.addEventListener('click', function(){ switchMode('register'); });
  if(toLoginBtn) toLoginBtn.addEventListener('click', function(){ switchMode('login'); });

  function afterAuthSuccess(username){
    hideOverlay();
    ['accountName','accountNameLanding'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.textContent = username || '';
    });
    document.dispatchEvent(new CustomEvent('auth:ready', { detail: { username: username } }));
  }

  if(formLogin) formLogin.addEventListener('submit', function(e){
    e.preventDefault();
    clearError();
    var u = document.getElementById('loginUsername').value.trim();
    var p = document.getElementById('loginPassword').value;
    var btn = formLogin.querySelector('button[type="submit"]');
    if(btn) btn.disabled = true;
    Api.auth.login(u, p).then(function(d){ afterAuthSuccess(d.username); })
      .catch(function(err){ showError(err.message); })
      .then(function(){ if(btn) btn.disabled = false; });
  });

  if(formRegister) formRegister.addEventListener('submit', function(e){
    e.preventDefault();
    clearError();
    var u = document.getElementById('registerUsername').value.trim();
    var p = document.getElementById('registerPassword').value;
    var p2 = document.getElementById('registerPassword2').value;
    if(p !== p2){ showError('Konfirmasi kata sandi tidak cocok.'); return; }
    var btn = formRegister.querySelector('button[type="submit"]');
    if(btn) btn.disabled = true;
    Api.auth.register(u, p).then(function(d){ afterAuthSuccess(d.username); })
      .catch(function(err){ showError(err.message); })
      .then(function(){ if(btn) btn.disabled = false; });
  });

  function doLogout(){
    Api.auth.logout();
    state.records = [];
    state.datasets = [];
    state.activeDatasetId = null;
    document.getElementById('dashboard').classList.remove('show');
    switchMode('login');
    if(formLogin) formLogin.reset();
    if(formRegister) formRegister.reset();
    showOverlay();
  }
  ['btnLogout','btnLogoutLanding'].forEach(function(id){
    var b = document.getElementById(id);
    if(b) b.addEventListener('click', doLogout);
  });

  /* ---------------- Inisialisasi: coba pulihkan sesi dari token tersimpan ---------------- */
  switchMode('login');
  showOverlay();
  if(Api.hasToken()){
    Api.auth.restoreSession().then(function(d){ afterAuthSuccess(d.username); })
      .catch(function(){ Api.auth.logout(); showOverlay(); });
  }

  return { showOverlay: showOverlay, hideOverlay: hideOverlay, logout: doLogout };
})();
