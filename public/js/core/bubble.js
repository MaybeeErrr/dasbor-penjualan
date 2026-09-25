"use strict";

/* ---------------- Bubble aggregation (untuk scatter Frequency vs Monetary) ---------------- */
// Titik-titik pelanggan pada scatter Frequency/Monetary banyak yang bertumpuk
// persis di posisi yang sama (mis. banyak pelanggan dengan Frequency=1),
// sehingga sulit dibaca sebagai kumpulan titik translusen. Untuk membuatnya
// lebih rapi, titik-titik pada sel Frequency + rentang Monetary yang sama
// digabung menjadi satu "bubble" — ukurannya sebanding dengan jumlah
// pelanggan pada sel tersebut, bukan menumpuk sebagai titik-titik terpisah.
function niceStep(rough){
  if(!(rough > 0)) return 1;
  var exp = Math.floor(Math.log10(rough));
  var base = Math.pow(10, exp);
  var frac = rough / base;
  var niceFrac = frac <= 1 ? 1 : (frac <= 2 ? 2 : (frac <= 5 ? 5 : 10));
  return niceFrac * base;
}

function monetaryBucketStep(list, targetBuckets){
  var maxV = 0;
  list.forEach(function(c){ if(c.monetary > maxV) maxV = c.monetary; });
  if(maxV <= 0) return 1;
  return niceStep(maxV / targetBuckets);
}

function bucketRangeLabel(bucketIdx, step){
  return idrShort(bucketIdx*step) + '–' + idrShort((bucketIdx+1)*step);
}

// groupKeyFn(customer) -> extra key segment (mis. nomor cluster), dipakai agar
// pelanggan dari cluster berbeda tidak tergabung dalam bubble yang sama.
// jitterFn(cell) -> pergeseran horizontal kecil (opsional) supaya bubble dari
// kelompok berbeda pada Frequency yang sama tidak saling menimpa persis.
function buildBubbleCells(list, step, groupKeyFn, jitterFn){
  var map = {};
  var order = [];
  list.forEach(function(c){
    var bucketIdx = Math.floor(c.monetary / step);
    var groupKey = groupKeyFn ? groupKeyFn(c) : 0;
    var key = c.frequency + '_' + bucketIdx + '_' + groupKey;
    if(!map[key]){
      map[key] = { frequency:c.frequency, bucketIdx:bucketIdx, groupKey:groupKey, count:0, monetarySum:0, ids:[] };
      order.push(key);
    }
    var cell = map[key];
    cell.count++;
    cell.monetarySum += c.monetary;
    if(cell.ids.length < 4) cell.ids.push(c.customer_id);
  });
  return order.map(function(key){
    var cell = map[key];
    var jitter = jitterFn ? jitterFn(cell) : 0;
    return {
      x: cell.frequency + jitter,
      y: cell.monetarySum / cell.count,
      r: bubbleRadius(cell.count),
      frequency: cell.frequency,
      bucketIdx: cell.bucketIdx,
      count: cell.count,
      ids: cell.ids,
      groupKey: cell.groupKey
    };
  });
}

function bubbleRadius(count){
  return Math.min(26, 6 + Math.sqrt(count) * 4.5);
}

function bubbleTooltipLine(item, step, extraLabel){
  var namesPart = item.count <= 4
    ? item.ids.filter(Boolean).join(', ')
    : item.count + ' pelanggan';
  var rangeTxt = bucketRangeLabel(item.bucketIdx, step);
  return (extraLabel ? extraLabel + ' · ' : '') + namesPart + ' · ' + item.frequency + 'x transaksi · sekitar ' + rangeTxt + (item.count>1 ? ' (' + item.count + ' pelanggan)' : '');
}
