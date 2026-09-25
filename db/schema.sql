CREATE TABLE IF NOT EXISTS orders (
  id             BIGSERIAL PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders (order_id);

CREATE TABLE IF NOT EXISTS dataset_info (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  source_name TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
