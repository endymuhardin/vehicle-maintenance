import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { Env, requireEnv } from './env'
import { createSessionToken, verifySessionToken, SESSION_TTL_SECONDS } from './auth'
import { findDueItems, runReminderCheck } from './reminders'
import { fuelLog } from './fuel'
import {
  Dashboard, LoginPage, VisitPage, VehiclePage,
  VehicleRow, VisitRow, ItemRow, AttachmentRow, DueRow,
} from './views'

const CATEGORIES = ['rutin', 'aksesoris', 'administratif'] as const
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const ATTACHMENT_TYPES = /^(image\/|application\/pdf$)/

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

const LATEST_KM_SQL = `(SELECT MAX(mk) FROM (
  SELECT MAX(vi.odometer_km) AS mk FROM visits vi WHERE vi.vehicle_id = v.id
  UNION ALL
  SELECT MAX(o.odometer_km) FROM odometer_logs o WHERE o.vehicle_id = v.id
))`

const VEHICLE_SQL = `
  SELECT v.id, v.name, v.status,
    ${LATEST_KM_SQL} AS latest_km,
    (SELECT MAX(vi.date) FROM visits vi WHERE vi.vehicle_id = v.id) AS last_date,
    (SELECT COUNT(*) FROM visits vi WHERE vi.vehicle_id = v.id) AS visit_count,
    (SELECT COALESCE(SUM(li.total), 0) FROM line_items li
      JOIN visits vi ON vi.id = li.visit_id WHERE vi.vehicle_id = v.id) AS spend
  FROM vehicles v`

const VISIT_SQL = `
  SELECT vi.id, vi.vehicle_id, vi.date, vi.odometer_km, vi.vendor, vi.label,
    (SELECT COUNT(*) FROM line_items li WHERE li.visit_id = vi.id) AS item_count,
    (SELECT COALESCE(SUM(li.total), 0) FROM line_items li WHERE li.visit_id = vi.id) AS total
  FROM visits vi`

async function getVehicle(env: Env, id: number): Promise<VehicleRow> {
  const row = await env.DB.prepare(`${VEHICLE_SQL} WHERE v.id = ?`).bind(id).first<VehicleRow>()
  if (!row) throw new HTTPException(404, { message: `vehicle ${id} not found` })
  return row
}

async function getVisit(env: Env, id: number): Promise<VisitRow> {
  const row = await env.DB.prepare(`${VISIT_SQL} WHERE vi.id = ?`).bind(id).first<VisitRow>()
  if (!row) throw new HTTPException(404, { message: `visit ${id} not found` })
  return row
}

type InsertItem = {
  visit_id: number
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
    INSERT INTO line_items (visit_id, description, unit_price, qty, total, category,
      checkpoint_note, due_date, due_km, checkpoint_done)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).bind(
    it.visit_id, it.description, it.unit_price, it.qty, it.total, it.category,
    it.checkpoint_note, it.due_date, it.due_km,
  )
}

async function insertVisit(
  env: Env, vehicleId: number,
  v: { date: string; odometer_km: number | null; vendor: string | null; label: string | null },
): Promise<number> {
  const result = await env.DB.prepare(
    'INSERT INTO visits (vehicle_id, date, odometer_km, vendor, label) VALUES (?, ?, ?, ?, ?)',
  ).bind(vehicleId, v.date, v.odometer_km, v.vendor, v.label).run()
  return result.meta.last_row_id as number
}

type AttachmentOwner = { visit_id: number } | { odometer_log_id: number }

async function storeAttachments(
  env: Env, owner: AttachmentOwner, files: File[], required = true,
): Promise<{ id: number; filename: string; size: number }[]> {
  if (files.length === 0) {
    if (!required) return []
    throw new HTTPException(400, { message: 'no files uploaded' })
  }
  const visitId = 'visit_id' in owner ? owner.visit_id : null
  const logId = 'odometer_log_id' in owner ? owner.odometer_log_id : null
  const prefix = visitId !== null ? `visits/${visitId}` : `fuel/${logId}`
  const stored: { id: number; filename: string; size: number }[] = []
  for (const file of files) {
    if (!ATTACHMENT_TYPES.test(file.type)) {
      throw new HTTPException(400, { message: `unsupported file type: ${file.type} (${file.name})` })
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new HTTPException(400, { message: `file too large (max 10 MB): ${file.name}` })
    }
    const key = `${prefix}/${crypto.randomUUID()}-${file.name}`
    await env.RECEIPTS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    })
    const result = await env.DB.prepare(`
      INSERT INTO attachments (visit_id, odometer_log_id, r2_key, filename, content_type, size, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(visitId, logId, key, file.name, file.type, file.size, new Date().toISOString()).run()
    stored.push({ id: result.meta.last_row_id as number, filename: file.name, size: file.size })
  }
  return stored
}

function formFiles(body: Record<string, unknown>): File[] {
  const raw = body['files']
  const list = Array.isArray(raw) ? raw : [raw]
  return list.filter((f): f is File => f instanceof File)
}

async function serveAttachment(env: Env, id: number): Promise<Response> {
  const meta = await env.DB.prepare('SELECT r2_key, filename, content_type FROM attachments WHERE id = ?')
    .bind(id).first<{ r2_key: string; filename: string; content_type: string }>()
  if (!meta) throw new HTTPException(404, { message: `attachment ${id} not found` })
  const obj = await env.RECEIPTS.get(meta.r2_key)
  if (!obj) throw new HTTPException(404, { message: `attachment object missing in storage: ${meta.r2_key}` })
  return new Response(obj.body, {
    headers: {
      'Content-Type': meta.content_type,
      'Content-Disposition': `inline; filename="${meta.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=31536000',
    },
  })
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

