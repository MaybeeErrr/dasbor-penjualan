import { timingSafeEqual } from 'node:crypto';

// Jika APP_PASSWORD diatur, setiap permintaan wajib membawa "Authorization: Bearer <kata sandi>".
export function isAuthorized(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true; // tanpa kata sandi (hanya disarankan untuk uji lokal)
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
