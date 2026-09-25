// Membuat tabel di Neon:  npm run db:migrate
import { readFileSync } from 'node:fs';
import { sql } from '../api/_lib/db.js';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const statements = schema.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);

for (const stmt of statements) {
  await sql.query(stmt);
}
console.log(`✔ Skema selesai dijalankan (${statements.length} perintah).`);
