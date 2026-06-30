import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { analyzeSubmission, FLAG_FRAMEWORK, type Bindings } from './analyzer'
import { HomePage } from './page'

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

// ── Home page ──
app.get('/', (c) => c.html(HomePage()))

export default app
