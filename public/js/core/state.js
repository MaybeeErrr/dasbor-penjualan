"use strict";

/* ---------------- App state ---------------- */
var state = {
  records: [],      // normalized line-item records
  filtered: [],
  horizon: 7,
  tablePage: 0,
  tablePageSize: 10,
  tableSearch: '',
  rfmPage: 0,
  rfmPageSize: 10,
  kmeansK: 3,
  kmeansPage: 0,
  kmeansPageSize: 10,
  paSearch: '',
  paPage: 0,
  paPageSize: 10,
  paSortKey: 'revenue',
  paSortDir: 'desc'
};
var charts = {};
var lastClusterSummaries = null; // diisi renderCustomerSegmentation(), dipakai ulang oleh Insight/Rekomendasi/Ringkasan Eksekutif
var lastKmeansK = null;
