import { sql } from './_lib/db.js';
import { isAuthorized } from './_lib/auth.js';
import { cleanRow, insertQuery } from './_lib/orders-sql.js';

const MAX_LIMIT = 5000;
const MAX_BATCH = 5000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Kata sandi salah atau belum diisi.' });
  }
  try {
    if (req.method === 'GET') return await list(req, res);
    if (req.method === 'POST') return await insert(req, res);
    if (req.method === 'DELETE') return await clear(res);
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Metode tidak didukung.' });
  } catch (err) {
    console.error('[api/orders]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server/database.' });
  }
}

async function list(req, res) {
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || MAX_LIMIT));

  const [rows, counts, meta] = await Promise.all([
    sql`SELECT order_id, status,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
               payment_method, product, variation, price, qty, subtotal,
               total_payment, city, province, customer_id
        FROM orders ORDER BY id LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS n FROM orders`,
    sql`SELECT source_name, updated_at FROM dataset_info WHERE id = 1`,
  ]);

  return res.status(200).json({
    rows,
    total: counts[0].n,
    source: meta[0]?.source_name ?? null,
    updatedAt: meta[0]?.updated_at ?? null,
  });
}

async function insert(req, res) {
  const { rows, replace = false, source = null } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BATCH) {
    return res.status(400).json({ error: `Kirim 1–${MAX_BATCH} baris per permintaan.` });
  }
  const clean = rows.map(cleanRow).filter(Boolean);
  if (clean.length === 0) {
    return res.status(400).json({ error: 'Tidak ada baris valid (periksa kolom tanggal).' });
  }

  const queries = [];
  if (replace) queries.push(sql`TRUNCATE orders RESTART IDENTITY`);
  queries.push(insertQuery(clean));
  queries.push(sql`
    INSERT INTO dataset_info (id, source_name, updated_at)
    VALUES (1, ${source ? String(source).slice(0, 200) : null}, now())
    ON CONFLICT (id) DO UPDATE
      SET source_name = CASE WHEN ${replace} THEN EXCLUDED.source_name ELSE dataset_info.source_name END,
          updated_at = now()`);

  await sql.transaction(queries); // atomik per permintaan
  return res.status(200).json({ inserted: clean.length, skipped: rows.length - clean.length });
}

async function clear(res) {
  await sql.transaction([sql`TRUNCATE orders RESTART IDENTITY`, sql`DELETE FROM dataset_info`]);
  return res.status(200).json({ cleared: true });
}
