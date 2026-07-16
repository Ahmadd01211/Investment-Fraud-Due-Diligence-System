// ════════════════════════════════════════════════════════════════
//  OPTIONAL ACCOUNTS  (email/password + Google OAuth, saved history)
//
//  Accounts are OPTIONAL — analysis works fully signed-out. Signing in adds
//  saved report history + premium tie-in.
//
//  Storage: D1 (self-provisioned, idempotent). Passwords are hashed with
//  PBKDF2-HMAC-SHA256 (Web Crypto). Sessions are opaque 32-byte hex tokens
//  stored in D1 with a 30-day expiry, carried in the `isp_session` cookie.
//
//  If D1 is unavailable, all auth functions degrade gracefully (routes return
//  501) and the analysis pipeline is unaffected.
// ════════════════════════════════════════════════════════════════

import type { Bindings } from './analyzer'

export interface AuthUser {
  id: string
  email: string
  name: string
}

const SESSION_COOKIE = 'isp_session'
const STATE_COOKIE = 'isp_oauth_state'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const PBKDF2_ITERATIONS = 100000

export function authAvailable(env: Bindings): boolean {
  return !!(env.DB && typeof env.DB.prepare === 'function')
}

// ── Schema (idempotent) ──────────────────────────────────────────
let authSchemaReady = false
export async function ensureAuthSchema(env: Bindings): Promise<void> {
  if (authSchemaReady) return
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT, password_salt TEXT, google_sub TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  )
  await env.DB.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)')
  await env.DB.exec(
    'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)'
  )
  await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)')
  authSchemaReady = true
}

// ── Low-level helpers ─────────────────────────────────────────────
function now(): number {
  return Date.now()
}

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

function randomHex(nBytes: number): string {
  const arr = new Uint8Array(nBytes)
  crypto.getRandomValues(arr)
  return toHex(arr)
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomHex(6)}`
}

/** Derive a PBKDF2-HMAC-SHA256 hash (hex) of `password` with the given salt (hex). */
async function derivePasswordHash(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = new Uint8Array((saltHex.match(/.{1,2}/g) || []).map((h) => parseInt(h, 16)))
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt },
    key,
    256
  )
  return toHex(new Uint8Array(bits))
}

/** Constant-time comparison of two hex strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

// ── Cookie helpers ────────────────────────────────────────────────
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

function stateCookie(state: string): string {
  return `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
}

function clearStateCookie(): string {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export function getSessionTokenFromRequest(cookieHeader: string | null | undefined): string | null {
  const cookies = parseCookies(cookieHeader)
  return cookies[SESSION_COOKIE] || null
}

// ── User + session operations ─────────────────────────────────────
function rowToUser(row: any): AuthUser {
  return { id: String(row.id), email: String(row.email), name: String(row.name || '') }
}

export async function getSessionUser(env: Bindings, token: string | null): Promise<AuthUser | null> {
  if (!authAvailable(env) || !token) return null
  try {
    await ensureAuthSchema(env)
    const s: any = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').bind(token).first()
    if (!s) return null
    if (Number(s.expires_at) < now()) {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
      return null
    }
    const u: any = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(s.user_id).first()
    if (!u) return null
    return rowToUser(u)
  } catch {
    return null
  }
}

export async function createSession(env: Bindings, userId: string): Promise<string> {
  await ensureAuthSchema(env)
  const token = randomHex(32)
  const ts = now()
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, userId, ts, ts + SESSION_TTL_SECONDS * 1000)
    .run()
  return token
}

export async function destroySession(env: Bindings, token: string | null): Promise<void> {
  if (!authAvailable(env) || !token) return
  try {
    await ensureAuthSchema(env)
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  } catch {
    /* best-effort */
  }
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export interface AuthResult {
  ok: boolean
  user?: AuthUser
  error?: string
}

/**
 * Register a new email/password user. A google-only account (no password yet)
 * that registers with the same email gets its password set to link it.
 */
export async function registerUser(
  env: Bindings,
  email: string,
  password: string,
  name?: string
): Promise<AuthResult> {
  await ensureAuthSchema(env)
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanName = String(name || '').trim()
  if (!validateEmail(cleanEmail)) return { ok: false, error: 'Please enter a valid email address.' }
  if (String(password || '').length < 8) return { ok: false, error: 'Password must be at least 8 characters.' }

  const existing: any = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail).first()
  const salt = randomHex(16)
  const hash = await derivePasswordHash(password, salt)
  const ts = now()

  if (existing) {
    // Google-only account (no password) → link by setting the password.
    if (!existing.password_hash) {
      await env.DB.prepare(
        'UPDATE users SET password_hash = ?, password_salt = ?, name = COALESCE(NULLIF(?, \'\'), name), updated_at = ? WHERE id = ?'
      )
        .bind(hash, salt, cleanName, ts, existing.id)
        .run()
      return { ok: true, user: rowToUser({ ...existing, name: cleanName || existing.name }) }
    }
    return { ok: false, error: 'An account with this email already exists. Please sign in instead.' }
  }

  const id = newId('usr')
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(id, cleanEmail, cleanName, hash, salt, ts, ts)
    .run()
  return { ok: true, user: { id, email: cleanEmail, name: cleanName } }
}

