import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { Env, requireEnv } from './env'
import { createSessionToken, verifySessionToken, SESSION_TTL_SECONDS } from './auth'
import { findDueItems, runReminderCheck } from './reminders'
import {
  Dashboard, LoginPage, SessionPage, VehiclePage,
  VehicleRow, SessionRow, ItemRow, DueRow,
} from './views'

const CATEGORIES = ['rutin', 'aksesoris', 'administratif'] as const

const app = new Hono<{ Bindings: Env }>()

// ---------- helpers ----------

function need(form: FormData, name: string): string {
  const v = form.get(name)
  if (typeof v !== 'string' || v.trim() === '') {
    throw new HTTPException(400, { message: `missing form field: ${name}` })
  }
  return v.trim()
}

function optionalField(form: FormData, name: string): string | null {
  const v = form.get(name)
  if (typeof v !== 'string' || v.trim() === '') return null
  return v.trim()
}

function needInt(value: string, name: string): number {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) throw new HTTPException(400, { message: `${name} is not an integer: ${value}` })
  return n
}

function needNum(value: string, name: string): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new HTTPException(400, { message: `${name} is not a number: ${value}` })
  return n
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
function needIsoDate(value: string, name: string): string {
  if (!ISO_DATE.test(value)) throw new HTTPException(400, { message: `${name} must be yyyy-mm-dd: ${value}` })
  return value
}

async function getVehicle(env: Env, id: number): Promise<VehicleRow> {
  const row = await env.DB.prepare(`
    SELECT v.id, v.name, v.status,
      (SELECT MAX(odometer_km) FROM sessions s WHERE s.vehicle_id = v.id) AS latest_km,
      (SELECT MAX(date) FROM sessions s WHERE s.vehicle_id = v.id) AS last_date,
      (SELECT COUNT(*) FROM sessions s WHERE s.vehicle_id = v.id) AS session_count,
      (SELECT COALESCE(SUM(total), 0) FROM line_items li WHERE li.vehicle_id = v.id) AS spend
    FROM vehicles v WHERE v.id = ?
  `).bind(id).first<VehicleRow>()
  if (!row) throw new HTTPException(404, { message: `vehicle ${id} not found` })
  return row
}

type InsertItem = {
  vehicle_id: number
  session_id: number | null
  date: string | null
  description: string
  unit_price: number
  qty: number
  total: number
  category: string
  checkpoint_note: string | null
  due_date: string | null
  due_km: number | null
}

