# JSON API

Machine-readable version: OpenAPI spec at `<BASE_URL>/openapi.json`
(source: `public/openapi.json`), browsable Swagger UI at `<BASE_URL>/api-docs`.
Keep `public/openapi.json` in sync when changing endpoints.

Base URL and token: read `BASE_URL` and `API_TOKEN` from `.dev.vars`
(gitignored). Every request needs:

```
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

Missing/invalid token → `401 {"error": "invalid or missing API token"}`.

## Model

```
vehicles → visits → line_items
         → odometer_logs (refuels + odometer readings)
visits   → attachments (receipt photos in R2)
```

**One receipt = one visit.** A visit records date, vendor, odometer (when
known), and an optional `label` to group related visits — e.g. several shops
involved in one maintenance campaign share a label.

## Receipt entry workflow

When given a workshop receipt (photo or text), parse it and POST via this
API — never edit the database directly.

1. Read `API_TOKEN` and `BASE_URL` from `.dev.vars`. If either is missing,
   stop and ask — do not guess.
2. `GET /api/vehicles` to resolve the vehicle id. Ask the user if the receipt
   doesn't clearly match one vehicle.
3. One receipt = one visit: `POST /api/vehicles/:id/visits` with `date`,
   `vendor`, `odometer_km` (ask if a service receipt doesn't show it),
   optional grouping `label`, and `items`.
4. Normalize prices to full-rupiah integers ("60rb" → 60000, "1,2jt" → 1200000).
5. If the receipt or user mentions a next-service interval, set `due_date`
   and/or `due_km` on that item — `due_km` as absolute odometer, not interval.
6. Upload the receipt photo(s): `POST /api/visits/:id/attachments`.
7. Echo the parsed items back to the user for confirmation before posting.

## Refuel entry workflow

Photos of odometer + fuel receipt → odometer km from the dashboard photo,
date/liters/total from the receipt → `POST /api/vehicles/:id/odometer`.
Full-tank refuels keep km/l accurate. A plain odometer reading (no
liters/total) is also valid anytime — it keeps km-based reminders fresh.

## Conventions

- Money: full rupiah, integer (`108000`, never `108` or `108.000`).
- Dates: ISO `yyyy-mm-dd` strings. Anything else → 400.
- `category` (required on every item): `rutin` | `aksesoris` | `administratif`.
- No silent defaults: missing required fields → `400 {"error": "missing field: <name>"}`.
  Exception: `total` is computed as `round(unit_price × qty)` when omitted.
- `due_km` is an absolute odometer value, not an interval.
- Validation failures and not-found return `{"error": "<message>"}` with 400/404.

## Item object

```json
{
  "description": "Oli mesin Yamalube Sport",  // required
  "unit_price": 60000,                        // required, int rupiah
  "qty": 1,                                   // required, number
  "category": "rutin",                        // required, enum above
  "total": 60000,                             // optional, default unit_price*qty
  "checkpoint_note": "ganti tiap 2000 km",    // optional, free text
  "due_date": "2026-08-14",                   // optional, reminder by date
  "due_km": 51100                             // optional, reminder by ABSOLUTE km
}
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/vehicles` | vehicles + stats (`latest_km`, `visit_count`, `spend`) |
| POST | `/api/vehicles` | `{"name": "..."}` → new active vehicle |
| GET | `/api/vehicles/:id` | vehicle + visits (newest first) |
| POST | `/api/vehicles/:id/visits` | **receipt entry**: `{date, vendor?, odometer_km?, label?, items[]}` |
| GET | `/api/visits/:id` | visit + items + attachment metadata |
| POST | `/api/visits/:id/items` | append `{items: [...]}` (non-empty) |
| POST | `/api/visits/:id/attachments` | multipart upload, field `files` (image/pdf, ≤10 MB each) |
| GET | `/api/attachments/:id` | download the file (binary) |
| GET | `/api/vehicles/:id/odometer` | fuel log + km/l + averages |
| POST | `/api/vehicles/:id/odometer` | `{date, odometer_km, liters?, total?, note?}` |
| POST | `/api/items/:id/done` | mark checkpoint handled |
| GET | `/api/due` | currently due checkpoints (what the daily cron sends) |

Reminder rule: due when `due_date` within `REMINDER_DAYS_AHEAD` (14) days or
`due_km` within `REMINDER_KM_AHEAD` (500) km of the vehicle's current
odometer = max(visit odometers, odometer log). Sold vehicles excluded.

## Worked example: receipt → API calls

Receipt: "Servis NMAX di Mekar Motor 14/6/2026, km 12.500 — oli mesin 60rb,
oli gardan 25rb, jasa 50rb. Oli berikutnya 15.500 km." Photo: `struk.jpg`.

```sh
source .dev.vars
VISIT=$(curl -s -X POST "$BASE_URL/api/vehicles/5/visits" \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "date": "2026-06-14", "odometer_km": 12500, "vendor": "Mekar Motor Cibinong",
    "items": [
      {"description": "Oli mesin", "unit_price": 60000, "qty": 1,
       "category": "rutin", "due_km": 15500},
      {"description": "Oli gardan", "unit_price": 25000, "qty": 1, "category": "rutin"},
      {"description": "Jasa servis", "unit_price": 50000, "qty": 1, "category": "rutin"}
    ]}' | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

curl -s -X POST "$BASE_URL/api/visits/$VISIT/attachments" \
  -H "Authorization: Bearer $API_TOKEN" \
  -F "files=@struk.jpg;type=image/jpeg"
```
