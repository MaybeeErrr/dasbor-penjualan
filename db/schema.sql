-- Pengguna (akun) ------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dataset: satu akun bisa punya banyak dataset penjualan ---------------
CREATE TABLE IF NOT EXISTS datasets (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  source_name TEXT,
  row_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_datasets_user ON datasets (user_id);

-- Baris pesanan, sekarang terikat ke satu dataset -----------------------
CREATE TABLE IF NOT EXISTS orders (
  id             BIGSERIAL PRIMARY KEY,
  dataset_id     BIGINT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  order_id       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'Selesai',
  created_at     TIMESTAMP NOT NULL,
  payment_method TEXT NOT NULL DEFAULT '',
  product        TEXT NOT NULL DEFAULT '',
  variation      TEXT NOT NULL DEFAULT '',
  price          DOUBLE PRECISION NOT NULL DEFAULT 0,
  qty            DOUBLE PRECISION NOT NULL DEFAULT 1,
  subtotal       DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_payment  DOUBLE PRECISION NOT NULL DEFAULT 0,
  city           TEXT NOT NULL DEFAULT '',
  province       TEXT NOT NULL DEFAULT '',
  customer_id    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_orders_dataset ON orders (dataset_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders (order_id);

-- Migrasi: SKU induk & berat baris produk (gram) untuk menu Pendapatan Bersih.
-- Aman dijalankan berulang; dataset lama tetap terbaca (nilai default '' / 0).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sku TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS weight_g DOUBLE PRECISION NOT NULL DEFAULT 0;