function insertItemStmt(env: Env, it: InsertItem) {
  return env.DB.prepare(`
    INSERT INTO line_items (vehicle_id, session_id, date, description, unit_price, qty,
      total, category, checkpoint_note, due_date, due_km, checkpoint_done)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).bind(
    it.vehicle_id, it.session_id, it.date, it.description, it.unit_price, it.qty,
    it.total, it.category, it.checkpoint_note, it.due_date, it.due_km,
  )
}

// ---------- API (Bearer token, JSON) ----------

const api = new Hono<{ Bindings: Env }>()

api.use('*', async (c, next) => {
  const expected = `Bearer ${requireEnv(c.env, 'API_TOKEN')}`
  if (c.req.header('Authorization') !== expected) {
    throw new HTTPException(401, { message: 'invalid or missing API token' })
  }
  await next()
})

function jsonField(obj: Record<string, unknown>, key: string): unknown {
  if (!(key in obj) || obj[key] === null || obj[key] === undefined || obj[key] === '') {
    throw new HTTPException(400, { message: `missing field: ${key}` })
  }
  return obj[key]
}

function jsonString(obj: Record<string, unknown>, key: string): string {
  const v = jsonField(obj, key)
  if (typeof v !== 'string') throw new HTTPException(400, { message: `${key} must be a string` })
  return v
}

function jsonNumber(obj: Record<string, unknown>, key: string): number {
  const v = jsonField(obj, key)
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new HTTPException(400, { message: `${key} must be a number` })
  }
  return v
}

function jsonOptString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key]
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string') throw new HTTPException(400, { message: `${key} must be a string` })
  return v
}

function jsonOptNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key]
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new HTTPException(400, { message: `${key} must be a number` })
  }
  return v
}

function parseApiItem(raw: unknown, vehicleId: number, sessionId: number | null): InsertItem {
  if (typeof raw !== 'object' || raw === null) {
    throw new HTTPException(400, { message: 'item must be an object' })
  }
  const obj = raw as Record<string, unknown>
  const description = jsonString(obj, 'description')
  const unitPrice = jsonNumber(obj, 'unit_price')
  const qty = jsonNumber(obj, 'qty')
  const total = jsonOptNumber(obj, 'total') ?? Math.round(unitPrice * qty)
  const category = jsonString(obj, 'category')
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    throw new HTTPException(400, { message: `category must be one of: ${CATEGORIES.join(', ')}` })
  }
  const date = jsonOptString(obj, 'date')
  if (date !== null) needIsoDate(date, 'date')
  const dueDate = jsonOptString(obj, 'due_date')
  if (dueDate !== null) needIsoDate(dueDate, 'due_date')
  return {
    vehicle_id: vehicleId,
    session_id: sessionId,
    date,
    description,
    unit_price: unitPrice,
    qty,
    total,
    category,
    checkpoint_note: jsonOptString(obj, 'checkpoint_note'),
    due_date: dueDate,
    due_km: jsonOptNumber(obj, 'due_km'),
  }
}

api.get('/vehicles', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT v.id, v.name, v.status,
      (SELECT MAX(odometer_km) FROM sessions s WHERE s.vehicle_id = v.id) AS latest_km,
      (SELECT COUNT(*) FROM sessions s WHERE s.vehicle_id = v.id) AS session_count,
      (SELECT COALESCE(SUM(total), 0) FROM line_items li WHERE li.vehicle_id = v.id) AS spend
    FROM vehicles v ORDER BY v.id
  `).all()
  return c.json(results)
})

api.post('/vehicles', async (c) => {
  const body = await c.req.json<Record<string, unknown>>()
  const name = jsonString(body, 'name')
  const result = await c.env.DB.prepare('INSERT INTO vehicles (name, status) VALUES (?, ?)')
    .bind(name, 'active').run()
  return c.json({ id: result.meta.last_row_id, name, status: 'active' }, 201)
})

api.get('/vehicles/:id', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const vehicle = await getVehicle(c.env, id)
  const { results: sessions } = await c.env.DB.prepare(`
    SELECT s.id, s.seq, s.date, s.odometer_km,
      (SELECT COUNT(*) FROM line_items li WHERE li.session_id = s.id) AS item_count,
      (SELECT COALESCE(SUM(total), 0) FROM line_items li WHERE li.session_id = s.id) AS total
    FROM sessions s WHERE s.vehicle_id = ? ORDER BY s.seq
  `).bind(id).all()
  return c.json({ ...vehicle, sessions })
})

api.get('/sessions/:id', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first()
  if (!session) throw new HTTPException(404, { message: `session ${id} not found` })
  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM line_items WHERE session_id = ? ORDER BY id',
  ).bind(id).all()
  return c.json({ ...session, items })
})

