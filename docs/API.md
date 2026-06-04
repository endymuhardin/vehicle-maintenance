# JSON API

Base URL and token: read `BASE_URL` and `API_TOKEN` from `.dev.vars`
(gitignored). Every request needs:

```
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

Missing/invalid token → `401 {"error": "invalid or missing API token"}`.

## Receipt entry workflow

When given a workshop receipt (photo or text), parse it and POST via this
API — never edit the database directly.

1. Read `API_TOKEN` and `BASE_URL` from `.dev.vars`. If either is missing,
   stop and ask — do not guess.
2. `GET /api/vehicles` to resolve the vehicle id. Ask the user if the receipt
   doesn't clearly match one vehicle.
3. Decide where the items go:
   - routine service visit → new session: `POST /api/vehicles/:id/sessions`
     with `date`, `odometer_km`, `items`. Ask for the odometer reading if the
     receipt doesn't show it.
   - follow-up work belonging to a recent visit → append:
     `POST /api/sessions/:id/items` (check `GET /api/vehicles/:id` for the
     latest session).
   - accessories or administrative costs (pajak, STNK, balik nama) →
     sessionless: `POST /api/vehicles/:id/items`.
4. Normalize prices to full-rupiah integers ("60rb" → 60000, "1,2jt" → 1200000).
5. If the receipt or user mentions a next-service interval, set `due_date`
   and/or `due_km` on that item — `due_km` as absolute odometer, not interval.
6. Echo the parsed items back to the user for confirmation before posting.

## Conventions

- Money: full rupiah, integer (`108000`, never `108` or `108.000`).
- Dates: ISO `yyyy-mm-dd` strings. Anything else → 400.
- `category` (required on every item): `rutin` | `aksesoris` | `administratif`.
- No silent defaults: missing required fields → `400 {"error": "missing field: <name>"}`.
  Exception: `total` is computed as `round(unit_price × qty)` when omitted.
- Validation failures and not-found return `{"error": "<message>"}` with 400/404.

## Item object

```json
{
  "description": "Oli mesin TMO 10W-40",   // required
  "unit_price": 108000,                    // required, int rupiah
  "qty": 4,                                // required, number
  "category": "rutin",                     // required, enum above
  "total": 432000,                         // optional, default unit_price*qty
  "date": "2025-07-29",                    // optional, iso date
  "checkpoint_note": "ganti tiap 5000 km", // optional, free text
  "due_date": "2026-01-29",                // optional, reminder by date
  "due_km": 185000                         // optional, reminder by ABSOLUTE odometer km
}
```

`due_km` is an absolute odometer value, not an interval: "next oil change in
3000 km" at odometer 32000 → `"due_km": 35000`.

## Endpoints

### GET /api/vehicles

```json
[
  {"id": 1, "name": "Corolla Twincam", "status": "active",
   "latest_km": 180000, "session_count": 5, "spend": 58646000}
]
```

`status` is `active` or `sold`. Sold vehicles are excluded from reminders.

### POST /api/vehicles

Request `{"name": "Yamaha NMAX 2026"}` →
`201 {"id": 5, "name": "Yamaha NMAX 2026", "status": "active"}`

### GET /api/vehicles/:id

Vehicle fields as above plus `sessions`:

```json
{"id": 4, "name": "...", "status": "active", "latest_km": 32000,
 "sessions": [
   {"id": 8, "seq": 1, "date": "2026-06-01", "odometer_km": 32000,
    "item_count": 3, "total": 190000}
 ]}
```

### GET /api/sessions/:id

Session fields plus `items` (full line_items rows, including `id`,
`checkpoint_done`).

### POST /api/vehicles/:id/sessions — new maintenance session (receipt entry)

The primary endpoint for entering a workshop receipt. Creates the session
("Perawatan ke-N", `seq` auto-incremented per vehicle) and its line items in
one call. `items` is required but may be `[]`.

```json
{
  "date": "2026-06-01",
  "odometer_km": 32000,
  "items": [
    {"description": "Oli mesin Yamalube", "unit_price": 60000, "qty": 1,
     "category": "rutin", "date": "2026-06-01",
     "due_km": 35000, "checkpoint_note": "tiap 3000 km"},
    {"description": "Jasa servis ringan", "unit_price": 85000, "qty": 1,
     "category": "rutin", "date": "2026-06-01"}
  ]
}
```

→ `201 {"id": 8, "vehicle_id": 4, "seq": 1, "date": "2026-06-01",
"odometer_km": 32000, "item_count": 2}`

### POST /api/sessions/:id/items — append to an existing session

`{"items": [item, ...]}` (non-empty) → `201 {"session_id": 8, "inserted": 1}`

### POST /api/vehicles/:id/items — sessionless expenses

For `aksesoris` / `administratif` costs not tied to a maintenance session
(pajak, STNK, accessories). Same body as above →
`201 {"vehicle_id": 4, "inserted": 1}`

### POST /api/items/:id/done — mark checkpoint handled

→ `200 {"id": 195, "checkpoint_done": 1}`. Removes the item from reminders.

### GET /api/due — currently due checkpoints

What the daily Telegram cron would send. Due = `due_date` within
`REMINDER_DAYS_AHEAD` (14) days, or `due_km` within `REMINDER_KM_AHEAD` (500)
km of the vehicle's latest session odometer.

```json
[
  {"id": 195, "description": "Oli Mesin", "due_date": "2026-04-01",
   "due_km": null, "vehicle_id": 3, "vehicle_name": "Mio Smile 2010",
   "latest_km": 61154, "overdue": true}
]
```

`overdue: true` when the date has passed or the odometer has reached `due_km`;
otherwise it is upcoming within the reminder window.

## Worked example: receipt → API call

Receipt: "Servis NMAX 14/6/2026, km 12.500 — oli mesin 60rb, oli gardan 25rb,
jasa 50rb. Oli berikutnya 15.500 km."

```sh
source .dev.vars
curl -s -X POST "$BASE_URL/api/vehicles/5/sessions" \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "date": "2026-06-14", "odometer_km": 12500,
    "items": [
      {"description": "Oli mesin", "unit_price": 60000, "qty": 1,
       "category": "rutin", "date": "2026-06-14", "due_km": 15500},
      {"description": "Oli gardan", "unit_price": 25000, "qty": 1,
       "category": "rutin", "date": "2026-06-14"},
      {"description": "Jasa servis", "unit_price": 50000, "qty": 1,
       "category": "rutin", "date": "2026-06-14"}
    ]}'
```
