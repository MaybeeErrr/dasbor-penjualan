// Mengisi database dengan akun & dataset contoh:  npm run db:seed
// Membuat akun "demo" (kata sandi "demo1234") dengan satu dataset contoh.
import { readFileSync } from 'node:fs';
import { sql } from '../api/_lib/db.js';
import { cleanRow, insertQuery } from '../api/_lib/orders-sql.js';
import { hashPassword } from '../api/_lib/auth.js';

const DEMO_USERNAME = process.env.SEED_USERNAME || 'demo';
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'demo1234';

const parseID = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
};

const raw = JSON.parse(readFileSync(new URL('../public/data/demo-orders.json', import.meta.url), 'utf8'));
const rows = raw
  .map((r) => cleanRow({ ...r, price: parseID(r.price), qty: parseID(r.qty), subtotal: parseID(r.subtotal), total_payment: parseID(r.total_payment) }))
  .filter(Boolean);

let [user] = await sql`SELECT id FROM users WHERE username = ${DEMO_USERNAME}`;
if (!user) {
  const { salt, hash } = hashPassword(DEMO_PASSWORD);
  [user] = await sql`INSERT INTO users (username, password_hash, password_salt) VALUES (${DEMO_USERNAME}, ${hash}, ${salt}) RETURNING id`;
  console.log(`✔ Akun "${DEMO_USERNAME}" dibuat (kata sandi: ${DEMO_PASSWORD}).`);
} else {
  console.log(`… Akun "${DEMO_USERNAME}" sudah ada, memakai akun tersebut.`);
}

const [dataset] = await sql`
  INSERT INTO datasets (user_id, name, source_name)
  VALUES (${user.id}, 'Data contoh — Januari 2026', 'Data contoh — rekap pesanan Januari 2026')
  RETURNING id`;

await sql.transaction([insertQuery(dataset.id, rows)]);
await sql`UPDATE datasets SET row_count = ${rows.length} WHERE id = ${dataset.id}`;

console.log(`✔ ${rows.length} baris data contoh dimasukkan ke dataset baru milik "${DEMO_USERNAME}".`);
