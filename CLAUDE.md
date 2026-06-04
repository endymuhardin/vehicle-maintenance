# Garasi·Log — project notes for Claude Code

Vehicle maintenance app on Cloudflare Workers + D1. See README.md for setup
and full API docs.

## Refuel entry workflow

When given odometer + fuel receipt photos: odometer km from the dashboard
photo, date/liters/total from the receipt →
`POST /api/vehicles/:id/odometer`. See docs/API.md. Confirm parsed values
with the user before posting.

## Receipt entry workflow

When given a workshop receipt (photo or text), follow `docs/API.md` — it
contains the full workflow, endpoint reference with request/response examples,
and a worked receipt→API example. Key rules: credentials come from `.dev.vars`
(stop and ask if missing), confirm parsed items with the user before posting,
never edit the database directly.

## Conventions

- No fallback values anywhere; missing config/fields must throw.
- Server-rendered Hono JSX, no client-side JS. Styling in `public/style.css`.
- `seed.sql` and the xlsx files are personal data: gitignored, never commit.
