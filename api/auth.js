import { sql } from './_lib/db.js';
import {
  hashPassword, verifyPassword, issueTokenForUser, getAuthPayload,
  USERNAME_RE, MIN_PASSWORD_LEN,
} from './_lib/auth.js';

// POST /api/auth  { action: 'register'|'login', username, password }
// GET  /api/auth  (Authorization: Bearer <token>)  -> memulihkan sesi
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return await me(req, res);
    if (req.method === 'POST') return await postAction(req, res);
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metode tidak didukung.' });
  } catch (err) {
    console.error('[api/auth]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server/database.' });
  }
}

async function postAction(req, res) {
  const { action, username, password } = req.body || {};
  if (action === 'register') return register(res, username, password);
  if (action === 'login') return login(res, username, password);
  return res.status(400).json({ error: 'Aksi tidak dikenal. Gunakan "register" atau "login".' });
}

async function register(res, username, password) {
  username = String(username || '').trim();
  password = String(password || '');
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Nama akun harus 3–40 karakter: huruf, angka, titik, garis bawah, atau strip.' });
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ error: `Kata sandi minimal ${MIN_PASSWORD_LEN} karakter.` });
  }
  const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
  if (existing.length) {
    return res.status(409).json({ error: 'Nama akun sudah dipakai. Pilih nama lain atau masuk.' });
  }
  const { salt, hash } = hashPassword(password);
  const rows = await sql`
    INSERT INTO users (username, password_hash, password_salt)
    VALUES (${username}, ${hash}, ${salt})
    RETURNING id, username`;
  const user = rows[0];
  return res.status(201).json({ token: issueTokenForUser(user), username: user.username });
}

async function login(res, username, password) {
  username = String(username || '').trim();
  password = String(password || '');
  const rows = await sql`SELECT id, username, password_hash, password_salt FROM users WHERE username = ${username}`;
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: 'Nama akun atau kata sandi salah.' });
  }
  return res.status(200).json({ token: issueTokenForUser(user), username: user.username });
}

async function me(req, res) {
  const payload = getAuthPayload(req);
  if (!payload) return res.status(401).json({ error: 'Sesi tidak valid atau sudah berakhir.' });
  const rows = await sql`SELECT id, username FROM users WHERE id = ${payload.uid}`;
  if (!rows.length) return res.status(401).json({ error: 'Akun tidak ditemukan.' });
  return res.status(200).json({ username: rows[0].username });
}
