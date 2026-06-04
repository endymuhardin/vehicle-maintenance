export type Env = {
  DB: D1Database
  ASSETS: Fetcher
  RECEIPTS: R2Bucket
  APP_PASSWORD: string
  SESSION_SECRET: string
  API_TOKEN: string
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_CHAT_ID: string
  REMINDER_DAYS_AHEAD: string
  REMINDER_KM_AHEAD: string
}

// No fallbacks: a missing binding/secret is a deployment error and must surface loudly.
export function requireEnv(env: Env, key: keyof Env): string {
  const value = env[key]
  if (typeof value !== 'string' || value === '') {
    throw new Error(`missing required environment value: ${key}`)
  }
  return value
}

export function requireIntEnv(env: Env, key: keyof Env): number {
  const raw = requireEnv(env, key)
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) {
    throw new Error(`environment value ${key} is not an integer: ${raw}`)
  }
  return n
}
