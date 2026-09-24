-- v5: mark a vehicle whose odometer is out of order.
-- Apply: wrangler d1 execute vehicle-maintenance --local|--remote --file=migration-v5.sql
--
-- Nullable on purpose: NULL = odometer works. A date means no km reading can
-- be taken since then, so the stale-odometer warning skips the vehicle.
-- Cleared via SQL once the odometer is repaired.

ALTER TABLE vehicles ADD COLUMN odometer_broken_since TEXT;

-- Astrea: speedometer cable + gigi nanas dead since purchase (visit 89).
UPDATE vehicles SET odometer_broken_since = '2026-08-25' WHERE name = 'Honda Astrea Legenda 2001';