// Batch create: a session plus its line items in one call (receipt-friendly).
api.post('/vehicles/:id/sessions', async (c) => {
  const vehicleId = needInt(c.req.param('id'), 'id')
  await getVehicle(c.env, vehicleId)
  const body = await c.req.json<Record<string, unknown>>()
  const date = needIsoDate(jsonString(body, 'date'), 'date')
  const odometerKm = jsonNumber(body, 'odometer_km')
  if (!Array.isArray(body.items)) {
    throw new HTTPException(400, { message: 'items must be an array (may be empty)' })
  }

  const seqRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM sessions WHERE vehicle_id = ?',
  ).bind(vehicleId).first<{ next_seq: number }>()
  const seq = seqRow!.next_seq

  const result = await c.env.DB.prepare(
    'INSERT INTO sessions (vehicle_id, seq, date, odometer_km) VALUES (?, ?, ?, ?)',
  ).bind(vehicleId, seq, date, odometerKm).run()
  const sessionId = result.meta.last_row_id as number

  const items = body.items.map((raw) => parseApiItem(raw, vehicleId, sessionId))
  if (items.length > 0) {
    await c.env.DB.batch(items.map((it) => insertItemStmt(c.env, it)))
  }
  return c.json({ id: sessionId, vehicle_id: vehicleId, seq, date, odometer_km: odometerKm, item_count: items.length }, 201)
})

// Append items to an existing session.
api.post('/sessions/:id/items', async (c) => {
  const sessionId = needInt(c.req.param('id'), 'id')
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ?')
    .bind(sessionId).first<{ vehicle_id: number }>()
  if (!session) throw new HTTPException(404, { message: `session ${sessionId} not found` })
  const body = await c.req.json<Record<string, unknown>>()
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new HTTPException(400, { message: 'items must be a non-empty array' })
  }
  const items = body.items.map((raw) => parseApiItem(raw, session.vehicle_id, sessionId))
  await c.env.DB.batch(items.map((it) => insertItemStmt(c.env, it)))
  return c.json({ session_id: sessionId, inserted: items.length }, 201)
})

// Sessionless expenses (aksesoris / administratif).
api.post('/vehicles/:id/items', async (c) => {
  const vehicleId = needInt(c.req.param('id'), 'id')
  await getVehicle(c.env, vehicleId)
  const body = await c.req.json<Record<string, unknown>>()
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new HTTPException(400, { message: 'items must be a non-empty array' })
  }
  const items = body.items.map((raw) => parseApiItem(raw, vehicleId, null))
  await c.env.DB.batch(items.map((it) => insertItemStmt(c.env, it)))
  return c.json({ vehicle_id: vehicleId, inserted: items.length }, 201)
})

api.post('/items/:id/done', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const result = await c.env.DB.prepare('UPDATE line_items SET checkpoint_done = 1 WHERE id = ?').bind(id).run()
  if (result.meta.changes === 0) throw new HTTPException(404, { message: `item ${id} not found` })
  return c.json({ id, checkpoint_done: 1 })
})

api.get('/due', async (c) => {
  return c.json(await findDueItems(c.env, new Date()))
})

app.route('/api', api)

// ---------- web auth ----------

app.get('/login', (c) => c.html(<LoginPage />))

app.post('/login', async (c) => {
  const form = await c.req.formData()
  const password = need(form, 'password')
  if (password !== requireEnv(c.env, 'APP_PASSWORD')) {
    return c.html(<LoginPage error="Kata sandi salah." />, 401)
  }
  const token = await createSessionToken(requireEnv(c.env, 'SESSION_SECRET'), Date.now())
  setCookie(c, 'session', token, {
    httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL_SECONDS,
  })
  return c.redirect('/')
})

app.post('/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.redirect('/login')
})

app.use('*', async (c, next) => {
  const token = getCookie(c, 'session')
  if (!token || !(await verifySessionToken(requireEnv(c.env, 'SESSION_SECRET'), token, Date.now()))) {
    return c.redirect('/login')
  }
  await next()
})

// ---------- web pages ----------

app.get('/', async (c) => {
  const { results: vehicles } = await c.env.DB.prepare(`
    SELECT v.id, v.name, v.status,
      (SELECT MAX(odometer_km) FROM sessions s WHERE s.vehicle_id = v.id) AS latest_km,
      (SELECT MAX(date) FROM sessions s WHERE s.vehicle_id = v.id) AS last_date,
      (SELECT COUNT(*) FROM sessions s WHERE s.vehicle_id = v.id) AS session_count,
      (SELECT COALESCE(SUM(total), 0) FROM line_items li WHERE li.vehicle_id = v.id) AS spend
    FROM vehicles v
    ORDER BY v.status = 'active' DESC, v.id
  `).all<VehicleRow>()

  const due: DueRow[] = await findDueItems(c.env, new Date())
  return c.html(<Dashboard vehicles={vehicles} due={due} />)
})

