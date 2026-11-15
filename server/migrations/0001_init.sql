-- stokd schema. Every row belongs to one shop.
-- Rows that sync to devices carry `seq`: the shop's change counter at their last change.

CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  recovery_hash TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX users_shop ON users(shop_id);

CREATE TABLE devices (
  shop_id TEXT NOT NULL,
  id TEXT NOT NULL,
  device_no INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  counters TEXT NOT NULL DEFAULT '{}',
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (shop_id, id)
);

CREATE TABLE products (
  shop_id TEXT NOT NULL,
  id TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  names TEXT NOT NULL DEFAULT '{}',
  aliases TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT 'other',
  price REAL NOT NULL DEFAULT 0,
  min_qty INTEGER NOT NULL DEFAULT 0,
  cover_days INTEGER NOT NULL DEFAULT 7,
  quantity INTEGER NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (shop_id, id)
);
CREATE INDEX products_seq ON products(shop_id, seq);

CREATE TABLE bills (
  shop_id TEXT NOT NULL,
  id TEXT NOT NULL,
  bill_no TEXT NOT NULL,
  at INTEGER NOT NULL,
  total REAL NOT NULL,
  payment TEXT NOT NULL DEFAULT '{}',
  items TEXT NOT NULL DEFAULT '[]',
  user_id TEXT,
  device_no INTEGER,
  seed INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (shop_id, id)
);
CREATE INDEX bills_seq ON bills(shop_id, seq);

CREATE TABLE purchase_orders (
  shop_id TEXT NOT NULL,
  id TEXT NOT NULL,
  po_no TEXT NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received')),
  items TEXT NOT NULL DEFAULT '[]',
  changes TEXT,
  created_at INTEGER NOT NULL,
  received_at INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (shop_id, id)
);
CREATE INDEX purchase_orders_seq ON purchase_orders(shop_id, seq);

CREATE TABLE invoices (
  shop_id TEXT NOT NULL,
  id TEXT NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  invoice_no TEXT NOT NULL DEFAULT '',
  date_text TEXT NOT NULL DEFAULT '',
  units INTEGER NOT NULL DEFAULT 0,
  line_count INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (shop_id, id)
);
CREATE INDEX invoices_seq ON invoices(shop_id, seq);

-- Every change a device has sent. `applied` makes re-sending harmless, and the
-- table doubles as an audit log.
CREATE TABLE ops (
  shop_id TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, id)
);

-- Failed logins and sign-ups, for rate limiting.
CREATE TABLE auth_attempts (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX auth_attempts_key ON auth_attempts(key, at);
