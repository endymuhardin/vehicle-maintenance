// Session cookie: "<expiresEpochSeconds>.<hex hmac-sha256(expires, SESSION_SECRET)>"

const encoder = new TextEncoder()

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const SESSION_TTL_SECONDS = 30 * 24 * 3600

export async function createSessionToken(secret: string, nowMs: number): Promise<string> {
  const expires = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS
  return `${expires}.${await hmac(secret, String(expires))}`
}

export async function verifySessionToken(secret: string, token: string, nowMs: number): Promise<boolean> {
  const dot = token.indexOf('.')
  if (dot < 1) return false
  const expires = token.slice(0, dot)
  if (!/^\d+$/.test(expires)) return false
  if (Number(expires) * 1000 < nowMs) return false
  const expected = await hmac(secret, expires)
  const actual = token.slice(dot + 1)
  if (expected.length !== actual.length) return false
  // constant-time compare
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i)
  return diff === 0
}
