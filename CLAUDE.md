# Garasi·Log — project notes for Claude Code

Vehicle maintenance app on Cloudflare Workers + D1 + R2. See README.md for
setup and docs/API.md for the API reference.

## Data model

`vehicles → visits → line_items`, plus `odometer_logs` (refuels/readings) and
`attachments` (receipt photos in R2). **One receipt = one visit.** Visits
carry an optional `label` to group related visits.

## Receipt entry workflow

When given a workshop receipt (photo or text), follow `docs/API.md` — full
workflow, endpoint reference, and a worked example. Key rules: credentials
from `.dev.vars` (stop and ask if missing), one receipt = one visit, upload
the receipt photo as attachment after creating the visit, confirm parsed
items with the user before posting, never edit the database directly.

## Refuel entry workflow

Photos of odometer + fuel receipt → odometer km from the dashboard photo,
date/liters/total from the receipt → `POST /api/vehicles/:id/odometer`, then
upload the photos via `POST /api/odometer/:id/attachments`. Confirm parsed
values with the user before posting.

## Conventions

- Record entry (receipts, refuels) goes through the API — never direct SQL.
  Administrative corrections (vehicle renames, fixing a typo'd row) go via
  `wrangler d1 execute --remote` directly; don't build edit UIs/endpoints
  for them — 4 vehicles, 1 user, not worth the surface area.
- No fallback values anywhere; missing config/fields must throw.
- Server-rendered Hono JSX, no client-side JS. Styling in `public/style.css`.
- Keep `public/openapi.json` in sync when changing endpoints.
- `seed.sql` and the xlsx files are personal data: gitignored, never commit.
