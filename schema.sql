DROP TABLE IF EXISTS line_items;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS vehicles;

CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'sold'))
);

-- A maintenance session: "Perawatan ke-N" at a given date and odometer reading.
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  seq INTEGER NOT NULL,
  date TEXT NOT NULL,          -- ISO yyyy-mm-dd
  odometer_km INTEGER NOT NULL,
  UNIQUE (vehicle_id, seq)
);

-- A cost line: part or service. session_id is NULL for non-session expenses
-- (aksesoris, administratif). Prices in full rupiah.
CREATE TABLE line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  session_id INTEGER REFERENCES sessions(id),
  date TEXT,                   -- ISO yyyy-mm-dd
  description TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  qty REAL NOT NULL,
  total INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('rutin', 'aksesoris', 'administratif')),
  checkpoint_note TEXT,        -- original free-text checkpoint from the spreadsheet
  due_date TEXT,               -- ISO yyyy-mm-dd, structured reminder
  due_km INTEGER,              -- structured reminder against vehicle odometer
  checkpoint_done INTEGER NOT NULL CHECK (checkpoint_done IN (0, 1))
);

CREATE INDEX idx_sessions_vehicle ON sessions(vehicle_id);
CREATE INDEX idx_line_items_vehicle ON line_items(vehicle_id);
CREATE INDEX idx_line_items_session ON line_items(session_id);
CREATE INDEX idx_line_items_due ON line_items(checkpoint_done, due_date, due_km);
