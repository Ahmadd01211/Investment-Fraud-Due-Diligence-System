import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { analyzeSubmission, FLAG_FRAMEWORK, type Bindings } from './analyzer'
import { HomePage } from './page'
import { PricingPage } from './pricing'
import { PremiumPage } from './premium'
import {
  PLANS,
  ONE_TIME_OFFERINGS,
  CURRENCY,
  PREMIUM_AUDIENCES,
  SERVICE_TIERS,
  ADDON_SERVICES,
  VALUATION_CARDS,
} from './plans'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// ── API: analyze a submission (server-side AI, no BYOK) ──
app.post('/api/analyze', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request.' }, 400)
  }

  const material = (body?.material || '').toString().trim()
  const images: string[] = Array.isArray(body?.images)
    ? body.images.filter((s: any) => typeof s === 'string' && s.startsWith('data:image')).slice(0, 4)
    : []

  if (material.length < 30 && images.length === 0) {
    return c.json(
      { error: 'Please paste at least a few sentences — or attach a document or image of the investment pitch — so we can analyze it.' },
      400
    )
  }

  try {
    const result = await analyzeSubmission(c.env, {
      material,
      images,
      sponsorName: body?.sponsorName,
      assetType: body?.assetType,
      claimedReturn: body?.claimedReturn,
      amountAsked: body?.amountAsked,
      sourceType: body?.sourceType,
    })
    return c.json({ ok: true, result })
  } catch (err: any) {
    const raw = (err?.message || '').toString()
    if (raw.startsWith('NOT_RELEVANT:')) {
      const reason = raw.slice('NOT_RELEVANT:'.length).trim()
      return c.json(
        {
          error: 'invalid_submission',
          title: "This doesn't look like an investment",
          message:
            (reason ? reason + ' ' : '') +
            'InvestSafe Pro analyzes investment offerings, pitches, ads, emails, or documents (PPMs, fund decks, etc.). Please paste the investment details or attach a document/screenshot of the offer you want checked.',
        },
        422
      )
    }
    if (raw.startsWith('SERVICE_QUOTA:')) {
      return c.json(
        { error: 'The analysis service is temporarily unavailable (the shared AI credits have run out). This is on our side, not your submission — please try again later.' },
        503
      )
    }
    if (raw.startsWith('RESPONSE_TRUNCATED:')) {
      return c.json(
        { error: 'This document is very large, so the analysis was cut off before finishing. Please paste or attach just the key pages (e.g. the summary, terms, and return claims) and try again.' },
        400
      )
    }
    if (raw.startsWith('SERVICE_AUTH:')) {
      return c.json({ error: 'The analysis service is not configured correctly (server API key issue). Please contact the site owner.' }, 503)
    }
    if (raw.startsWith('SERVICE_MESSAGE:')) {
      return c.json({ error: 'The analysis service returned an unexpected response. Please try again in a moment.' }, 502)
    }
    return c.json({ error: raw || 'Something went wrong while analyzing. Please try again.' }, 500)
  }
})

// ── API: the framework (for the methodology page) ──
app.get('/api/framework', (c) => c.json({ flags: FLAG_FRAMEWORK }))

// ── API: membership plans + one-time offerings (single source of truth) ──
app.get('/api/plans', (c) =>
  c.json({ currency: CURRENCY, plans: PLANS, oneTimeOfferings: ONE_TIME_OFFERINGS })
)

// ── Home page ──
app.get('/', (c) => c.html(HomePage()))

// ── Memberships / pricing page ──
app.get('/pricing', (c) => c.html(PricingPage()))

// ── API: premium services (tiers, à la carte add-ons, valuation) ──
app.get('/api/premium', (c) =>
  c.json({
    currency: CURRENCY,
    audiences: PREMIUM_AUDIENCES,
    serviceTiers: SERVICE_TIERS,
    addOns: ADDON_SERVICES,
    valuation: VALUATION_CARDS,
  })
)

// ── Premium Services page ──
app.get('/premium', (c) => c.html(PremiumPage()))

// ── Premium / Asset-Valuation service request intake ──
// Receives the modal form submissions from /premium. Validates the minimal
// required fields, generates a confidential reference id, and (best-effort)
// persists to KV when the binding is available. No PII is logged.
app.post('/api/premium-request', async (c) => {
  let body: Record<string, any>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'Invalid request payload.' }, 400)
  }

  const kind = body.kind === 'valuation' ? 'valuation' : 'premium'
  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim()
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  if (!name || !emailOk) {
    return c.json(
      { ok: false, error: 'A valid name and email address are required.' },
      400
    )
  }
  if (kind === 'premium') {
    if (!String(body.target || '').trim() || !String(body.clientType || '').trim()) {
      return c.json(
        { ok: false, error: 'Client type and subject of investigation are required.' },
        400
      )
    }
  } else {
    if (!String(body.sponsor || '').trim()) {
      return c.json({ ok: false, error: 'Sponsor / syndicator name is required.' }, 400)
    }
  }

  const prefix = kind === 'valuation' ? 'AV' : 'PS'
  const reference = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`

  const record = {
    reference,
    kind,
    receivedAt: new Date().toISOString(),
    ...body,
  }

  // Best-effort persistence — only if a KV namespace is bound.
  try {
    const kv = (c.env as any)?.KV
    if (kv && typeof kv.put === 'function') {
      await kv.put(`premium-request:${reference}`, JSON.stringify(record), {
        expirationTtl: 60 * 60 * 24 * 90, // 90 days
      })
    }
  } catch {
    // Persistence is optional; the request is still accepted.
  }

  return c.json({
    ok: true,
    reference,
    message:
      'Request received. A member of our team will respond within one business day to confirm scope, pricing, and engagement letter.',
  })
})

export default app
