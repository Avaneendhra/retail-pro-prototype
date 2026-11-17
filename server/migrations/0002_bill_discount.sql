-- A discount taken off a bill's total (0 when there was none).
ALTER TABLE bills ADD COLUMN discount REAL NOT NULL DEFAULT 0;
