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
    return c.json({ error: err?.message || 'Something went wrong while analyzing. Please try again.' }, 500)
  }
})

// ── API: the framework (for the methodology page) ──
app.get('/api/framework', (c) => c.json({ flags: FLAG_FRAMEWORK }))

// ── Home page ──
app.get('/', (c) => c.html(HomePage()))

export default app
