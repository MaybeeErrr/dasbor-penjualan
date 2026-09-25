import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

// Kunci penandatanganan token sesi. WAJIB diisi lewat env SESSION_SECRET di
// produksi — nilai bawaan di bawah hanya untuk pengujian lokal tanpa .env.
const SECRET = process.env.SESSION_SECRET || 'dev-only-secret-jangan-dipakai-di-produksi';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/* ---------------- Kata sandi (scrypt bawaan Node, tanpa dependensi tambahan) ---------------- */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  try {
    const test = scryptSync(String(password), salt, 64).toString('hex');
    const a = Buffer.from(test);
    const b = Buffer.from(hash);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/* ---------------- Token sesi: HMAC-SHA256, stateless (tanpa tabel sesi) ---------------- */
export function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const [body, sig] = token.split('.');
  const expectedSig = b64url(createHmac('sha256', SECRET).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function issueTokenForUser(user) {
  return signToken({ uid: user.id, username: user.username, exp: Date.now() + TOKEN_TTL_MS });
}

// Ambil user_id dari header Authorization: Bearer <token>. null jika tidak valid/tidak ada.
export function getUserId(req) {
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const payload = verifyToken(given);
  return payload ? payload.uid : null;
}

export function getAuthPayload(req) {
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return verifyToken(given);
}

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,40}$/;
export const MIN_PASSWORD_LEN = 6;
