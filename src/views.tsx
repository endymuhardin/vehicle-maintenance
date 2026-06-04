import type { Child, FC } from 'hono/jsx'
import type { FuelSummary } from './fuel'

export type VehicleRow = {
  id: number
  name: string
  status: 'active' | 'sold'
  latest_km: number | null
  last_date: string | null
  session_count: number
  spend: number
}

export type SessionRow = {
  id: number
  vehicle_id: number
  seq: number
  date: string
  odometer_km: number
  item_count: number
  total: number
}

export type ItemRow = {
  id: number
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
  checkpoint_done: number
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

export const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

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

export const Layout: FC<{ title: string; children?: Child }> = ({ title, children }) => (
  <html lang="id">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · Garasi</title>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap"
      />
      <link rel="stylesheet" href="/style.css" />
    </head>
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
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Masuk · Garasi</title>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap"
      />
      <link rel="stylesheet" href="/style.css" />
    </head>
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
    <h2 class="panel-title">⚠ Jatuh Tempo</h2>
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
              <button type="submit" class="ghost small" title="tandai selesai">✓ beres</button>
            </form>
          </li>
        ))}
      </ul>
    )}
  </section>
)

export const Dashboard: FC<{ vehicles: VehicleRow[]; due: DueRow[] }> = ({ vehicles, due }) => (
  <Layout title="Dasbor">
    <DueList due={due} />
    <section class="panel">
      <h2 class="panel-title">Kendaraan</h2>
      <div class="vehicle-grid">
        {vehicles.map((v) => (
          <a href={`/vehicles/${v.id}`} class={`vehicle-card ${v.status}`}>
            <div class="vehicle-name">{v.name}</div>
            {v.status === 'sold' ? <span class="chip sold">TERJUAL</span> : null}
            {v.latest_km !== null ? <Odometer km={v.latest_km} /> : <span class="muted">belum ada servis</span>}
            <dl class="vehicle-stats">
              <div><dt>servis</dt><dd>{v.session_count}×</dd></div>
              <div><dt>terakhir</dt><dd>{v.last_date ? tanggal(v.last_date) : '—'}</dd></div>
              <div><dt>total biaya</dt><dd class="money">{rupiah(v.spend)}</dd></div>
            </dl>
          </a>
        ))}
      </div>
      <details class="adder">
        <summary>+ tambah kendaraan</summary>
        <form method="post" action="/vehicles" class="stack">
          <input name="name" placeholder="nama kendaraan" required />
          <button type="submit" class="primary">simpan</button>
        </form>
      </details>
    </section>
  </Layout>
)

const CATEGORY_LABEL: Record<string, string> = {
  rutin: 'Perawatan Rutin',
  aksesoris: 'Aksesoris',
  administratif: 'Administratif',
}

const FuelSection: FC<{ vehicle: VehicleRow; fuel: FuelSummary }> = ({ vehicle, fuel }) => (
  <section class="panel">
    <h2 class="panel-title">⛽ BBM & Odometer</h2>
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
              <td class="rowact">
                <form method="post" action={`/odometer/${e.id}/delete`} onsubmit="return confirm('Hapus catatan ini?')">
                  <button type="submit" class="ghost small danger" title="hapus">×</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    <details class="adder">
      <summary>+ catat odometer / isi bensin</summary>
      <form method="post" action={`/vehicles/${vehicle.id}/odometer`} class="stack">
        <div class="row2">
          <label>tanggal <input type="date" name="date" required /></label>
          <label>odometer (km) <input type="number" name="odometer_km" min="0" required /></label>
        </div>
        <div class="row2">
          <label>liter (opsional) <input type="number" name="liters" min="0" step="any" /></label>
          <label>total harga (opsional) <input type="number" name="total" min="0" /></label>
        </div>
        <input name="note" placeholder="catatan (SPBU, jenis BBM)" />
        <button type="submit" class="primary">simpan</button>
      </form>
    </details>
  </section>
)

