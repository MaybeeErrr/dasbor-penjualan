import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  throw new Error('DATABASE_URL belum diatur. Lihat README.md bagian "Environment Variables".');
}

// Driver HTTP Neon: cocok untuk serverless (tanpa koneksi persisten).
export const sql = neon(url);