function parseApiItem(raw: unknown, visitId: number): InsertItem {
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
  const dueDate = jsonOptString(obj, 'due_date')
  if (dueDate !== null) needIsoDate(dueDate, 'due_date')
  return {
    visit_id: visitId,
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
  const { results } = await c.env.DB.prepare(`${VEHICLE_SQL} ORDER BY v.id`).all()
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
  const { results: visits } = await c.env.DB.prepare(
    `${VISIT_SQL} WHERE vi.vehicle_id = ? ORDER BY vi.date DESC, vi.id DESC`,
  ).bind(id).all()
  return c.json({ ...vehicle, visits })
})

api.get('/visits/:id', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const visit = await getVisit(c.env, id)
  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM line_items WHERE visit_id = ? ORDER BY id',
  ).bind(id).all()
  const { results: attachments } = await c.env.DB.prepare(
    'SELECT id, visit_id, filename, content_type, size, uploaded_at FROM attachments WHERE visit_id = ? ORDER BY id',
  ).bind(id).all()
  return c.json({ ...visit, items, attachments })
})

// Create a visit with its line items in one call (receipt entry).
api.post('/vehicles/:id/visits', async (c) => {
  const vehicleId = needInt(c.req.param('id'), 'id')
  await getVehicle(c.env, vehicleId)
  const body = await c.req.json<Record<string, unknown>>()
  const date = needIsoDate(jsonString(body, 'date'), 'date')
  if (!Array.isArray(body.items)) {
    throw new HTTPException(400, { message: 'items must be an array (may be empty)' })
  }
  const visitId = await insertVisit(c.env, vehicleId, {
    date,
    odometer_km: jsonOptNumber(body, 'odometer_km'),
    vendor: jsonOptString(body, 'vendor'),
    label: jsonOptString(body, 'label'),
  })
  const items = body.items.map((raw) => parseApiItem(raw, visitId))
  if (items.length > 0) {
    await c.env.DB.batch(items.map((it) => insertItemStmt(c.env, it)))
  }
  return c.json({ id: visitId, vehicle_id: vehicleId, date, item_count: items.length }, 201)
})

api.post('/visits/:id/items', async (c) => {
  const visitId = needInt(c.req.param('id'), 'id')
  await getVisit(c.env, visitId)
  const body = await c.req.json<Record<string, unknown>>()
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new HTTPException(400, { message: 'items must be a non-empty array' })
  }
  const items = body.items.map((raw) => parseApiItem(raw, visitId))
  await c.env.DB.batch(items.map((it) => insertItemStmt(c.env, it)))
  return c.json({ visit_id: visitId, inserted: items.length }, 201)
})

// Receipt photos: multipart/form-data, field "files" (repeatable).
api.post('/visits/:id/attachments', async (c) => {
  const visitId = needInt(c.req.param('id'), 'id')
  await getVisit(c.env, visitId)
  const body = await c.req.parseBody({ all: true })
  const stored = await storeAttachments(c.env, { visit_id: visitId }, formFiles(body))
  return c.json({ visit_id: visitId, uploaded: stored }, 201)
})

// Refuel photos (odometer + struk SPBU): multipart, field "files".
api.post('/odometer/:id/attachments', async (c) => {
  const logId = needInt(c.req.param('id'), 'id')
  const log = await c.env.DB.prepare('SELECT id FROM odometer_logs WHERE id = ?').bind(logId).first()
  if (!log) throw new HTTPException(404, { message: `odometer log ${logId} not found` })
  const body = await c.req.parseBody({ all: true })
  const stored = await storeAttachments(c.env, { odometer_log_id: logId }, formFiles(body))
  return c.json({ odometer_log_id: logId, uploaded: stored }, 201)
})