export const VehiclePage: FC<{
  vehicle: VehicleRow
  sessions: SessionRow[]
  extras: ItemRow[]
  fuel: FuelSummary
}> = ({ vehicle, sessions, extras, fuel }) => {
  const extraCats = [...new Set(extras.map((e) => e.category))]
  return (
    <Layout title={vehicle.name}>
      <nav class="crumbs"><a href="/">← dasbor</a></nav>
      <section class="panel">
        <div class="vehicle-head">
          <h1 class="vehicle-title">{vehicle.name}</h1>
          {vehicle.status === 'sold' ? <span class="chip sold">TERJUAL</span> : null}
          {vehicle.latest_km !== null ? <Odometer km={vehicle.latest_km} /> : null}
        </div>
        <dl class="vehicle-stats wide">
          <div><dt>servis</dt><dd>{vehicle.session_count}×</dd></div>
          <div><dt>total biaya</dt><dd class="money">{rupiah(vehicle.spend)}</dd></div>
        </dl>
        <form method="post" action={`/vehicles/${vehicle.id}/status`} class="inline-form">
          <input type="hidden" name="status" value={vehicle.status === 'active' ? 'sold' : 'active'} />
          <button type="submit" class="ghost small">
            {vehicle.status === 'active' ? 'tandai terjual' : 'aktifkan lagi'}
          </button>
        </form>
      </section>

      <FuelSection vehicle={vehicle} fuel={fuel} />

      <section class="panel">
        <h2 class="panel-title">Sesi Perawatan</h2>
        {sessions.length === 0 ? <p class="muted">Belum ada sesi perawatan.</p> : (
          <ul class="session-list">
            {sessions.map((s) => (
              <li>
                <a href={`/sessions/${s.id}`} class="session-row">
                  <span class="session-seq">#{s.seq}</span>
                  <span class="session-date">{tanggal(s.date)}</span>
                  <span class="session-km">{s.odometer_km.toLocaleString('id-ID')} km</span>
                  <span class="session-count">{s.item_count} item</span>
                  <span class="money">{rupiah(s.total)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <details class="adder">
          <summary>+ sesi perawatan baru</summary>
          <form method="post" action={`/vehicles/${vehicle.id}/sessions`} class="stack">
            <label>tanggal <input type="date" name="date" required /></label>
            <label>odometer (km) <input type="number" name="odometer_km" min="0" required /></label>
            <button type="submit" class="primary">buka sesi</button>
          </form>
        </details>
      </section>

      {extraCats.map((cat) => (
        <section class="panel">
          <h2 class="panel-title">{CATEGORY_LABEL[cat]}</h2>
          <ItemTable items={extras.filter((e) => e.category === cat)} />
        </section>
      ))}

      <section class="panel">
        <details class="adder">
          <summary>+ pengeluaran non-servis (aksesoris / administratif)</summary>
          <form method="post" action={`/vehicles/${vehicle.id}/items`} class="stack">
            <label>tanggal <input type="date" name="date" required /></label>
            <input name="description" placeholder="keterangan" required />
            <div class="row2">
              <label>harga satuan <input type="number" name="unit_price" min="0" required /></label>
              <label>jumlah <input type="number" name="qty" min="0" step="any" required /></label>
            </div>
            <label>kategori
              <select name="category" required>
                <option value="aksesoris">aksesoris</option>
                <option value="administratif">administratif</option>
              </select>
            </label>
            <button type="submit" class="primary">simpan</button>
          </form>
        </details>
      </section>
    </Layout>
  )
}

const ItemTable: FC<{ items: ItemRow[]; showCheckpoint?: boolean }> = ({ items, showCheckpoint }) => (
  <table class="items">
    <thead>
      <tr>
        <th>tanggal</th>
        <th>parts / jasa</th>
        <th class="num">harga × jml</th>
        <th class="num">total</th>
        {showCheckpoint ? <th>checkpoint</th> : null}
        <th />
      </tr>
    </thead>
    <tbody>
      {items.map((it) => (
        <tr class={it.total === 0 ? 'umbrella' : ''}>
          <td class="date">{it.date ? tanggal(it.date) : '—'}</td>
          <td class="desc">{it.description}</td>
          <td class="num mono">
            {it.total === 0 ? '' : `${it.unit_price.toLocaleString('id-ID')} × ${it.qty.toLocaleString('id-ID')}`}
          </td>
          <td class="num mono">{it.total === 0 ? '' : it.total.toLocaleString('id-ID')}</td>
          {showCheckpoint ? (
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
                  <button type="submit" class="ghost small">✓</button>
                </form>
              ) : null}
            </td>
          ) : null}
          <td class="rowact">
            <form
              method="post"
              action={`/items/${it.id}/delete`}
              onsubmit="return confirm('Hapus item ini?')"
            >
              <button type="submit" class="ghost small danger" title="hapus">×</button>
            </form>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

export const SessionPage: FC<{
  vehicle: VehicleRow
  session: SessionRow
  items: ItemRow[]
}> = ({ vehicle, session, items }) => (
  <Layout title={`${vehicle.name} · Servis #${session.seq}`}>
    <nav class="crumbs">
      <a href="/">dasbor</a> / <a href={`/vehicles/${vehicle.id}`}>{vehicle.name}</a>
    </nav>
    <section class="panel">
      <div class="vehicle-head">
        <h1 class="vehicle-title">Servis #{session.seq}</h1>
        <Odometer km={session.odometer_km} />
      </div>
      <dl class="vehicle-stats wide">
        <div><dt>tanggal</dt><dd>{tanggal(session.date)}</dd></div>
        <div><dt>item</dt><dd>{items.length}</dd></div>
        <div><dt>total</dt><dd class="money">{rupiah(items.reduce((a, i) => a + i.total, 0))}</dd></div>
      </dl>
    </section>
    <section class="panel">
      <ItemTable items={items} showCheckpoint />
      <details class="adder" open={items.length === 0}>
        <summary>+ tambah item</summary>
        <form method="post" action={`/sessions/${session.id}/items`} class="stack">
          <label>tanggal <input type="date" name="date" required /></label>
          <input name="description" placeholder="parts / jasa" required />
          <div class="row2">
            <label>harga satuan <input type="number" name="unit_price" min="0" required /></label>
            <label>jumlah <input type="number" name="qty" min="0" step="any" required /></label>
          </div>
          <fieldset class="checkpoint-fields">
            <legend>checkpoint berikutnya (opsional)</legend>
            <div class="row2">
              <label>tempo tanggal <input type="date" name="due_date" /></label>
              <label>tempo km <input type="number" name="due_km" min="0" /></label>
            </div>
            <input name="checkpoint_note" placeholder="catatan checkpoint" />
          </fieldset>
          <button type="submit" class="primary">simpan item</button>
        </form>
      </details>
    </section>
  </Layout>
)
