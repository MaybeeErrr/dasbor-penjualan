"use strict";

/* ---------------- OrderStatus: satu definisi "pesanan yang dihitung" untuk semua menu ----------------
   Aturan (dipakai Dasbor Utama, Product Analytics, Pendapatan Bersih, RFM, Market Basket, Insight,
   dan Perbandingan Dataset):
   1. Batal   : status memuat batal / cancel / gagal / pengembalian / return / kembali / refund.
                Dicek lebih dulu, jadi "Pengembalian Selesai" tetap dianggap batal.
   2. Selesai : bukan batal, dan memuat selesai / complete / deliver / diterima.
   3. Status lain (mis. "Sedang Dikirim", "Belum Bayar") bukan selesai dan bukan batal:
      tidak dihitung selama dataset punya pesanan selesai.
   4. Cadangan: bila dataset sama sekali tidak punya pesanan selesai, dipakai semua yang tidak batal
      (dan bila itu pun kosong, semua baris) agar dasbor tetap menampilkan data apa adanya. */
var OrderStatus = (function(){
  var CANCELLED_RE = /batal|cancel|gagal|pengembalian|return|kembali|refund/i;
  var COMPLETED_RE = /selesai|complete|deliver|diterima/i;

  function isCancelled(status){ return CANCELLED_RE.test(String(status == null ? '' : status)); }
  function isCompleted(status){
    var s = String(status == null ? '' : status);
    return !CANCELLED_RE.test(s) && COMPLETED_RE.test(s);
  }

  function defaultStatusOf(x){ return x ? x.status : ''; }

  /* pick(items, statusOf) -> { items, mode }
     mode: 'completed' (normal), 'active' (cadangan: tidak batal), 'all' (cadangan terakhir).
     items boleh baris transaksi maupun pesanan unik; statusOf mengambil statusnya (default x.status). */
  function pick(items, statusOf){
    var get = statusOf || defaultStatusOf;
    var list = items || [];
    var done = list.filter(function(x){ return isCompleted(get(x)); });
    if(done.length) return { items: done, mode: 'completed' };
    var active = list.filter(function(x){ return !isCancelled(get(x)); });
    if(active.length) return { items: active, mode: 'active' };
    return { items: list, mode: 'all' };
  }

  // Versi ringkas: hanya daftar item yang dihitung.
  function counted(items, statusOf){ return pick(items, statusOf).items; }

  return { isCancelled: isCancelled, isCompleted: isCompleted, pick: pick, counted: counted };
})();
