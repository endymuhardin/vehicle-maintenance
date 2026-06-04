import { Env, requireEnv, requireIntEnv } from './env'

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
              SELECT MAX(s.odometer_km) AS mk FROM sessions s WHERE s.vehicle_id = v.id
              UNION ALL
              SELECT MAX(o.odometer_km) FROM odometer_logs o WHERE o.vehicle_id = v.id
           )) AS latest_km
    FROM line_items li
    JOIN vehicles v ON v.id = li.vehicle_id
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

export async function runReminderCheck(env: Env, now: Date): Promise<number> {
  const due = await findDueItems(env, now)
  if (due.length === 0) return 0
  const lines = due.map((d) => {
    const parts: string[] = []
    if (d.due_date) parts.push(`jatuh tempo ${d.due_date}`)
    if (d.due_km !== null) parts.push(`di ${d.due_km.toLocaleString('id-ID')} km (sekarang ${d.latest_km?.toLocaleString('id-ID')} km)`)
    const flag = d.overdue ? '🔴' : '🟡'
    return `${flag} <b>${d.vehicle_name}</b>: ${d.description} — ${parts.join(', ')}`
  })
  await sendTelegram(env, `🔧 <b>Pengingat perawatan kendaraan</b>\n\n${lines.join('\n')}`)
  return due.length
}