api.get('/attachments/:id', async (c) => {
  return serveAttachment(c.env, needInt(c.req.param('id'), 'id'))
})

api.delete('/attachments/:id', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const meta = await c.env.DB.prepare('SELECT r2_key FROM attachments WHERE id = ?')
    .bind(id).first<{ r2_key: string }>()
  if (!meta) throw new HTTPException(404, { message: `attachment ${id} not found` })
  await c.env.RECEIPTS.delete(meta.r2_key)
  await c.env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run()
  return c.json({ id, deleted: true })
})

// Odometer / fuel log. liters+total present = refuel entry, both absent =
// plain odometer reading.
api.get('/vehicles/:id/odometer', async (c) => {
  const vehicleId = needInt(c.req.param('id'), 'id')
  await getVehicle(c.env, vehicleId)
  return c.json(await fuelLog(c.env, vehicleId))
})

api.post('/vehicles/:id/odometer', async (c) => {
  const vehicleId = needInt(c.req.param('id'), 'id')
  await getVehicle(c.env, vehicleId)
  const body = await c.req.json<Record<string, unknown>>()
  const date = needIsoDate(jsonString(body, 'date'), 'date')
  const odometerKm = jsonNumber(body, 'odometer_km')
  const liters = jsonOptNumber(body, 'liters')
  const total = jsonOptNumber(body, 'total')
  if ((liters === null) !== (total === null)) {
    throw new HTTPException(400, { message: 'liters and total must be provided together' })
  }
  const result = await c.env.DB.prepare(
    'INSERT INTO odometer_logs (vehicle_id, date, odometer_km, liters, total, note) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(vehicleId, date, odometerKm, liters, total, jsonOptString(body, 'note')).run()
  const id = result.meta.last_row_id as number
  const log = await fuelLog(c.env, vehicleId)
  const entry = log.entries.find((e) => e.id === id)
  if (!entry) throw new Error(`inserted odometer log ${id} not found`)
  return c.json({ ...entry, avg_km_per_liter: log.avg_km_per_liter }, 201)
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
  const { results: vehicles } = await c.env.DB.prepare(
    `${VEHICLE_SQL} ORDER BY v.status = 'active' DESC, v.id`,
  ).all<VehicleRow>()
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
  const { results: visits } = await c.env.DB.prepare(
    `${VISIT_SQL} WHERE vi.vehicle_id = ? ORDER BY vi.date DESC, vi.id DESC`,
  ).bind(id).all<VisitRow>()
  const fuel = await fuelLog(c.env, id)
  return c.html(<VehiclePage vehicle={vehicle} visits={visits} fuel={fuel} />)
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

app.post('/vehicles/:id/visits', async (c) => {
  const vehicleId = needInt(c.req.param('id'), 'id')
  await getVehicle(c.env, vehicleId)
  const form = await c.req.formData()
  const odoRaw = optionalField(form, 'odometer_km')
  const visitId = await insertVisit(c.env, vehicleId, {
    date: needIsoDate(need(form, 'date'), 'date'),
    odometer_km: odoRaw === null ? null : needInt(odoRaw, 'odometer_km'),
    vendor: optionalField(form, 'vendor'),
    label: optionalField(form, 'label'),
  })
  return c.redirect(`/visits/${visitId}`)
})

app.get('/visits/:id', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const visit = await getVisit(c.env, id)
  const vehicle = await getVehicle(c.env, visit.vehicle_id)
  const { results: items } = await c.env.DB.prepare(
    'SELECT * FROM line_items WHERE visit_id = ? ORDER BY id',
  ).bind(id).all<ItemRow>()
  const { results: attachments } = await c.env.DB.prepare(
    'SELECT id, visit_id, filename, content_type, size, uploaded_at FROM attachments WHERE visit_id = ? ORDER BY id',
  ).bind(id).all<AttachmentRow>()
  return c.html(<VisitPage vehicle={vehicle} visit={visit} items={items} attachments={attachments} />)
})

app.post('/visits/:id/items', async (c) => {
  const visitId = needInt(c.req.param('id'), 'id')
  await getVisit(c.env, visitId)
  const form = await c.req.formData()
  const category = need(form, 'category')
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    throw new HTTPException(400, { message: `invalid category: ${category}` })
  }
  const unitPrice = needNum(need(form, 'unit_price'), 'unit_price')
  const qty = needNum(need(form, 'qty'), 'qty')
  const dueDateRaw = optionalField(form, 'due_date')
  const dueKmRaw = optionalField(form, 'due_km')
  await insertItemStmt(c.env, {
    visit_id: visitId,
    description: need(form, 'description'),
    unit_price: unitPrice,
    qty,
    total: Math.round(unitPrice * qty),
    category,
    checkpoint_note: optionalField(form, 'checkpoint_note'),
    due_date: dueDateRaw === null ? null : needIsoDate(dueDateRaw, 'due_date'),
    due_km: dueKmRaw === null ? null : needInt(dueKmRaw, 'due_km'),
  }).run()
  return c.redirect(`/visits/${visitId}`)
})

app.post('/visits/:id/attachments', async (c) => {
  const visitId = needInt(c.req.param('id'), 'id')
  await getVisit(c.env, visitId)
  const body = await c.req.parseBody({ all: true })
  await storeAttachments(c.env, { visit_id: visitId }, formFiles(body))
  return c.redirect(`/visits/${visitId}`)
})

app.get('/attachments/:id', async (c) => {
  return serveAttachment(c.env, needInt(c.req.param('id'), 'id'))
})

app.post('/attachments/:id/delete', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const meta = await c.env.DB.prepare(`
    SELECT a.visit_id, a.odometer_log_id, a.r2_key, o.vehicle_id AS log_vehicle_id
    FROM attachments a LEFT JOIN odometer_logs o ON o.id = a.odometer_log_id
    WHERE a.id = ?
  `).bind(id).first<{ visit_id: number | null; odometer_log_id: number | null; r2_key: string; log_vehicle_id: number | null }>()
  if (!meta) throw new HTTPException(404, { message: `attachment ${id} not found` })
  await c.env.RECEIPTS.delete(meta.r2_key)
  await c.env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run()
  return c.redirect(meta.visit_id !== null ? `/visits/${meta.visit_id}` : `/vehicles/${meta.log_vehicle_id}`)
})