app.post('/vehicles', async (c) => {
  const form = await c.req.formData()
  const name = need(form, 'name')
  const result = await c.env.DB.prepare('INSERT INTO vehicles (name, status) VALUES (?, ?)')
    .bind(name, 'active').run()
  return c.redirect(`/vehicles/${result.meta.last_row_id}`)
})

app.get('/vehicles/:id', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const vehicle = await getVehicle(c.env, id)
  const { results: sessions } = await c.env.DB.prepare(`
    SELECT s.id, s.vehicle_id, s.seq, s.date, s.odometer_km,
      (SELECT COUNT(*) FROM line_items li WHERE li.session_id = s.id) AS item_count,
      (SELECT COALESCE(SUM(total), 0) FROM line_items li WHERE li.session_id = s.id) AS total
    FROM sessions s WHERE s.vehicle_id = ? ORDER BY s.seq DESC
  `).bind(id).all<SessionRow>()
  const { results: extras } = await c.env.DB.prepare(
    'SELECT * FROM line_items WHERE vehicle_id = ? AND session_id IS NULL ORDER BY date, id',
  ).bind(id).all<ItemRow>()
  return c.html(<VehiclePage vehicle={vehicle} sessions={sessions} extras={extras} />)
})

app.post('/vehicles/:id/status', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const form = await c.req.formData()
  const status = need(form, 'status')
  if (status !== 'active' && status !== 'sold') {
    throw new HTTPException(400, { message: `invalid status: ${status}` })
  }
  const result = await c.env.DB.prepare('UPDATE vehicles SET status = ? WHERE id = ?').bind(status, id).run()
  if (result.meta.changes === 0) throw new HTTPException(404, { message: `vehicle ${id} not found` })
  return c.redirect(`/vehicles/${id}`)
})

app.post('/vehicles/:id/sessions', async (c) => {
  const vehicleId = needInt(c.req.param('id'), 'id')
  await getVehicle(c.env, vehicleId)
  const form = await c.req.formData()
  const date = needIsoDate(need(form, 'date'), 'date')
  const odometerKm = needInt(need(form, 'odometer_km'), 'odometer_km')
  const seqRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM sessions WHERE vehicle_id = ?',
  ).bind(vehicleId).first<{ next_seq: number }>()
  const result = await c.env.DB.prepare(
    'INSERT INTO sessions (vehicle_id, seq, date, odometer_km) VALUES (?, ?, ?, ?)',
  ).bind(vehicleId, seqRow!.next_seq, date, odometerKm).run()
  return c.redirect(`/sessions/${result.meta.last_row_id}`)
})

app.get('/sessions/:id', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const session = await c.env.DB.prepare(`
    SELECT s.id, s.vehicle_id, s.seq, s.date, s.odometer_km,
      (SELECT COUNT(*) FROM line_items li WHERE li.session_id = s.id) AS item_count,
      (SELECT COALESCE(SUM(total), 0) FROM line_items li WHERE li.session_id = s.id) AS total
    FROM sessions s WHERE s.id = ?
  `).bind(id).first<SessionRow>()
  if (!session) throw new HTTPException(404, { message: `session ${id} not found` })
  const vehicle = await getVehicle(c.env, session.vehicle_id)
  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM line_items WHERE session_id = ? ORDER BY date, id',
  ).bind(id).all<ItemRow>()
  return c.html(<SessionPage vehicle={vehicle} session={session} items={items} />)
})

