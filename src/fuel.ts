import { Env } from './env'

export type OdometerLogRow = {
  id: number
  vehicle_id: number
  date: string
  odometer_km: number
  liters: number | null
  total: number | null
  note: string | null
}

export type FuelEntry = OdometerLogRow & {
  // km/l vs the previous FUEL entry (full-tank method); null for the first
  // fuel entry or plain odometer readings.
  km_per_liter: number | null
}

export type FuelSummary = {
  entries: FuelEntry[]          // newest first
  avg_km_per_liter: number | null
  total_fuel_cost: number
  total_liters: number
}

// Full-tank-to-full-tank: each fill's km/l = distance since previous fill
// divided by liters of THIS fill (the fuel consumed over that distance).
export async function fuelLog(env: Env, vehicleId: number): Promise<FuelSummary> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM odometer_logs WHERE vehicle_id = ? ORDER BY odometer_km, id',
  ).bind(vehicleId).all<OdometerLogRow>()

  const entries: FuelEntry[] = []
  let prevFuelKm: number | null = null
  let firstFuelKm: number | null = null
  let lastFuelKm: number | null = null
  let litersAfterFirst = 0
  let totalFuelCost = 0
  let totalLiters = 0

  for (const row of results) {
    let kmPerLiter: number | null = null
    if (row.liters !== null) {
      if (prevFuelKm !== null && row.odometer_km > prevFuelKm) {
        kmPerLiter = (row.odometer_km - prevFuelKm) / row.liters
        litersAfterFirst += row.liters
      }
      if (firstFuelKm === null) firstFuelKm = row.odometer_km
      lastFuelKm = row.odometer_km
      prevFuelKm = row.odometer_km
      totalFuelCost += row.total ?? 0
      totalLiters += row.liters
    }
    entries.push({ ...row, km_per_liter: kmPerLiter })
  }

  const avg =
    firstFuelKm !== null && lastFuelKm !== null && lastFuelKm > firstFuelKm && litersAfterFirst > 0
      ? (lastFuelKm - firstFuelKm) / litersAfterFirst
      : null

  entries.reverse()
  return { entries, avg_km_per_liter: avg, total_fuel_cost: totalFuelCost, total_liters: totalLiters }
}
