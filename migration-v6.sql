-- v6: link a plan item to its step-by-step procedure.
-- Apply: wrangler d1 execute vehicle-maintenance --local|--remote --file=migration-v6.sql
--
-- Nullable on purpose: NULL = no procedure written yet. Holds an absolute
-- https URL, normally a markdown file under docs/procedures/ on GitHub.

ALTER TABLE plan_items ADD COLUMN procedure_url TEXT;
