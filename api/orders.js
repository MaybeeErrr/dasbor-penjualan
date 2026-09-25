import { sql } from './_lib/db.js';
import { getUserId } from './_lib/auth.js';
import { cleanRow, insertQuery } from './_lib/orders-sql.js';

const MAX_LIMIT = 5000;
const MAX_BATCH = 5000;

// Semua endpoint di bawah ini beroperasi pada SATU dataset (?datasetId=123),
// dan dataset itu harus milik akun yang sedang login.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sesi tidak valid. Silakan masuk kembali.' });

  const datasetId = parseInt(req.query.datasetId, 10);
  if (!datasetId) return res.status(400).json({ error: 'Parameter datasetId wajib diisi.' });

  try {
    const owns = await sql`SELECT id FROM datasets WHERE id = ${datasetId} AND user_id = ${userId}`;
    if (!owns.length) return res.status(404).json({ error: 'Dataset tidak ditemukan.' });

    if (req.method === 'GET') return await list(datasetId, req, res);
    if (req.method === 'POST') return await insert(datasetId, req, res);
    if (req.method === 'DELETE') return await clear(datasetId, res);
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Metode tidak didukung.' });
  } catch (err) {
    console.error('[api/orders]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server/database.' });
  }
}

async function list(datasetId, req, res) {
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || MAX_LIMIT));

  const [rows, counts, meta] = await Promise.all([
    sql`SELECT order_id, status,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
               payment_method, product, variation, price, qty, subtotal,
               total_payment, city, province, customer_id
        FROM orders WHERE dataset_id = ${datasetId} ORDER BY id LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT count(*)::int AS n FROM orders WHERE dataset_id = ${datasetId}`,
    sql`SELECT name, source_name, updated_at FROM datasets WHERE id = ${datasetId}`,
  ]);

  return res.status(200).json({
    rows,
    total: counts[0].n,
    source: meta[0]?.source_name ?? meta[0]?.name ?? null,
    updatedAt: meta[0]?.updated_at ?? null,
  });
}

async function insert(datasetId, req, res) {
  const { rows, replace = false, source = null } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BATCH) {
    return res.status(400).json({ error: `Kirim 1–${MAX_BATCH} baris per permintaan.` });
  }
  const clean = rows.map(cleanRow).filter(Boolean);
  if (clean.length === 0) {
    return res.status(400).json({ error: 'Tidak ada baris valid (periksa kolom tanggal).' });
  }

  const queries = [];
  if (replace) queries.push(sql`DELETE FROM orders WHERE dataset_id = ${datasetId}`);
  queries.push(insertQuery(datasetId, clean));
  queries.push(sql`
    UPDATE datasets SET
      source_name = CASE WHEN ${source !== null} THEN ${source ? String(source).slice(0, 200) : null} ELSE source_name END,
      row_count = (SELECT count(*)::int FROM orders WHERE dataset_id = ${datasetId}),
      updated_at = now()
    WHERE id = ${datasetId}`);

  await sql.transaction(queries); // atomik per permintaan
  return res.status(200).json({ inserted: clean.length, skipped: rows.length - clean.length });
}

async function clear(datasetId, res) {
  await sql.transaction([
    sql`DELETE FROM orders WHERE dataset_id = ${datasetId}`,
    sql`UPDATE datasets SET row_count = 0, updated_at = now() WHERE id = ${datasetId}`,
  ]);
  return res.status(200).json({ cleared: true });
}
