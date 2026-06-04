DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS odometer_logs;
DROP TABLE IF EXISTS line_items;
DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS vehicles;

CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'sold'))
);

-- One shop/workshop visit (or purchase). A receipt maps 1:1 to a visit.
CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  date TEXT NOT NULL,          -- ISO yyyy-mm-dd
  odometer_km INTEGER,         -- reading at the visit, when known
  vendor TEXT,                 -- bengkel / toko / samsat
  label TEXT                   -- optional grouping, e.g. 'Perawatan ke-1'
);

-- A cost line: part or service. Prices in full rupiah.
CREATE TABLE line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL REFERENCES visits(id),
  description TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  qty REAL NOT NULL,
  total INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('rutin', 'aksesoris', 'administratif')),
  checkpoint_note TEXT,        -- free-text service note
  due_date TEXT,               -- ISO yyyy-mm-dd, structured reminder
  due_km INTEGER,              -- structured reminder against vehicle odometer
  checkpoint_done INTEGER NOT NULL CHECK (checkpoint_done IN (0, 1))
);

-- Odometer readings, typically logged at refueling. liters/total present =
-- fuel entry (km/l computed against the previous fuel entry, assuming
-- full-tank refuels); both NULL = plain odometer reading.
CREATE TABLE odometer_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  date TEXT NOT NULL,          -- ISO yyyy-mm-dd
  odometer_km INTEGER NOT NULL,
  liters REAL,                 -- fuel volume
  total INTEGER,               -- rupiah paid
  note TEXT,                   -- e.g. station, fuel type
  CHECK ((liters IS NULL) = (total IS NULL))
);

-- Receipt photos / documents stored in R2, linked to exactly one owner:
-- a visit (workshop receipt) or an odometer log entry (refuel photo).
CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER REFERENCES visits(id),
  odometer_log_id INTEGER REFERENCES odometer_logs(id),
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,   -- ISO timestamp
  CHECK ((visit_id IS NULL) <> (odometer_log_id IS NULL))
);

CREATE INDEX idx_visits_vehicle ON visits(vehicle_id, date);
CREATE INDEX idx_line_items_visit ON line_items(visit_id);
CREATE INDEX idx_line_items_due ON line_items(checkpoint_done, due_date, due_km);
CREATE INDEX idx_odometer_logs_vehicle ON odometer_logs(vehicle_id, odometer_km);
CREATE INDEX idx_attachments_visit ON attachments(visit_id);
CREATE INDEX idx_attachments_odolog ON attachments(odometer_log_id);
