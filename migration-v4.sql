-- v4: license plate on the vehicle master row.
-- Apply: wrangler d1 execute vehicle-maintenance --local|--remote --file=migration-v4.sql
--
-- Nullable on purpose: a plate is only written when it has been read off the
-- vehicle or a nota. No placeholder values.

ALTER TABLE vehicles ADD COLUMN plate TEXT;

UPDATE vehicles SET plate = 'F 1180 FJ'  WHERE name = 'Corolla Twincam 1991';
UPDATE vehicles SET plate = 'F 2398 FGR' WHERE name = 'Yamaha All New Vixion 2017';
UPDATE vehicles SET plate = 'F 4992 H'   WHERE name = 'Honda Astrea Legenda 2001';
UPDATE vehicles SET plate = 'F 6409 IM' WHERE name = 'Mio Smile 2008';
