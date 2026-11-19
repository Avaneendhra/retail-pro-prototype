-- Quick delivery for loyal customers.

-- The shop's WhatsApp number, where it is ({"lat","lng"} as JSON) and how far it delivers.
ALTER TABLE shops ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE shops ADD COLUMN location TEXT;
ALTER TABLE shops ADD COLUMN radius_km REAL NOT NULL DEFAULT 2;

-- The customer written on a bill ({"phone","name"} as JSON), when one was given.
ALTER TABLE bills ADD COLUMN customer TEXT;

-- Customers who may order for delivery. `code` is the secret in their personal order link.
CREATE TABLE customers (
  shop_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  loyal INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual',
  location TEXT,
  created_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (shop_id, id)
);
CREATE INDEX customers_seq ON customers(shop_id, seq);
CREATE INDEX customers_code ON customers(shop_id, code);

-- Orders customers sent from their personal link.
CREATE TABLE delivery_orders (
  shop_id TEXT NOT NULL,
  id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  location TEXT,
  km REAL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'declined')),
  bill_id TEXT,
  at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (shop_id, id)
);
CREATE INDEX delivery_orders_seq ON delivery_orders(shop_id, seq);
CREATE INDEX delivery_orders_customer ON delivery_orders(shop_id, customer_id, at);
