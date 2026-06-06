# Garasi·Log

Vehicle maintenance record app. Single user, server-rendered, runs entirely on
Cloudflare free tier (Workers + D1 + R2). Daily cron checks service
checkpoints and sends Telegram reminders. Tracks fuel consumption (km/l) and
stores receipt photos.

## Stack

- Cloudflare Worker, [Hono](https://hono.dev) with JSX server rendering
- D1 (SQLite) — schema in `schema.sql`; R2 for receipt photos
- No client-side JavaScript; one CSS file
- Cron trigger (daily, 05:00 WIB) → Telegram bot for due checkpoints

## Data model

```
vehicles (name, status: active|sold)
  ├── visits (date, odometer_km?, vendor?, label?)     ← 1 receipt = 1 visit
  │     ├── line_items (description, unit_price, qty, total,
  │     │               category: rutin|aksesoris|administratif,
  │     │               checkpoint_note, due_date, due_km, checkpoint_done,
  │     │               plan_item_id?)                 ← completes a plan task
  │     └── attachments (receipt photos/documents, stored in R2)
  ├── odometer_logs (date, odometer_km, liters?, total?)  ← refuels + readings
  └── plan_items (item, action, interval_km?, interval_months?,
                  doer: diy|bengkel, spec?, baseline_date?, baseline_km?)
```

Prices are full rupiah integers. Visits with a shared `label` form a group
(e.g. one maintenance campaign across several shops). Fuel entries yield km/l
per fill (full-tank method) and a running average.

`plan_items` is the recurring service-book schedule: per item × action ×
interval, marked DIY or bengkel. Last-done derives from line items linked via
`plan_item_id`; the next due (km/date) recomputes automatically. Interval-less
rows act as consumable trackers (installed part + age). The due list grouped
by doer doubles as a DIY shopping list (spec shown) and a work order to
dictate at a street shop.

A checkpoint or plan item becomes *due* when its date falls within
`REMINDER_DAYS_AHEAD` days, or its km is within `REMINDER_KM_AHEAD` of the
vehicle's current odometer (max over visit odometers and the odometer log).
Sold vehicles are excluded from reminders. Vehicles whose newest odometer
reading is older than `REMINDER_ODO_STALE_DAYS` days get a stale-odometer
warning in the daily digest (all three thresholds in `wrangler.jsonc` vars).

## Setup

```sh
npm install

# 1. create the database, then copy database_id into wrangler.jsonc
wrangler d1 create vehicle-maintenance

# 1b. enable R2 in the Cloudflare dashboard once, then:
wrangler r2 bucket create vehicle-receipts

# 2. apply schema
npm run db:schema:remote

# 3. (optional) import spreadsheet history
python3 scripts/import_xlsx.py   # reads the xlsx exports, writes seed.sql
npm run db:seed:remote

# 4. secrets
wrangler secret put APP_PASSWORD        # web login password
wrangler secret put SESSION_SECRET      # random string, e.g. openssl rand -hex 32
wrangler secret put API_TOKEN           # bearer token for the JSON API
wrangler secret put TELEGRAM_BOT_TOKEN  # from @BotFather
wrangler secret put TELEGRAM_CHAT_ID    # your chat id with the bot

# 5. deploy
npm run deploy
```

Deploys are automated via Workers Builds: every push to `main` runs
`npx wrangler deploy`; non-production branches upload preview versions.
`npm run deploy` remains for manual deploys.

Local development: put the same five values in `.dev.vars` (gitignored), then

```sh
npm run db:schema:local && npm run db:seed:local
npm run dev
```

## JSON API

All endpoints require `Authorization: Bearer <API_TOKEN>`. Intended use:
parse a workshop receipt (e.g. with Claude Code), push it as a visit in one
call, and attach the receipt photo. Full reference with request/response
examples and the receipt/refuel workflows: [docs/API.md](docs/API.md). Once
deployed, the same reference is served online: OpenAPI spec at
`/openapi.json`, Swagger UI at `/api-docs`.

| Method | Path | Body |
|---|---|---|
| GET | `/api/vehicles` | — |
| POST | `/api/vehicles` | `{"name": "..."}` |
| GET | `/api/vehicles/:id` | — (includes sessions) |
| GET | `/api/sessions/:id` | — (includes items) |
| POST | `/api/vehicles/:id/sessions` | `{"date": "yyyy-mm-dd", "odometer_km": 12345, "items": [item...]}` |
| POST | `/api/sessions/:id/items` | `{"items": [item...]}` |
| POST | `/api/vehicles/:id/items` | `{"items": [item...]}` (sessionless: aksesoris/administratif) |
| POST | `/api/items/:id/done` | — (mark checkpoint done) |
| GET | `/api/due` | — (currently due checkpoints) |

Item object:

```json
{
  "description": "Oli mesin TMO 10W-40",
  "unit_price": 108000,
  "qty": 4,
  "total": 432000,
  "category": "rutin",
  "date": "2025-07-29",
  "checkpoint_note": "ganti tiap 5000 km",
  "due_date": "2026-01-29",
  "due_km": 185000
}
```

`description`, `unit_price`, `qty`, `category` are required; `total` defaults
to `unit_price × qty`; the rest are optional.

## Importer notes (`scripts/import_xlsx.py`)

One-time conversion of the original Google Sheets exports. Normalizations:

- Corolla file prices are thousands of rupiah → ×1000
- Corolla odometer typo, sessions 3–5: 17000/17500/18000 → 170000/175000/180000
- One row with swapped harga/jumlah fixed (Housing Thermostat)
- Checkpoint cells: date → `due_date`, number → `due_km`, text → `checkpoint_note`

The xlsx files and generated `seed.sql` contain personal spending history and
are gitignored — only the application code is published.
