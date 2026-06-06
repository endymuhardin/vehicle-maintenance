-- v3: recurring maintenance plan (service-book schedule).
-- Apply: wrangler d1 execute vehicle-maintenance --local|--remote --file=migration-v3.sql

CREATE TABLE plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  item TEXT NOT NULL,          -- 'Busi', 'Oli mesin', 'Ban depan'
  action TEXT NOT NULL CHECK (action IN ('periksa', 'ganti', 'setel', 'bersihkan', 'lumasi')),
  interval_km INTEGER,         -- either/both/none, whichever first
  interval_months INTEGER,
  doer TEXT NOT NULL CHECK (doer IN ('diy', 'bengkel')),
  spec TEXT,                   -- part no, capacity, torque, brand
  baseline_date TEXT,          -- ISO, explicit last-done when no linked history
  baseline_km INTEGER
);

ALTER TABLE line_items ADD COLUMN plan_item_id INTEGER REFERENCES plan_items(id);

CREATE INDEX idx_plan_items_vehicle ON plan_items(vehicle_id);
CREATE INDEX idx_line_items_plan ON line_items(plan_item_id);
