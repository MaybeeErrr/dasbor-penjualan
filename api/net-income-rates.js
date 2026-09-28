import { sql } from './_lib/db.js';
import { getUserId } from './_lib/auth.js';

const MAX_KEYS = 5000;
const MAX_KEY_LEN = 300;

// GET    /api/net-income-rates                 -> { rates: { "<SKU/produk>": rupiahPerKg, ... } }
// PUT    /api/net-income-rates  { rates: { "<SKU>": 12000, "<SKU2>": null } }
//        -> nilai > 0 disimpan/diperbarui; null atau 0 menghapus isian produk itu
// DELETE /api/net-income-rates                 -> hapus semua isian akun ini
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sesi tidak valid. Silakan masuk kembali.' });

  try {
    if (req.method === 'GET') return await list(userId, res);
    if (req.method === 'PUT') return await save(userId, req, res);
    if (req.method === 'DELETE') return await clear(userId, res);
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Metode tidak didukung.' });
  } catch (err) {
    console.error('[api/net-income-rates]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server/database.' });
  }
}

async function list(userId, res) {
  const rows = await sql`SELECT product_key, per_kg FROM net_income_rates WHERE user_id = ${userId}`;
  const rates = {};
  for (const r of rows) rates[r.product_key] = r.per_kg;
  return res.status(200).json({ rates });
}

async function save(userId, req, res) {
  const input = req.body && req.body.rates;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return res.status(400).json({ error: 'Body harus berisi objek "rates".' });
  }
  const entries = Object.entries(input);
  if (entries.length > MAX_KEYS) {
    return res.status(400).json({ error: `Maksimal ${MAX_KEYS} produk per permintaan.` });
  }

  const upKeys = [];
  const upVals = [];
  const delKeys = [];
  for (const [rawKey, rawVal] of entries) {
    const key = String(rawKey).trim().slice(0, MAX_KEY_LEN);
    if (!key) continue;
    const v = rawVal === null || rawVal === '' ? 0 : Number(rawVal);
    if (!Number.isFinite(v) || v < 0) {
      return res.status(400).json({ error: `Nilai untuk "${key}" tidak valid.` });
    }
    if (v > 0) { upKeys.push(key); upVals.push(v); } else { delKeys.push(key); }
  }

  if (upKeys.length) {
    await sql`
      INSERT INTO net_income_rates (user_id, product_key, per_kg)
      SELECT ${userId}, k, v
      FROM unnest(${upKeys}::text[], ${upVals}::float8[]) AS t(k, v)
      ON CONFLICT (user_id, product_key)
      DO UPDATE SET per_kg = EXCLUDED.per_kg, updated_at = now()`;
  }
  if (delKeys.length) {
    await sql`DELETE FROM net_income_rates WHERE user_id = ${userId} AND product_key = ANY(${delKeys}::text[])`;
  }
  return res.status(200).json({ saved: upKeys.length, deleted: delKeys.length });
}

async function clear(userId, res) {
  await sql`DELETE FROM net_income_rates WHERE user_id = ${userId}`;
  return res.status(200).json({ cleared: true });
}
