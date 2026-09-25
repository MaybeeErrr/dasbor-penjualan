import { sql } from './db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
const str = (v, max = 500) => String(v ?? '').slice(0, max);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Validasi & normalisasi satu baris; baris dengan tanggal tidak valid dibuang.
export function cleanRow(r) {
  if (!r || !DATE_RE.test(String(r.created_at ?? ''))) return null;
  return {
    order_id: str(r.order_id, 100),
    status: str(r.status, 60) || 'Selesai',
    created_at: String(r.created_at).replace(' ', 'T'),
    payment_method: str(r.payment_method, 100),
    product: str(r.product, 500),
    variation: str(r.variation, 200),
    price: num(r.price),
    qty: num(r.qty),
    subtotal: num(r.subtotal),
    total_payment: num(r.total_payment),
    city: str(r.city, 100),
    province: str(r.province, 100),
    customer_id: str(r.customer_id, 200),
  };
}

// Satu INSERT untuk banyak baris (JSON -> recordset) ke dataset tertentu.
export function insertQuery(datasetId, cleanRows) {
  const payload = JSON.stringify(cleanRows);
  return sql`
    INSERT INTO orders (dataset_id, order_id, status, created_at, payment_method, product, variation,
                        price, qty, subtotal, total_payment, city, province, customer_id)
    SELECT ${datasetId}, order_id, status, created_at, payment_method, product, variation,
           price, qty, subtotal, total_payment, city, province, customer_id
    FROM jsonb_to_recordset(${payload}::jsonb) AS t(
      order_id text, status text, created_at timestamp, payment_method text, product text,
      variation text, price float8, qty float8, subtotal float8, total_payment float8,
      city text, province text, customer_id text)`;
}