app.post('/sessions/:id/items', async (c) => {
  const sessionId = needInt(c.req.param('id'), 'id')
  const session = await c.env.DB.prepare('SELECT vehicle_id FROM sessions WHERE id = ?')
    .bind(sessionId).first<{ vehicle_id: number }>()
  if (!session) throw new HTTPException(404, { message: `session ${sessionId} not found` })
  const form = await c.req.formData()
  const unitPrice = needNum(need(form, 'unit_price'), 'unit_price')
  const qty = needNum(need(form, 'qty'), 'qty')
  const dueDateRaw = optionalField(form, 'due_date')
  const dueKmRaw = optionalField(form, 'due_km')
  await insertItemStmt(c.env, {
    vehicle_id: session.vehicle_id,
    session_id: sessionId,
    date: needIsoDate(need(form, 'date'), 'date'),
    description: need(form, 'description'),
    unit_price: unitPrice,
    qty,
    total: Math.round(unitPrice * qty),
    category: 'rutin',
    checkpoint_note: optionalField(form, 'checkpoint_note'),
    due_date: dueDateRaw === null ? null : needIsoDate(dueDateRaw, 'due_date'),
    due_km: dueKmRaw === null ? null : needInt(dueKmRaw, 'due_km'),
  }).run()
  return c.redirect(`/sessions/${sessionId}`)
})

app.post('/vehicles/:id/items', async (c) => {
  const vehicleId = needInt(c.req.param('id'), 'id')
  await getVehicle(c.env, vehicleId)
  const form = await c.req.formData()
  const category = need(form, 'category')
  if (category !== 'aksesoris' && category !== 'administratif') {
    throw new HTTPException(400, { message: `invalid category: ${category}` })
  }
  const unitPrice = needNum(need(form, 'unit_price'), 'unit_price')
  const qty = needNum(need(form, 'qty'), 'qty')
  await insertItemStmt(c.env, {
    vehicle_id: vehicleId,
    session_id: null,
    date: needIsoDate(need(form, 'date'), 'date'),
    description: need(form, 'description'),
    unit_price: unitPrice,
    qty,
    total: Math.round(unitPrice * qty),
    category,
    checkpoint_note: null,
    due_date: null,
    due_km: null,
  }).run()
  return c.redirect(`/vehicles/${vehicleId}`)
})

app.post('/items/:id/done', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const item = await c.env.DB.prepare('SELECT session_id, vehicle_id FROM line_items WHERE id = ?')
    .bind(id).first<{ session_id: number | null; vehicle_id: number }>()
  if (!item) throw new HTTPException(404, { message: `item ${id} not found` })
  await c.env.DB.prepare('UPDATE line_items SET checkpoint_done = 1 WHERE id = ?').bind(id).run()
  const back = c.req.header('Referer')
  return c.redirect(back ?? (item.session_id !== null ? `/sessions/${item.session_id}` : `/vehicles/${item.vehicle_id}`))
})

app.post('/items/:id/delete', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const item = await c.env.DB.prepare('SELECT session_id, vehicle_id FROM line_items WHERE id = ?')
    .bind(id).first<{ session_id: number | null; vehicle_id: number }>()
  if (!item) throw new HTTPException(404, { message: `item ${id} not found` })
  await c.env.DB.prepare('DELETE FROM line_items WHERE id = ?').bind(id).run()
  return c.redirect(item.session_id !== null ? `/sessions/${item.session_id}` : `/vehicles/${item.vehicle_id}`)
})

// ---------- error handling ----------

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const accept = c.req.header('Accept')
    if (c.req.path.startsWith('/api') || (accept !== undefined && accept.includes('application/json'))) {
      return c.json({ error: err.message }, err.status)
    }
    return c.text(err.message, err.status)
  }
  console.error(err)
  return c.text(`internal error: ${err.message}`, 500)
})

// ---------- cron ----------

async function scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(
    runReminderCheck(env, new Date()).then((n) => {
      console.log(`reminder check done, ${n} due item(s) notified`)
    }),
  )
}

export default { fetch: app.fetch, scheduled }
