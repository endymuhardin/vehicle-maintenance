import type { Child, FC } from 'hono/jsx'
import type { FuelSummary } from './fuel'
import type { ComputedPlanItem, DuePlanItem, StaleOdo, Doer } from './plan'

export type VehicleRow = {
  id: number
  name: string
  status: 'active' | 'sold'
  latest_km: number | null
  last_date: string | null
  visit_count: number
  spend: number
}

export type VisitRow = {
  id: number
  vehicle_id: number
  date: string
  odometer_km: number | null
  vendor: string | null
  label: string | null
  item_count: number
  total: number
}

export type ItemRow = {
  id: number
  visit_id: number
  description: string
  unit_price: number
  qty: number
  total: number
  category: string
  checkpoint_note: string | null
  due_date: string | null
  due_km: number | null
  checkpoint_done: number
}

export type AttachmentRow = {
  id: number
  visit_id: number
  filename: string
  content_type: string
  size: number
  uploaded_at: string
}

export type DueRow = {
  id: number
  description: string
  vehicle_name: string
  vehicle_id: number
  due_date: string | null
  due_km: number | null
  latest_km: number | null
  overdue: boolean
}

export const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
export function tanggal(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

const Odometer: FC<{ km: number }> = ({ km }) => (
  <span class="odo" title={`${km.toLocaleString('id-ID')} km`}>
    {String(km).padStart(6, '0').split('').map((d) => <span class="odo-digit">{d}</span>)}
    <span class="odo-unit">km</span>
  </span>
)

// Inline Lucide paths — emoji render inconsistently across platforms and
// can't follow the theme; SVG with currentColor does.
const ICONS = {
  alert: (
    <>
      <path d="M21.73 18l-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  fuel: (
    <>
      <path d="M3 22h12" />
      <path d="M4 9h10" />
      <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
      <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" />
    </>
  ),
  paperclip: (
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
  factory: (
    <>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M17 18h1" />
      <path d="M12 18h1" />
      <path d="M7 18h1" />
    </>
  ),
  car: (
    <>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
} as const

const Icon: FC<{ name: keyof typeof ICONS }> = ({ name }) => (
  <svg
    class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
  >
    {ICONS[name]}
  </svg>
)

const Head: FC<{ title: string }> = ({ title }) => (
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} · Garasi</title>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap"
    />
    <link rel="stylesheet" href="/style.css" />
  </head>
)

export const Layout: FC<{ title: string; children?: Child }> = ({ title, children }) => (
  <html lang="id">
    <Head title={title} />
    <body>
      <header class="topbar">
        <a href="/" class="wordmark">GARASI<span class="wordmark-dot">●</span>LOG</a>
        <form method="post" action="/logout"><button class="ghost" type="submit">keluar</button></form>
      </header>
      <div class="hazard" />
      <main>{children}</main>
      <footer class="foot">kartu servis digital — cloudflare workers + d1</footer>
    </body>
  </html>
)

export const LoginPage: FC<{ error?: string }> = ({ error }) => (
  <html lang="id">
    <Head title="Masuk" />
    <body class="login-body">
      <div class="hazard" />
      <main class="login-card">
        <h1 class="wordmark big">GARASI<span class="wordmark-dot">●</span>LOG</h1>
        <p class="login-sub">kartu servis kendaraan</p>
        {error ? <p class="error-box">{error}</p> : null}
        <form method="post" action="/login">
          <input type="password" name="password" placeholder="kata sandi" autofocus required />
          <button type="submit" class="primary">BUKA GARASI</button>
        </form>
      </main>
      <div class="hazard" />
    </body>
  </html>
)

export const DueList: FC<{ due: DueRow[] }> = ({ due }) => (
  <section class="panel">
    <h2 class="panel-title"><Icon name="alert" />Jatuh Tempo</h2>
    {due.length === 0 ? (
      <p class="muted">Tidak ada checkpoint yang jatuh tempo.</p>
    ) : (
      <ul class="due-list">
        {due.map((d) => (
          <li class={d.overdue ? 'due overdue' : 'due'}>
            <form method="post" action={`/items/${d.id}/done`}>
              <div class="due-text">
                <a href={`/vehicles/${d.vehicle_id}`} class="due-vehicle">{d.vehicle_name}</a>
                <span class="due-desc">{d.description}</span>
                <span class="due-when">
                  {d.due_date ? `tempo ${tanggal(d.due_date)}` : ''}
                  {d.due_date && d.due_km !== null ? ' · ' : ''}
                  {d.due_km !== null ? `${d.due_km.toLocaleString('id-ID')} km` : ''}
                </span>
              </div>
              <button type="submit" class="ghost small" title="tandai selesai"><Icon name="check" />beres</button>
            </form>
          </li>
        ))}
      </ul>
    )}
  </section>
)

const DoerChip: FC<{ doer: Doer }> = ({ doer }) => (
  <span class={`chip ${doer}`}>
    {doer === 'diy' ? <><Icon name="wrench" />DIY</> : <><Icon name="factory" />bengkel</>}
  </span>
)

const planWhen = (d: DuePlanItem): string => {
  const parts: string[] = []
  if (d.next_due_date) parts.push(`tempo ${tanggal(d.next_due_date)}`)
  if (d.next_due_km !== null) {
    parts.push(`${d.next_due_km.toLocaleString('id-ID')} km${d.latest_km !== null ? ` (sekarang ${d.latest_km.toLocaleString('id-ID')})` : ''}`)
  }
  return parts.join(' · ')
}

const StaleWarn: FC<{ stale: StaleOdo[] }> = ({ stale }) => (
  <>
    {stale.map((s) => (
      <p class="stale-warn">
        <Icon name="alert" />
        <span>{s.vehicle_name}: {s.newest_reading_date === null
          ? 'odometer belum pernah dicatat'
          : `odometer terakhir dicatat ${tanggal(s.newest_reading_date)}`} — catat pembacaan baru agar pengingat km akurat.</span>
      </p>
    ))}
  </>
)

// Due plan tasks grouped by doer: the DIY group doubles as a shopping list
// (spec shown), the bengkel group as a dictatable work order.
export const PlanDueList: FC<{ duePlan: DuePlanItem[]; stale: StaleOdo[] }> = ({ duePlan, stale }) => {
  if (duePlan.length === 0 && stale.length === 0) return null
  const groups: { doer: Doer; icon: 'wrench' | 'factory'; title: string; items: DuePlanItem[] }[] = [
    { doer: 'diy', icon: 'wrench', title: 'Kerjakan sendiri', items: duePlan.filter((d) => d.doer === 'diy') },
    { doer: 'bengkel', icon: 'factory', title: 'Bawa ke bengkel', items: duePlan.filter((d) => d.doer === 'bengkel') },
  ]
  return (
    <section class="panel">
      <h2 class="panel-title"><Icon name="calendar" />Tugas Perawatan</h2>
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <>
          <h3 class="plan-group-title"><Icon name={g.icon} />{g.title}</h3>
          <ul class="due-list">
            {g.items.map((d) => (
              <li class={d.status === 'overdue' ? 'due overdue' : 'due'}>
                <div class="due-text plan-due">
                  <a href={`/vehicles/${d.vehicle_id}`} class="due-vehicle">{d.vehicle_name}</a>
                  <span class="due-desc">{d.action} {d.item}</span>
                  <span class="due-when">{planWhen(d)}</span>
                  {d.spec ? <span class="due-spec">{d.spec}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ))}
      <StaleWarn stale={stale} />
    </section>
  )
}

export const Dashboard: FC<{
  vehicles: VehicleRow[]
  due: DueRow[]
  duePlan: DuePlanItem[]
  stale: StaleOdo[]
}> = ({ vehicles, due, duePlan, stale }) => (
  <Layout title="Dasbor">
    <PlanDueList duePlan={duePlan} stale={stale} />
    <DueList due={due} />
    <section class="panel">
      <h2 class="panel-title"><Icon name="car" />Kendaraan</h2>
      <div class="vehicle-grid">
        {vehicles.map((v) => (
          <a href={`/vehicles/${v.id}`} class={`vehicle-card ${v.status}`}>
            <div class="vehicle-name">{v.name}</div>
            {v.status === 'sold' ? <span class="chip sold">TERJUAL</span> : null}
            {v.latest_km !== null ? <Odometer km={v.latest_km} /> : <span class="muted">belum ada catatan</span>}
            <dl class="vehicle-stats">
              <div><dt>kunjungan</dt><dd>{v.visit_count}×</dd></div>
              <div><dt>terakhir</dt><dd>{v.last_date ? tanggal(v.last_date) : '—'}</dd></div>
              <div><dt>total biaya</dt><dd class="money">{rupiah(v.spend)}</dd></div>
            </dl>
          </a>
        ))}
      </div>
      <details class="adder">
        <summary>+ tambah kendaraan</summary>
        <form method="post" action="/vehicles" class="stack">
          <label>nama kendaraan <input name="name" placeholder="mis. NMAX 2022" required /></label>
          <button type="submit" class="primary">simpan</button>
        </form>
      </details>
    </section>
  </Layout>
)

const FuelSection: FC<{ vehicle: VehicleRow; fuel: FuelSummary }> = ({ vehicle, fuel }) => (
  <section class="panel">
    <h2 class="panel-title"><Icon name="fuel" />BBM & Odometer</h2>
    {fuel.avg_km_per_liter !== null ? (
      <dl class="vehicle-stats">
        <div><dt>rata-rata</dt><dd>{fuel.avg_km_per_liter.toFixed(1)} km/l</dd></div>
        <div><dt>total bbm</dt><dd>{fuel.total_liters.toFixed(1)} l</dd></div>
        <div><dt>total biaya bbm</dt><dd class="money">{rupiah(fuel.total_fuel_cost)}</dd></div>
      </dl>
    ) : null}
    {fuel.entries.length === 0 ? (
      <p class="muted">Belum ada catatan. Isi km saat mengisi bensin untuk hitung konsumsi (tangki penuh).</p>
    ) : (
      <div class="table-scroll">
        <table class="items">
          <thead>
            <tr><th>tanggal</th><th class="num">km</th><th class="num">liter</th><th class="num">harga</th><th class="num">km/l</th><th /></tr>
          </thead>
          <tbody>
            {fuel.entries.slice(0, 15).map((e) => (
              <tr>
                <td class="date">{tanggal(e.date)}</td>
                <td class="num mono">{e.odometer_km.toLocaleString('id-ID')}</td>
                <td class="num mono">{e.liters !== null ? e.liters.toLocaleString('id-ID') : '—'}</td>
                <td class="num mono">{e.total !== null ? e.total.toLocaleString('id-ID') : '—'}</td>
                <td class="num mono">{e.km_per_liter !== null ? e.km_per_liter.toFixed(1) : '—'}</td>
                <td class="attach-cell">
                  {e.attachments.map((a) => (
                    <a href={`/attachments/${a.id}`} target="_blank" rel="noopener" title={a.filename} aria-label={a.filename}>
                      <Icon name="paperclip" />
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <details class="adder">
      <summary>+ catat odometer / isi bensin</summary>
      <form method="post" action={`/vehicles/${vehicle.id}/odometer`} enctype="multipart/form-data" class="stack">
        <div class="row2">
          <label>tanggal <input type="date" name="date" required /></label>
          <label>odometer (km) <input type="number" name="odometer_km" min="0" required /></label>
        </div>
        <div class="row2">
          <label>liter (opsional) <input type="number" name="liters" min="0" step="any" /></label>
          <label>total harga (opsional) <input type="number" name="total" min="0" /></label>
        </div>
        <label>catatan (opsional) <input name="note" placeholder="SPBU, jenis BBM" /></label>
        <label>foto odometer / struk (opsional)
          <input type="file" name="files" accept="image/*" multiple />
        </label>
        <button type="submit" class="primary">simpan</button>
      </form>
    </details>
  </section>
)

const PLAN_STATUS_TEXT: Record<ComputedPlanItem['status'], string> = {
  ok: 'ok',
  due: 'segera',
  overdue: 'lewat',
  pantau: 'pantau',
  'no-baseline': 'tanpa baseline',
}

function planInterval(p: ComputedPlanItem): string {
  const parts: string[] = []
  if (p.interval_km !== null) parts.push(`${p.interval_km.toLocaleString('id-ID')} km`)
  if (p.interval_months !== null) parts.push(`${p.interval_months} bln`)
  return parts.length > 0 ? parts.join(' / ') : '—'
}

// Consumable usage: km and/or calendar share of the interval already consumed.
function planUsage(p: ComputedPlanItem, latestKm: number | null, today: string): string {
  const parts: string[] = []
  if (p.last_done_km !== null && latestKm !== null) {
    const used = latestKm - p.last_done_km
    const pct = p.interval_km !== null ? ` (${Math.round((used / p.interval_km) * 100)}%)` : ''
    parts.push(`${used.toLocaleString('id-ID')} km${pct}`)
  }
  if (p.last_done_date !== null && (p.interval_months !== null || parts.length === 0)) {
    const days = Math.floor((Date.parse(today) - Date.parse(p.last_done_date)) / 86400_000)
    const pct = p.interval_months !== null
      ? ` (${Math.round((days / (p.interval_months * 30.44)) * 100)}%)` : ''
    parts.push(`${Math.floor(days / 30.44)} bln${pct}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '—'
}

const PlanSection: FC<{ plan: ComputedPlanItem[]; latestKm: number | null; today: string }> =
  ({ plan, latestKm, today }) => (
    <section class="panel">
      <h2 class="panel-title"><Icon name="wrench" />Rencana Perawatan</h2>
      {plan.length === 0 ? (
        <p class="muted">Belum ada rencana perawatan. Tambahkan via <code>POST /api/vehicles/:id/plan-items</code>.</p>
      ) : (
        <div class="table-scroll">
        <table class="items plan">
          <thead>
            <tr>
              <th>item</th><th>interval</th><th /><th>terakhir</th>
              <th>pemakaian</th><th>berikutnya</th><th>status</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((p) => (
              <tr>
                <td class="desc">
                  <span class="plan-action">{p.action}</span> {p.item}
                  {p.installed_desc ? <div class="plan-spec">{p.installed_desc}</div> : null}
                  {p.spec ? <div class="plan-spec">{p.spec}</div> : null}
                </td>
                <td class="mono">{planInterval(p)}</td>
                <td><DoerChip doer={p.doer} /></td>
                <td class="mono">
                  {p.last_done_km !== null ? `${p.last_done_km.toLocaleString('id-ID')} km` : ''}
                  {p.last_done_km !== null && p.last_done_date ? ' · ' : ''}
                  {p.last_done_date ? tanggal(p.last_done_date) : ''}
                  {p.last_done_km === null && !p.last_done_date ? '—' : ''}
                </td>
                <td class="mono">{planUsage(p, latestKm, today)}</td>
                <td class="mono">
                  {p.next_due_km !== null ? `${p.next_due_km.toLocaleString('id-ID')} km` : ''}
                  {p.next_due_km !== null && p.next_due_date ? ' / ' : ''}
                  {p.next_due_date ? tanggal(p.next_due_date) : ''}
                  {p.next_due_km === null && !p.next_due_date ? '—' : ''}
                </td>
                <td><span class={`chip ${p.status}`}>{PLAN_STATUS_TEXT[p.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  )

export const VehiclePage: FC<{
  vehicle: VehicleRow
  visits: VisitRow[]
  fuel: FuelSummary
  plan: ComputedPlanItem[]
  stale: StaleOdo | null
  today: string
}> = ({ vehicle, visits, fuel, plan, stale, today }) => (
  <Layout title={vehicle.name}>
    <nav class="crumbs"><a href="/">← dasbor</a></nav>
    <section class="panel">
      <div class="vehicle-head">
        <h1 class="vehicle-title">{vehicle.name}</h1>
        {vehicle.status === 'sold' ? <span class="chip sold">TERJUAL</span> : null}
        {vehicle.latest_km !== null ? <Odometer km={vehicle.latest_km} /> : null}
      </div>
      <dl class="vehicle-stats wide">
        <div><dt>kunjungan</dt><dd>{vehicle.visit_count}×</dd></div>
        <div><dt>total biaya</dt><dd class="money">{rupiah(vehicle.spend)}</dd></div>
      </dl>
      {stale !== null ? <StaleWarn stale={[stale]} /> : null}
    </section>

    <PlanSection plan={plan} latestKm={vehicle.latest_km} today={today} />

    <FuelSection vehicle={vehicle} fuel={fuel} />

    <section class="panel">
      <h2 class="panel-title">Kunjungan</h2>
      {visits.length === 0 ? <p class="muted">Belum ada kunjungan.</p> : (
        <ul class="session-list">
          {visits.map((vi) => (
            <li>
              <a href={`/visits/${vi.id}`} class="visit-row">
                <span class="visit-date">{tanggal(vi.date)}</span>
                <span class="visit-vendor">
                  {vi.vendor ?? '—'}
                  {vi.label ? <span class="chip label">{vi.label}</span> : null}
                </span>
                <span class="visit-km mono">{vi.odometer_km !== null ? `${vi.odometer_km.toLocaleString('id-ID')} km` : ''}</span>
                <span class="visit-count">{vi.item_count} item</span>
                <span class="money">{rupiah(vi.total)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <details class="adder">
        <summary>+ kunjungan / pembelian baru</summary>
        <form method="post" action={`/vehicles/${vehicle.id}/visits`} class="stack">
          <div class="row2">
            <label>tanggal <input type="date" name="date" required /></label>
            <label>odometer km (opsional) <input type="number" name="odometer_km" min="0" /></label>
          </div>
          <label>bengkel / toko (opsional) <input name="vendor" placeholder="mis. Mekar Motor, Samsat" /></label>
          <label>label grup (opsional) <input name="label" placeholder="mis. Servis berkala" /></label>
          <button type="submit" class="primary">buka kunjungan</button>
        </form>
      </details>
    </section>

    <section class="panel danger-zone">
      <details>
        <summary class="danger-summary">pengaturan kendaraan</summary>
        <form
          method="post"
          action={`/vehicles/${vehicle.id}/status`}
          onsubmit={`return confirm('${vehicle.status === 'active'
            ? `Tandai ${vehicle.name} sebagai TERJUAL? Kendaraan tidak akan muncul di pengingat.`
            : `Aktifkan kembali ${vehicle.name}?`}')`}
        >
          <input type="hidden" name="status" value={vehicle.status === 'active' ? 'sold' : 'active'} />
          <p class="muted danger-note">
            {vehicle.status === 'active'
              ? 'Menandai terjual menyembunyikan kendaraan dari pengingat. Riwayat tetap tersimpan.'
              : 'Kendaraan ini berstatus terjual.'}
          </p>
          <button type="submit" class="ghost small danger">
            {vehicle.status === 'active' ? 'tandai terjual' : 'aktifkan lagi'}
          </button>
        </form>
      </details>
    </section>
  </Layout>
)

const ItemTable: FC<{ items: ItemRow[] }> = ({ items }) => (
  <div class="table-scroll">
  <table class="items">
    <thead>
      <tr>
        <th>parts / jasa</th>
        <th class="num">harga × jml</th>
        <th class="num">total</th>
        <th>checkpoint</th>
      </tr>
    </thead>
    <tbody>
      {items.map((it) => (
        <tr class={it.total === 0 ? 'umbrella' : ''}>
          <td class="desc">
            {it.description}
            {it.category !== 'rutin' ? <span class={`chip cat`}> {it.category}</span> : null}
          </td>
          <td class="num mono">
            {it.total === 0 ? '' : `${it.unit_price.toLocaleString('id-ID')} × ${it.qty.toLocaleString('id-ID')}`}
          </td>
          <td class="num mono">{it.total === 0 ? '' : it.total.toLocaleString('id-ID')}</td>
          <td class="checkpoint">
            {it.due_date || it.due_km !== null || it.checkpoint_note ? (
              <span class={`chip ${it.checkpoint_done ? 'done' : 'open'}`}>
                {it.due_date ? tanggal(it.due_date) : ''}
                {it.due_date && it.due_km !== null ? ' / ' : ''}
                {it.due_km !== null ? `${it.due_km.toLocaleString('id-ID')} km` : ''}
                {!it.due_date && it.due_km === null ? it.checkpoint_note : ''}
                {it.checkpoint_done ? ' ✓' : ''}
              </span>
            ) : null}
            {(it.due_date || it.due_km !== null) && !it.checkpoint_done ? (
              <form method="post" action={`/items/${it.id}/done`} class="inline-form">
                <button type="submit" class="ghost small" title="tandai selesai" aria-label="tandai selesai"><Icon name="check" /></button>
              </form>
            ) : null}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  </div>
)

export const VisitPage: FC<{
  vehicle: VehicleRow
  visit: VisitRow
  items: ItemRow[]
  attachments: AttachmentRow[]
}> = ({ vehicle, visit, items, attachments }) => (
  <Layout title={`${vehicle.name} · ${tanggal(visit.date)}`}>
    <nav class="crumbs">
      <a href="/">dasbor</a> / <a href={`/vehicles/${vehicle.id}`}>{vehicle.name}</a>
    </nav>
    <section class="panel">
      <div class="vehicle-head">
        <h1 class="vehicle-title">{visit.vendor ?? 'Kunjungan'}</h1>
        {visit.odometer_km !== null ? <Odometer km={visit.odometer_km} /> : null}
      </div>
      <dl class="vehicle-stats wide">
        <div><dt>tanggal</dt><dd>{tanggal(visit.date)}</dd></div>
        {visit.label ? <div><dt>grup</dt><dd>{visit.label}</dd></div> : null}
        <div><dt>item</dt><dd>{items.length}</dd></div>
        <div><dt>total</dt><dd class="money">{rupiah(items.reduce((a, i) => a + i.total, 0))}</dd></div>
      </dl>
    </section>

    <section class="panel">
      <ItemTable items={items} />
      <details class="adder" open={items.length === 0}>
        <summary>+ tambah item</summary>
        <form method="post" action={`/visits/${visit.id}/items`} class="stack">
          <label>parts / jasa <input name="description" placeholder="mis. Oli mesin Yamalube" required /></label>
          <div class="row2">
            <label>harga satuan <input type="number" name="unit_price" min="0" required /></label>
            <label>jumlah <input type="number" name="qty" min="0" step="any" required /></label>
          </div>
          <label>kategori
            <select name="category" required>
              <option value="rutin">rutin</option>
              <option value="aksesoris">aksesoris</option>
              <option value="administratif">administratif</option>
            </select>
          </label>
          <fieldset class="checkpoint-fields">
            <legend>checkpoint berikutnya (opsional)</legend>
            <div class="row2">
              <label>tempo tanggal <input type="date" name="due_date" /></label>
              <label>tempo km <input type="number" name="due_km" min="0" /></label>
            </div>
            <label>catatan <input name="checkpoint_note" placeholder="mis. ganti tiap 2000 km" /></label>
          </fieldset>
          <button type="submit" class="primary">simpan item</button>
        </form>
      </details>
    </section>

    <section class="panel">
      <h2 class="panel-title"><Icon name="paperclip" />Struk & Dokumen</h2>
      {attachments.length === 0 ? <p class="muted">Belum ada lampiran.</p> : (
        <ul class="attachment-list">
          {attachments.map((a) => (
            <li>
              <a href={`/attachments/${a.id}`} target="_blank" rel="noopener">{a.filename}</a>
              <span class="muted"> {(a.size / 1024).toFixed(0)} KB</span>
            </li>
          ))}
        </ul>
      )}
      <details class="adder">
        <summary>+ unggah struk</summary>
        <form method="post" action={`/visits/${visit.id}/attachments`} enctype="multipart/form-data" class="stack">
          <input type="file" name="files" accept="image/*,application/pdf" multiple required />
          <button type="submit" class="primary">unggah</button>
        </form>
      </details>
    </section>
  </Layout>
)
