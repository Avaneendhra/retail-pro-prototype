-- The batch and dates of the stock a shop last received ("2026-08" or "2026-08-15"; empty when unknown).
ALTER TABLE products ADD COLUMN batch TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN mfg_date TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN expiry_date TEXT NOT NULL DEFAULT '';
