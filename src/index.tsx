import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  analyzeSubmission,
  analyzeChunkRequest,
  mergeChunkAnalysis,
  getChunkPlan,
  splitDocument,
  FLAG_FRAMEWORK,
  type Bindings,
} from './analyzer'
import { createJob, getJobStatus, getJobResult, processNextUnit, processJobToCompletion, jobsAvailable } from './jobs'
import { HomePage } from './page'
import { PremiumPage } from './premium'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// Map an analyzer error to a friendly {status, body} pair.
function mapAnalyzeError(err: any): { status: number; body: any } {
  const raw = (err?.message || '').toString()
  if (raw.startsWith('NOT_RELEVANT:')) {
    const reason = raw.slice('NOT_RELEVANT:'.length).trim()
    return {
      status: 422,
      body: {
        error: 'invalid_submission',
        title: "This doesn't look like an investment",
        message:
          (reason ? reason + ' ' : '') +
          'InvestSafe Pro analyzes investment offerings, pitches, ads, emails, or documents (PPMs, fund decks, etc.). Please paste the investment details or attach a document/screenshot of the offer you want checked.',
      },
    }
  }
  if (raw.startsWith('SERVICE_RATELIMIT:')) {
    const secs = Number(raw.slice('SERVICE_RATELIMIT:'.length).trim()) || 0
    return { status: 429, body: { error: 'The analysis service is busy (rate-limited). Please retry in a moment.', retryAfter: secs } }
  }
  if (raw.startsWith('SERVICE_QUOTA:')) {
    return { status: 503, body: { error: 'The analysis service is temporarily unavailable (the shared AI credits have run out). Please try again later.' } }
  }
  if (raw.startsWith('RESPONSE_TRUNCATED:')) {
    return { status: 400, body: { error: 'This document exceeded model response limits. Please trim non-essential pages and retry.' } }
  }
  if (raw.startsWith('SERVICE_AUTH:')) {
    return { status: 503, body: { error: 'The analysis service is not configured correctly (server API key issue). Please contact the site owner.' } }
  }
  if (raw.startsWith('SERVICE_MESSAGE:')) {
    return { status: 502, body: { error: 'The analysis service returned an unexpected response. Please try again in a moment.' } }
  }
  return { status: 500, body: { error: raw || 'Something went wrong while analyzing. Please try again.' } }
}

// ════════════════════════════════════════════════════════════════
//  ASYNC JOB PIPELINE  (primary path when D1/R2 are bound)
//
//  POST /api/jobs           → create job, return { jobId } immediately
//  GET  /api/jobs/:id        → poll status/progress
//  POST /api/jobs/:id/tick   → advance one unit of work (chunk or merge)
//  GET  /api/jobs/:id/result → final assembled result once done
// ════════════════════════════════════════════════════════════════

app.post('/api/jobs', async (c) => {
  if (!jobsAvailable(c.env)) {
    return c.json({ error: 'async_unavailable', message: 'Async jobs require the D1/R2 bindings (available after hosted deploy). Use the browser-driven pipeline instead.' }, 501)
  }
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request.' }, 400)
  }
  const material = (body?.material || '').toString().trim()
  const images: string[] = Array.isArray(body?.images)
    ? body.images.filter((s: any) => typeof s === 'string' && s.startsWith('data:image')).slice(0, 10)
    : []
  if (material.length < 30 && images.length === 0) {
    return c.json({ error: 'Please paste at least a few sentences — or attach a document/image — so we can analyze it.' }, 400)
  }
  try {
    const { jobId, totalChunks } = await createJob(c.env, {
      material,
      images,
      sponsorName: body?.sponsorName,
      assetType: body?.assetType,
      claimedReturn: body?.claimedReturn,
      amountAsked: body?.amountAsked,
      sourceType: body?.sourceType,
    })

    // Background continuation: process the job without requiring the browser to keep ticking.
    c.executionCtx.waitUntil(processJobToCompletion(c.env, jobId).catch(() => {}))

    return c.json({ ok: true, jobId, totalChunks })
  } catch (err: any) {
    const { status, body: eb } = mapAnalyzeError(err)
    return c.json(eb, status as any)
  }
})

app.get('/api/jobs/:id', async (c) => {
  if (!jobsAvailable(c.env)) return c.json({ error: 'async_unavailable' }, 501)
  const jobId = c.req.param('id')
  const status = await getJobStatus(c.env, jobId)
  if (!status) return c.json({ error: 'Job not found.' }, 404)

  // Auto-kick background runner on polling so interrupted sessions can resume processing.
  if (status.status === 'analyzing' || status.status === 'merging' || status.status === 'reporting') {
    c.executionCtx.waitUntil(processJobToCompletion(c.env, jobId).catch(() => {}))
  }

  return c.json(status)
})

app.post('/api/jobs/:id/tick', async (c) => {
  if (!jobsAvailable(c.env)) return c.json({ error: 'async_unavailable' }, 501)
  try {
    const res = await processNextUnit(c.env, c.req.param('id'))
    return c.json(res)
  } catch (err: any) {
    const { status, body } = mapAnalyzeError(err)
    return c.json(body, status as any)
  }
})

app.get('/api/jobs/:id/result', async (c) => {
  if (!jobsAvailable(c.env)) return c.json({ error: 'async_unavailable' }, 501)
  const result = await getJobResult(c.env, c.req.param('id'))
  if (!result) return c.json({ error: 'Result not ready.' }, 404)
  return c.json({ ok: true, result })
})

