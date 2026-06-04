# Garasi·Log — project notes for Claude Code

Vehicle maintenance app on Cloudflare Workers + D1. See README.md for setup
and full API docs.

## Receipt entry workflow

When given a workshop receipt (photo or text), parse it and POST to the JSON
API — do not edit the database directly.

1. Read `API_TOKEN` and `BASE_URL` from `.dev.vars` (gitignored). If either is
   missing, stop and ask — do not guess.
2. `GET /api/vehicles` to resolve the vehicle id (ask the user if ambiguous).
3. Decide: new maintenance session (`POST /api/vehicles/:id/sessions` with
   `date`, `odometer_km`, `items`) or append to an existing one
   (`POST /api/sessions/:id/items`). Ask for the odometer reading if the
   receipt doesn't show it.
4. Prices are full rupiah integers. `category` is required per item:
   `rutin` (servis/parts), `aksesoris`, or `administratif` (pajak, STNK, etc.).
5. If the receipt or user mentions a next-service interval, set `due_date`
   and/or `due_km` (absolute odometer value, not interval) on that item.
6. Echo the parsed items back to the user for confirmation before posting.

## Conventions

- No fallback values anywhere; missing config/fields must throw.
- Server-rendered Hono JSX, no client-side JS. Styling in `public/style.css`.
- `seed.sql` and the xlsx files are personal data: gitignored, never commit.
