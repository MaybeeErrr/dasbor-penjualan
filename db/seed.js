// Mengisi database dengan data contoh:  npm run db:seed
import { readFileSync } from 'node:fs';
import { sql } from '../api/_lib/db.js';
import { cleanRow, insertQuery } from '../api/_lib/orders-sql.js';

// Data contoh memakai format angka Indonesia ("30.000") -> ubah ke angka.
const parseID = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
};

const raw = JSON.parse(readFileSync(new URL('../public/data/demo-orders.json', import.meta.url), 'utf8'));
const rows = raw
  .map((r) => cleanRow({ ...r, price: parseID(r.price), qty: parseID(r.qty), subtotal: parseID(r.subtotal), total_payment: parseID(r.total_payment) }))
  .filter(Boolean);

await sql.transaction([
  sql`TRUNCATE orders RESTART IDENTITY`,
  insertQuery(rows),
  sql`INSERT INTO dataset_info (id, source_name, updated_at) VALUES (1, 'Data contoh — rekap pesanan Januari 2026', now())
      ON CONFLICT (id) DO UPDATE SET source_name = EXCLUDED.source_name, updated_at = now()`,
]);
console.log(`✔ ${rows.length} baris data contoh dimasukkan ke database.`);