// ════════════════════════════════════════════════════════════════
//  SYNCHRONOUS + BROWSER-DRIVEN PATHS  (small docs / no-D1 fallback)
// ════════════════════════════════════════════════════════════════

// ── analyze a submission in one request (small docs / images) ──
app.post('/api/analyze', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request.' }, 400)
  }
  const material = (body?.material || '').toString().trim()
  const images: string[] = Array.isArray(body?.images)
    ? body.images.filter((s: any) => typeof s === 'string' && s.startsWith('data:image')).slice(0, 10)
    : []
  if (material.length < 30 && images.length === 0) {
    return c.json({ error: 'Please paste at least a few sentences — or attach a document or image of the investment pitch — so we can analyze it.' }, 400)
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
    const { status, body } = mapAnalyzeError(err)
    return c.json(body, status as any)
  }
})

// ── chunk plan (browser-driven fallback) ──
app.get('/api/chunk-plan', (c) => {
  const len = Math.max(0, Number(c.req.query('len')) || 0)
  return c.json(getChunkPlan(c.env, len))
})

// ── authoritative server-side semantic split ──
app.post('/api/split', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request.' }, 400)
  }
  const material = (body?.material || '').toString()
  const { chunks } = splitDocument(c.env, material)
  return c.json({
    needsChunking: chunks.length > 1,
    chunks: chunks.map((ch) => ({
      chunk_id: ch.chunk_id,
      text: ch.text,
      startPage: ch.startPage,
      endPage: ch.endPage,
      headings: ch.headings,
    })),
  })
})

// ── analyze ONE chunk (browser-driven fallback) ──
app.post('/api/analyze-chunk', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request.' }, 400)
  }
  const chunk = (body?.chunk || '').toString()
  const images: string[] = Array.isArray(body?.images)
    ? body.images.filter((s: any) => typeof s === 'string' && s.startsWith('data:image')).slice(0, 10)
    : []
  if (chunk.trim().length === 0 && images.length === 0) {
    return c.json({ error: 'Empty chunk.' }, 400)
  }
  try {
    const result = await analyzeChunkRequest(c.env, {
      chunk,
      chunkIndex: Number(body?.chunkIndex) || 0,
      totalChunks: Number(body?.totalChunks) || 1,
      startPage: Number(body?.startPage) || 0,
      endPage: Number(body?.endPage) || 0,
      headings: Array.isArray(body?.headings) ? body.headings : [],
      images,
      sponsorName: body?.sponsorName,
      assetType: body?.assetType,
      claimedReturn: body?.claimedReturn,
      amountAsked: body?.amountAsked,
      sourceType: body?.sourceType,
    })
    return c.json({ ok: true, result })
  } catch (err: any) {
    const { status, body } = mapAnalyzeError(err)
    return c.json(body, status as any)
  }
})

// ── merge per-chunk results (browser-driven fallback) ──
app.post('/api/merge', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request.' }, 400)
  }
  const results = Array.isArray(body?.results) ? body.results : []
  if (results.length === 0) return c.json({ error: 'No chunk results to merge.' }, 400)
  try {
    const result = await mergeChunkAnalysis(c.env, results)
    return c.json({ ok: true, result })
  } catch (err: any) {
    const { status, body } = mapAnalyzeError(err)
    return c.json(body, status as any)
  }
})

// ── the framework (for the methodology page) ──
app.get('/api/framework', (c) => c.json({ flags: FLAG_FRAMEWORK }))

// ── capabilities (frontend decides async vs browser-driven) ──
app.get('/api/capabilities', (c) => c.json({ asyncJobs: jobsAvailable(c.env) }))

// ── Pages ──
app.get('/', (c) => c.html(HomePage()))
app.get('/solution', (c) => c.html(PremiumPage()))

// legacy links now point to the unified solutions page
app.get('/solutions', (c) => c.redirect('/solution', 301))
app.get('/pricing', (c) => c.redirect('/solution', 301))
app.get('/premium', (c) => c.redirect('/solution', 301))

app.post('/api/solution-request', async (c) => {
  let body: Record<string, any>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'Invalid request payload.' }, 400)
  }

  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim()
  const tierId = String(body.tierId || '').trim()
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  if (!name || !emailOk || !tierId) {
    return c.json({ ok: false, error: 'Name, email, and selected tier are required.' }, 400)
  }

  const reference = `SR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const record = { reference, receivedAt: new Date().toISOString(), ...body }

  try {
    const kv = (c.env as any)?.KV
    if (kv && typeof kv.put === 'function') {
      await kv.put(`solution-request:${reference}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 })
    }
  } catch {
    /* optional */
  }

  return c.json({
    ok: true,
    reference,
    message: 'Request received. Our team will contact you shortly with next steps.',
  })
})

app.post('/api/premium-request', async (c) => {
  let body: Record<string, any>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'Invalid request payload.' }, 400)
  }

  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim()
  const serviceType = String(body.serviceType || '').trim()
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  if (!name || !emailOk) {
    return c.json({ ok: false, error: 'Name and valid email are required.' }, 400)
  }

  const reference = `PR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const record = { reference, receivedAt: new Date().toISOString(), serviceType, ...body }

  try {
    const kv = (c.env as any)?.KV
    if (kv && typeof kv.put === 'function') {
      await kv.put(`premium-request:${reference}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 })
    }
  } catch {
    /* optional */
  }

  return c.json({
    ok: true,
    reference,
    message: 'Request received. Our team will respond within one business day.',
  })
})

export default app
