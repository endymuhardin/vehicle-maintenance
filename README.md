# Garasi·Log

Vehicle maintenance record app. Single user, server-rendered, runs entirely on
Cloudflare free tier (Workers + D1). Daily cron checks service checkpoints and
sends Telegram reminders.

## Stack

- Cloudflare Worker, [Hono](https://hono.dev) with JSX server rendering
- D1 (SQLite) — schema in `schema.sql`
- No client-side JavaScript; one CSS file
- Cron trigger (daily, 05:00 WIB) → Telegram bot for due checkpoints

## Data model

```
vehicles (name, status: active|sold)
  └── sessions (seq "Perawatan ke-N", date, odometer_km)
        └── line_items (date, description, unit_price, qty, total,
                        category: rutin|aksesoris|administratif,
                        checkpoint_note, due_date, due_km, checkpoint_done)
```

Line items with `session_id = NULL` are non-service expenses (accessories,
administrative costs). Prices are stored in full rupiah as integers.

A checkpoint becomes *due* when `due_date` falls within `REMINDER_DAYS_AHEAD`
days, or `due_km` is within `REMINDER_KM_AHEAD` of the vehicle's latest
recorded odometer. Sold vehicles are excluded from reminders.

## Setup

```sh
npm install

# 1. create the database, then copy database_id into wrangler.jsonc
wrangler d1 create vehicle-maintenance

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

Local development: put the same five values in `.dev.vars` (gitignored), then

```sh
npm run db:schema:local && npm run db:seed:local
npm run dev
```

## JSON API

All endpoints require `Authorization: Bearer <API_TOKEN>`. Intended use:
parse a workshop receipt (e.g. with Claude Code) and push it in one call.
Full reference with request/response examples and the receipt-entry workflow:
[docs/API.md](docs/API.md).

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