app.post('/vehicles/:id/odometer', async (c) => {
  const vehicleId = needInt(c.req.param('id'), 'id')
  await getVehicle(c.env, vehicleId)
  const form = await c.req.formData()
  const date = needIsoDate(need(form, 'date'), 'date')
  const odometerKm = needInt(need(form, 'odometer_km'), 'odometer_km')
  const litersRaw = optionalField(form, 'liters')
  const totalRaw = optionalField(form, 'total')
  if ((litersRaw === null) !== (totalRaw === null)) {
    throw new HTTPException(400, { message: 'liter dan total harus diisi bersamaan' })
  }
  const result = await c.env.DB.prepare(
    'INSERT INTO odometer_logs (vehicle_id, date, odometer_km, liters, total, note) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(
    vehicleId, date, odometerKm,
    litersRaw === null ? null : needNum(litersRaw, 'liters'),
    totalRaw === null ? null : needNum(totalRaw, 'total'),
    optionalField(form, 'note'),
  ).run()
  const files = (form.getAll('files') as unknown[])
    .filter((f): f is File => f instanceof File && f.size > 0)
  await storeAttachments(c.env, { odometer_log_id: result.meta.last_row_id as number }, files, false)
  return c.redirect(`/vehicles/${vehicleId}`)
})

app.post('/odometer/:id/delete', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const row = await c.env.DB.prepare('SELECT vehicle_id FROM odometer_logs WHERE id = ?')
    .bind(id).first<{ vehicle_id: number }>()
  if (!row) throw new HTTPException(404, { message: `odometer log ${id} not found` })
  await c.env.DB.prepare('DELETE FROM odometer_logs WHERE id = ?').bind(id).run()
  return c.redirect(`/vehicles/${row.vehicle_id}`)
})

app.post('/items/:id/done', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const item = await c.env.DB.prepare('SELECT visit_id FROM line_items WHERE id = ?')
    .bind(id).first<{ visit_id: number }>()
  if (!item) throw new HTTPException(404, { message: `item ${id} not found` })
  await c.env.DB.prepare('UPDATE line_items SET checkpoint_done = 1 WHERE id = ?').bind(id).run()
  const back = c.req.header('Referer')
  return c.redirect(back ?? `/visits/${item.visit_id}`)
})

app.post('/items/:id/delete', async (c) => {
  const id = needInt(c.req.param('id'), 'id')
  const item = await c.env.DB.prepare('SELECT visit_id FROM line_items WHERE id = ?')
    .bind(id).first<{ visit_id: number }>()
  if (!item) throw new HTTPException(404, { message: `item ${id} not found` })
  await c.env.DB.prepare('DELETE FROM line_items WHERE id = ?').bind(id).run()
  return c.redirect(`/visits/${item.visit_id}`)
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