/** Verify credentials. Uses a uniform error to avoid revealing whether the email exists. */
export async function loginUser(env: Bindings, email: string, password: string): Promise<AuthResult> {
  await ensureAuthSchema(env)
  const cleanEmail = String(email || '').trim().toLowerCase()
  const UNIFORM = 'Incorrect email or password.'
  if (!validateEmail(cleanEmail) || !password) return { ok: false, error: UNIFORM }

  const row: any = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail).first()
  if (!row || !row.password_hash || !row.password_salt) return { ok: false, error: UNIFORM }

  const hash = await derivePasswordHash(password, String(row.password_salt))
  if (!timingSafeEqual(hash, String(row.password_hash))) return { ok: false, error: UNIFORM }
  return { ok: true, user: rowToUser(row) }
}

// ── Google OAuth (authorization-code flow) ────────────────────────
export function googleEnabled(env: Bindings): boolean {
  return !!(
    env.GOOGLE_CLIENT_ID &&
    String(env.GOOGLE_CLIENT_ID).trim() &&
    env.GOOGLE_CLIENT_SECRET &&
    String(env.GOOGLE_CLIENT_SECRET).trim()
  )
}

export function googleRedirectUri(env: Bindings, requestOrigin: string): string {
  if (env.GOOGLE_REDIRECT_URI && String(env.GOOGLE_REDIRECT_URI).trim()) {
    return String(env.GOOGLE_REDIRECT_URI).trim()
  }
  const base = (env.APP_BASE_URL && String(env.APP_BASE_URL).trim()) || requestOrigin
  return base.replace(/\/$/, '') + '/api/auth/google/callback'
}

/** Build the Google authorization URL and return it alongside the state cookie. */
export function googleAuthUrl(env: Bindings, requestOrigin: string): { url: string; stateCookie: string } {
  const state = randomHex(16)
  const params = new URLSearchParams({
    client_id: String(env.GOOGLE_CLIENT_ID),
    redirect_uri: googleRedirectUri(env, requestOrigin),
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
  })
  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    stateCookie: stateCookie(state),
  }
}

/** Verify the state cookie against the callback's state param. */
export function verifyGoogleState(cookieHeader: string | null | undefined, stateParam: string | null): boolean {
  const cookies = parseCookies(cookieHeader)
  const expected = cookies[STATE_COOKIE]
  return !!expected && !!stateParam && timingSafeEqual(expected, stateParam)
}

export function clearGoogleStateCookie(): string {
  return clearStateCookie()
}

export interface GoogleProfile {
  sub: string
  email: string
  name?: string
}

/** Exchange an authorization code for a Google profile. */
export async function exchangeGoogleCode(env: Bindings, code: string, requestOrigin: string): Promise<GoogleProfile> {
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: String(env.GOOGLE_CLIENT_ID),
      client_secret: String(env.GOOGLE_CLIENT_SECRET),
      redirect_uri: googleRedirectUri(env, requestOrigin),
      grant_type: 'authorization_code',
    }).toString(),
  })
  if (!tokenResp.ok) throw new Error('google_token_exchange_failed')
  const tokenData: any = await tokenResp.json()
  const accessToken = tokenData?.access_token
  if (!accessToken) throw new Error('google_no_access_token')

  const infoResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!infoResp.ok) throw new Error('google_userinfo_failed')
  const info: any = await infoResp.json()
  const sub = String(info?.sub || '')
  const email = String(info?.email || '').trim().toLowerCase()
  if (!sub || !email) throw new Error('google_profile_incomplete')
  return { sub, email, name: info?.name ? String(info.name) : undefined }
}

/** Match on google_sub → link by email → create a new google account. */
export async function upsertGoogleUser(env: Bindings, profile: GoogleProfile): Promise<AuthUser> {
  await ensureAuthSchema(env)
  const ts = now()

  const bySub: any = await env.DB.prepare('SELECT id, email, name FROM users WHERE google_sub = ?').bind(profile.sub).first()
  if (bySub) return rowToUser(bySub)

  const byEmail: any = await env.DB.prepare('SELECT id, email, name FROM users WHERE email = ?').bind(profile.email).first()
  if (byEmail) {
    await env.DB.prepare('UPDATE users SET google_sub = ?, name = COALESCE(NULLIF(name, \'\'), ?), updated_at = ? WHERE id = ?')
      .bind(profile.sub, profile.name || '', ts, byEmail.id)
      .run()
    return rowToUser(byEmail)
  }

  const id = newId('usr')
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, google_sub, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, profile.email, profile.name || '', profile.sub, ts, ts)
    .run()
  return { id, email: profile.email, name: profile.name || '' }
}
