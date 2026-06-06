import { Env, requireIntEnv } from './env'

export type PlanAction = 'periksa' | 'ganti' | 'setel' | 'bersihkan' | 'lumasi'
export type Doer = 'diy' | 'bengkel'
export type PlanStatus = 'ok' | 'due' | 'overdue' | 'pantau' | 'no-baseline'

export type PlanItemRow = {
  id: number
  vehicle_id: number
  item: string
  action: PlanAction
  interval_km: number | null
  interval_months: number | null
  doer: Doer
  spec: string | null
  baseline_date: string | null
  baseline_km: number | null
}

export type ComputedPlanItem = PlanItemRow & {
  last_done_date: string | null   // linked completion's visit date, else baseline_date
  last_done_km: number | null     // linked completion's visit odometer, else baseline_km
  installed_desc: string | null   // description of the latest linked line item
  next_due_date: string | null
  next_due_km: number | null
  status: PlanStatus
  missing: string[]               // 'baseline_km' / 'baseline_date' — what blocks due computation
}

export type DuePlanItem = ComputedPlanItem & {
  vehicle_name: string
  latest_km: number | null
}

export type StaleOdo = {
  vehicle_id: number
  vehicle_name: string
  newest_reading_date: string | null  // null = never recorded
}

type Completion = {
  plan_item_id: number
  line_item_id: number
  description: string
  visit_date: string
  visit_km: number | null
}

const COMPLETION_SQL = `
  SELECT li.plan_item_id, li.id AS line_item_id, li.description,
         vi.date AS visit_date, vi.odometer_km AS visit_km
  FROM line_items li JOIN visits vi ON vi.id = li.visit_id
  WHERE li.plan_item_id IS NOT NULL`

// max by (visit_date, visit_km, line_item_id); null km sorts lowest
function laterCompletion(a: Completion, b: Completion): Completion {
  if (a.visit_date !== b.visit_date) return a.visit_date > b.visit_date ? a : b
  const aKm = a.visit_km ?? Number.NEGATIVE_INFINITY
  const bKm = b.visit_km ?? Number.NEGATIVE_INFINITY
  if (aKm !== bKm) return aKm > bKm ? a : b
  return a.line_item_id > b.line_item_id ? a : b
}

