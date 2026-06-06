import { Env, requireEnv, requireIntEnv } from './env'
import { computeDuePlanItems, findStaleOdometers, DuePlanItem, StaleOdo } from './plan'

export type DueItem = {
  id: number
  description: string
  vehicle_id: number
  vehicle_name: string
  due_date: string | null
  due_km: number | null
  latest_km: number | null
  overdue: boolean
}

// A checkpoint is "due" when its due_date falls within REMINDER_DAYS_AHEAD days,
// or its due_km is within REMINDER_KM_AHEAD of the vehicle's latest recorded odometer.
export async function findDueItems(env: Env, now: Date): Promise<DueItem[]> {
  const daysAhead = requireIntEnv(env, 'REMINDER_DAYS_AHEAD')
  const kmAhead = requireIntEnv(env, 'REMINDER_KM_AHEAD')
  const today = now.toISOString().slice(0, 10)
  const horizon = new Date(now.getTime() + daysAhead * 86400_000).toISOString().slice(0, 10)

  const { results } = await env.DB.prepare(`
    SELECT li.id, li.description, li.due_date, li.due_km,
           v.id AS vehicle_id, v.name AS vehicle_name,
           (SELECT MAX(mk) FROM (
              SELECT MAX(vi2.odometer_km) AS mk FROM visits vi2 WHERE vi2.vehicle_id = v.id
              UNION ALL
              SELECT MAX(o.odometer_km) FROM odometer_logs o WHERE o.vehicle_id = v.id
           )) AS latest_km
    FROM line_items li
    JOIN visits vi ON vi.id = li.visit_id
    JOIN vehicles v ON v.id = vi.vehicle_id
    WHERE li.checkpoint_done = 0
      AND v.status = 'active'
      AND (li.due_date IS NOT NULL OR li.due_km IS NOT NULL)
    ORDER BY li.due_date, li.due_km
  `).all<Omit<DueItem, 'overdue'>>()

  const due: DueItem[] = []
  for (const row of results) {
    const dateDue = row.due_date !== null && row.due_date <= horizon
    const kmDue = row.due_km !== null && row.latest_km !== null && row.due_km <= row.latest_km + kmAhead
    if (!dateDue && !kmDue) continue
    const overdue =
      (row.due_date !== null && row.due_date < today) ||
      (row.due_km !== null && row.latest_km !== null && row.due_km <= row.latest_km)
    due.push({ ...row, overdue })
  }
  return due
}

async function sendTelegram(env: Env, text: string): Promise<void> {
  const token = requireEnv(env, 'TELEGRAM_BOT_TOKEN')
  const chatId = requireEnv(env, 'TELEGRAM_CHAT_ID')
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  if (!res.ok) {
    throw new Error(`telegram sendMessage failed: ${res.status} ${await res.text()}`)
  }
}

const km = (n: number) => `${n.toLocaleString('id-ID')} km`

function checkpointLine(d: DueItem): string {
  const parts: string[] = []
  if (d.due_date) parts.push(`jatuh tempo ${d.due_date}`)
  if (d.due_km !== null) parts.push(`di ${km(d.due_km)} (sekarang ${d.latest_km !== null ? km(d.latest_km) : '?'})`)
  const flag = d.overdue ? '🔴' : '🟡'
  return `${flag} <b>${d.vehicle_name}</b>: ${d.description} — ${parts.join(', ')}`
}

function planLine(d: DuePlanItem): string {
  const parts: string[] = []
  if (d.next_due_date) parts.push(`tempo ${d.next_due_date}`)
  if (d.next_due_km !== null) {
    parts.push(`di ${km(d.next_due_km)}${d.latest_km !== null ? ` (sekarang ${km(d.latest_km)})` : ''}`)
  }
  const flag = d.status === 'overdue' ? '🔴' : '🟡'
  const spec = d.spec ? ` · ${d.spec}` : ''
  return `${flag} <b>${d.vehicle_name}</b>: ${d.action} ${d.item} — ${parts.join(', ')}${spec}`
}

function staleLine(s: StaleOdo): string {
  return s.newest_reading_date === null
    ? `• ${s.vehicle_name}: odometer belum pernah dicatat`
    : `• ${s.vehicle_name}: odometer terakhir dicatat ${s.newest_reading_date}`
}

export async function runReminderCheck(env: Env, now: Date): Promise<number> {
  const due = await findDueItems(env, now)
  const duePlan = await computeDuePlanItems(env, now)
  const stale = await findStaleOdometers(env, now)
  if (due.length === 0 && duePlan.length === 0 && stale.length === 0) return 0

  const diy = duePlan.filter((d) => d.doer === 'diy')
  const bengkel = duePlan.filter((d) => d.doer === 'bengkel')
  const sections: string[] = []
  if (due.length > 0) sections.push(`⏰ <b>Checkpoint</b>\n${due.map(checkpointLine).join('\n')}`)
  if (diy.length > 0) sections.push(`🔧 <b>DIY</b>\n${diy.map(planLine).join('\n')}`)
  if (bengkel.length > 0) sections.push(`🏭 <b>Bengkel</b>\n${bengkel.map(planLine).join('\n')}`)
  if (stale.length > 0) sections.push(`⚠ <b>Odometer</b>\n${stale.map(staleLine).join('\n')}`)

  await sendTelegram(env, `🔧 <b>Pengingat perawatan kendaraan</b>\n\n${sections.join('\n\n')}`)
  return due.length + duePlan.length
}
