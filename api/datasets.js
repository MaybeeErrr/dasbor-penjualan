import { sql } from './_lib/db.js';
import { getUserId } from './_lib/auth.js';

// GET    /api/datasets            -> daftar dataset milik akun ini
// POST   /api/datasets            { name, source }  -> buat dataset baru (kosong)
// PATCH  /api/datasets?id=123     { name }           -> ganti nama
// DELETE /api/datasets?id=123     -> hapus dataset (dan seluruh baris pesanannya)
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Sesi tidak valid. Silakan masuk kembali.' });

  try {
    if (req.method === 'GET') return await list(userId, res);
    if (req.method === 'POST') return await create(userId, req, res);
    if (req.method === 'PATCH') return await rename(userId, req, res);
    if (req.method === 'DELETE') return await remove(userId, req, res);
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Metode tidak didukung.' });
  } catch (err) {
    console.error('[api/datasets]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server/database.' });
  }
}

async function list(userId, res) {
  const rows = await sql`
    SELECT id, name, source_name, row_count, created_at, updated_at
    FROM datasets WHERE user_id = ${userId}
    ORDER BY updated_at DESC`;
  return res.status(200).json({ datasets: rows });
}

async function create(userId, req, res) {
  const { name, source } = req.body || {};
  const cleanName = String(name || '').trim().slice(0, 200);
  if (!cleanName) return res.status(400).json({ error: 'Nama dataset wajib diisi.' });
  const rows = await sql`
    INSERT INTO datasets (user_id, name, source_name)
    VALUES (${userId}, ${cleanName}, ${source ? String(source).slice(0, 200) : null})
    RETURNING id, name, source_name, row_count, created_at, updated_at`;
  return res.status(201).json({ dataset: rows[0] });
}

async function rename(userId, req, res) {
  const id = parseInt(req.query.id, 10);
  const { name } = req.body || {};
  const cleanName = String(name || '').trim().slice(0, 200);
  if (!id) return res.status(400).json({ error: 'id dataset wajib diisi.' });
  if (!cleanName) return res.status(400).json({ error: 'Nama dataset wajib diisi.' });
  const rows = await sql`
    UPDATE datasets SET name = ${cleanName}
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, name, source_name, row_count, created_at, updated_at`;
  if (!rows.length) return res.status(404).json({ error: 'Dataset tidak ditemukan.' });
  return res.status(200).json({ dataset: rows[0] });
}

async function remove(userId, req, res) {
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: 'id dataset wajib diisi.' });
  const rows = await sql`DELETE FROM datasets WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  if (!rows.length) return res.status(404).json({ error: 'Dataset tidak ditemukan.' });
  return res.status(200).json({ deleted: true });
}