function latestByPlanItem(completions: Completion[]): Map<number, Completion> {
  const latest = new Map<number, Completion>()
  for (const c of completions) {
    const prev = latest.get(c.plan_item_id)
    latest.set(c.plan_item_id, prev === undefined ? c : laterCompletion(prev, c))
  }
  return latest
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

function computeItem(
  row: PlanItemRow, latest: Completion | undefined, latestKm: number | null,
  today: string, horizon: string, kmAhead: number,
): ComputedPlanItem {
  // No silent fallback across sources: a linked completion wins entirely; the
  // explicit baseline applies only when no completion is linked. A completion
  // whose visit lacks an odometer surfaces as missing km, not as stale baseline.
  const lastDoneDate = latest !== undefined ? latest.visit_date : row.baseline_date
  const lastDoneKm = latest !== undefined ? latest.visit_km : row.baseline_km
  const installedDesc = latest !== undefined ? latest.description : null

  const tracker = row.interval_km === null && row.interval_months === null
  const missing: string[] = []
  if (!tracker) {
    if (row.interval_km !== null && lastDoneKm === null) missing.push('baseline_km')
    if (row.interval_months !== null && lastDoneDate === null) missing.push('baseline_date')
  }

  const nextDueKm = row.interval_km !== null && lastDoneKm !== null ? lastDoneKm + row.interval_km : null
  const nextDueDate = row.interval_months !== null && lastDoneDate !== null
    ? addMonths(lastDoneDate, row.interval_months) : null

  let status: PlanStatus
  if (tracker) {
    status = 'pantau'
  } else if (missing.length > 0) {
    status = 'no-baseline'
  } else {
    const kmDue = nextDueKm !== null && latestKm !== null && nextDueKm <= latestKm + kmAhead
    const dateDue = nextDueDate !== null && nextDueDate <= horizon
    const overdue =
      (nextDueKm !== null && latestKm !== null && nextDueKm <= latestKm) ||
      (nextDueDate !== null && nextDueDate < today)
    status = overdue ? 'overdue' : (kmDue || dateDue ? 'due' : 'ok')
  }

  return {
    ...row,
    last_done_date: lastDoneDate,
    last_done_km: lastDoneKm,
    installed_desc: installedDesc,
    next_due_date: nextDueDate,
    next_due_km: nextDueKm,
    status,
    missing,
  }
}

function dates(env: Env, now: Date): { today: string; horizon: string; kmAhead: number } {
  const daysAhead = requireIntEnv(env, 'REMINDER_DAYS_AHEAD')
  return {
    today: now.toISOString().slice(0, 10),
    horizon: new Date(now.getTime() + daysAhead * 86400_000).toISOString().slice(0, 10),
    kmAhead: requireIntEnv(env, 'REMINDER_KM_AHEAD'),
  }
}

export async function computePlanForVehicle(
  env: Env, vehicleId: number, now: Date, latestKm: number | null,
): Promise<ComputedPlanItem[]> {
  const { today, horizon, kmAhead } = dates(env, now)
  const { results: rows } = await env.DB.prepare(
    'SELECT * FROM plan_items WHERE vehicle_id = ? ORDER BY id',
  ).bind(vehicleId).all<PlanItemRow>()
  const { results: completions } = await env.DB.prepare(
    `${COMPLETION_SQL} AND vi.vehicle_id = ?`,
  ).bind(vehicleId).all<Completion>()
  const latest = latestByPlanItem(completions)
  return rows.map((r) => computeItem(r, latest.get(r.id), latestKm, today, horizon, kmAhead))
}

// Due/overdue plan items across all active vehicles (reminder + dashboard).
export async function computeDuePlanItems(env: Env, now: Date): Promise<DuePlanItem[]> {
  const { today, horizon, kmAhead } = dates(env, now)
  const { results: rows } = await env.DB.prepare(`
    SELECT p.*, v.name AS vehicle_name,
      (SELECT MAX(mk) FROM (
        SELECT MAX(vi.odometer_km) AS mk FROM visits vi WHERE vi.vehicle_id = v.id
        UNION ALL
        SELECT MAX(o.odometer_km) FROM odometer_logs o WHERE o.vehicle_id = v.id
      )) AS latest_km
    FROM plan_items p JOIN vehicles v ON v.id = p.vehicle_id
    WHERE v.status = 'active'
    ORDER BY p.vehicle_id, p.id
  `).all<PlanItemRow & { vehicle_name: string; latest_km: number | null }>()
  const { results: completions } = await env.DB.prepare(COMPLETION_SQL).all<Completion>()
  const latest = latestByPlanItem(completions)
  return rows
    .map((r) => ({
      ...computeItem(r, latest.get(r.id), r.latest_km, today, horizon, kmAhead),
      vehicle_name: r.vehicle_name,
      latest_km: r.latest_km,
    }))
    .filter((c) => c.status === 'due' || c.status === 'overdue')
}

// Active vehicles whose newest odometer reading (visit or fuel log) is older
// than REMINDER_ODO_STALE_DAYS — or that never had one at all.
export async function findStaleOdometers(env: Env, now: Date): Promise<StaleOdo[]> {
  const staleDays = requireIntEnv(env, 'REMINDER_ODO_STALE_DAYS')
  const cutoff = new Date(now.getTime() - staleDays * 86400_000).toISOString().slice(0, 10)
  const { results } = await env.DB.prepare(`
    SELECT v.id AS vehicle_id, v.name AS vehicle_name,
      (SELECT MAX(dt) FROM (
        SELECT MAX(vi.date) AS dt FROM visits vi WHERE vi.vehicle_id = v.id AND vi.odometer_km IS NOT NULL
        UNION ALL
        SELECT MAX(o.date) FROM odometer_logs o WHERE o.vehicle_id = v.id
      )) AS newest_reading_date
    FROM vehicles v WHERE v.status = 'active' ORDER BY v.id
  `).all<StaleOdo>()
  return results.filter((r) => r.newest_reading_date === null || r.newest_reading_date < cutoff)
}
