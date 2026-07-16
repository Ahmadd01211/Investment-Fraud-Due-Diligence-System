// ════════════════════════════════════════════════════════════════
//  ASYNC ANALYSIS JOB PIPELINE  (persistent job-id + server-side continuation)
//
//  Jobs are persisted in D1 and can continue in the background using
//  executionCtx.waitUntil() runners. Clients only need jobId polling, so
//  browser interruptions do not lose the task state.
//
//     POST /api/jobs           → create job + return { jobId } immediately,
//                                 then schedule background processing.
//     GET  /api/jobs/:id       → status/progress polling (also kicks a runner
//                                 in waitUntil if job is still active).
//     POST /api/jobs/:id/tick  → optional manual one-step tick (debug/fallback).
//     GET  /api/jobs/:id/result→ final assembled result once done.
//
//  MIGRATION TO QUEUES LATER = minimal: each "tick" is one queue message.
//  Replace the frontend-driven tick loop with a queue consumer that calls
//  processNextUnit(env, jobId); everything else (D1 rows, merge, report)
//  stays identical.
//
//  DEGRADED MODE: if D1/R2 bindings are absent (e.g. local dev without a DB),
//  jobsAvailable(env) is false and index.tsx falls back to the browser-driven
//  chunk pipeline (/api/split + /api/analyze-chunk + /api/merge).
// ════════════════════════════════════════════════════════════════

import {
  buildChunks,
  evaluateChunk,
  mergeOnly,
  generateReport,
  assembleResult,
  prepareMaterial,
  type Bindings,
  type Chunk,
} from './analyzer'
import { selectReasoningProvider, hasProvider } from './providers'
import type { ChunkEvaluation } from './rules'

export function jobsAvailable(env: Bindings): boolean {
  return !!(env.DB && typeof env.DB.prepare === 'function')
}

// Self-provision the schema (idempotent). Runs on job creation so the tables
// exist regardless of whether `d1 migrations apply` was run against this exact
// local/remote DB. In production, migrations are still the source of truth;
// this is a safe no-op when the tables already exist.
let schemaReady = false
async function ensureSchema(env: Bindings): Promise<void> {
  if (schemaReady) return
  await env.DB.exec(
    'CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT \'pending\', provider TEXT, user_id TEXT, total_chunks INTEGER NOT NULL DEFAULT 0, done_chunks INTEGER NOT NULL DEFAULT 0, context_json TEXT, raw_key TEXT, text_key TEXT, result_json TEXT, error_message TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
  )
  await env.DB.exec(
    'CREATE TABLE IF NOT EXISTS job_chunks (job_id TEXT NOT NULL, chunk_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', start_page INTEGER NOT NULL DEFAULT 0, end_page INTEGER NOT NULL DEFAULT 0, headings TEXT, text_inline TEXT, eval_json TEXT, error_message TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (job_id, chunk_id))'
  )
  // Guarded add for DBs created before user_id existed (idempotent).
  try {
    await env.DB.exec('ALTER TABLE jobs ADD COLUMN user_id TEXT')
  } catch {
    /* column already exists */
  }
  try {
    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id, created_at)')
  } catch {
    /* index optional */
  }
  schemaReady = true
}

function now() {
  return Date.now()
}

function newJobId(): string {
  const rand = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14)
  return `job_${Date.now().toString(36)}_${rand}`
}

export interface CreateJobInput {
  material: string
  images?: string[]
  sponsorName?: string
  assetType?: string
  claimedReturn?: string
  amountAsked?: string
  sourceType?: string
  userId?: string
}

// ── Create a job: single-pass row, persist id, return immediately ──
export async function createJob(env: Bindings, input: CreateJobInput): Promise<{ jobId: string; totalChunks: number }> {
  if (!hasProvider(env)) throw new Error('SERVICE_AUTH: Analysis service is not configured.')
  await ensureSchema(env)
  const jobId = newJobId()
  const ts = now()

  const images = (input.images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image')).slice(0, 120)
  const rawMaterial = (input.material || '').trim()

  // OCR images (OpenAI) + merge/de-dupe with pasted text UP FRONT so every
  // chunk is pure text. DeepSeek (reasoning) never receives images.
  const material = await prepareMaterial(env, rawMaterial, images)

  const chunks: Chunk[] = buildChunks(env, material)

  // Images are already OCR'd into the text; nothing image-related is persisted.
  const context = {
    sponsorName: input.sponsorName,
    assetType: input.assetType,
    claimedReturn: input.claimedReturn,
    amountAsked: input.amountAsked,
    sourceType: input.sourceType,
  }

  // Store the full extracted text in R2 (avoids bloating D1); chunks store inline.
  const textKey = `jobs/${jobId}/text.txt`
  if (env.R2 && typeof env.R2.put === 'function') {
    try {
      await env.R2.put(textKey, material || '(image submission)')
    } catch {
      /* R2 optional */
    }
  }

  const userId = input.userId ? String(input.userId) : null

  await env.DB.prepare(
    `INSERT INTO jobs (id, status, user_id, total_chunks, done_chunks, context_json, text_key, created_at, updated_at)
     VALUES (?, 'analyzing', ?, ?, 0, ?, ?, ?, ?)`
  )
    .bind(jobId, userId, chunks.length, JSON.stringify(context), textKey, ts, ts)
    .run()

  // Persist chunk rows. Chunk text stored inline (D1 row); large enough for our chunks.
  const stmt = env.DB.prepare(
    `INSERT INTO job_chunks (job_id, chunk_id, status, start_page, end_page, headings, text_inline, updated_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`
  )
  const batch = chunks.map((c) =>
    stmt.bind(jobId, c.chunk_id, c.startPage, c.endPage, JSON.stringify(c.headings || []), c.text, ts)
  )
  await env.DB.batch(batch)

  return { jobId, totalChunks: chunks.length }
}

export interface JobStatus {
  jobId: string
  status: string
  provider: string | null
  totalChunks: number
  doneChunks: number
  progress: number
  error?: string
  hasResult: boolean
}

export async function getJobStatus(env: Bindings, jobId: string): Promise<JobStatus | null> {
  const row: any = await env.DB.prepare(`SELECT * FROM jobs WHERE id = ?`).bind(jobId).first()
  if (!row) return null
  const total = Number(row.total_chunks) || 0
  const done = Number(row.done_chunks) || 0
  return {
    jobId,
    status: row.status,
    provider: row.provider || null,
    totalChunks: total,
    doneChunks: done,
    progress: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
    error: row.error_message || undefined,
    hasResult: !!row.result_json,
  }
}

export async function getJobResult(env: Bindings, jobId: string): Promise<any | null> {
  const row: any = await env.DB.prepare(`SELECT result_json, status, error_message FROM jobs WHERE id = ?`).bind(jobId).first()
  if (!row) return null
  if (row.status === 'error') return { error: row.error_message || 'Analysis failed.' }
  if (!row.result_json) return null
  return JSON.parse(row.result_json)
}

async function touchJob(env: Bindings, jobId: string, fields: Record<string, any>) {
  const keys = Object.keys(fields)
  const set = keys.map((k) => `${k} = ?`).join(', ')
  await env.DB.prepare(`UPDATE jobs SET ${set}, updated_at = ? WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), now(), jobId)
    .run()
}

export interface TickResult {
  jobId: string
  status: string
  doneChunks: number
  totalChunks: number
  progress: number
  finished: boolean
  error?: string
  /** seconds the client should wait before the next tick (rate-limit backoff). */
  retryAfter?: number
}

/**
 * Advance a job by ONE unit of work. Called repeatedly (by frontend polling or,
 * later, by a queue consumer). Idempotent-ish: safe to call after completion.
 */
export async function processNextUnit(env: Bindings, jobId: string): Promise<TickResult> {
  const job: any = await env.DB.prepare(`SELECT * FROM jobs WHERE id = ?`).bind(jobId).first()
  if (!job) return { jobId, status: 'error', doneChunks: 0, totalChunks: 0, progress: 0, finished: true, error: 'Job not found.' }

  const total = Number(job.total_chunks) || 0
  const done = Number(job.done_chunks) || 0
  const mkResult = (extra: Partial<TickResult> = {}): TickResult => ({
    jobId,
    status: job.status,
    doneChunks: done,
    totalChunks: total,
    progress: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
    finished: false,
    ...extra,
  })

  if (job.status === 'done' || job.status === 'not_relevant') return mkResult({ status: job.status, finished: true })
  if (job.status === 'error') return mkResult({ status: 'error', finished: true, error: job.error_message })

  if (!hasProvider(env)) {
    await touchJob(env, jobId, { status: 'error', error_message: 'Analysis service is not configured.' })
    return mkResult({ status: 'error', finished: true, error: 'Analysis service is not configured.' })
  }
  const provider = selectReasoningProvider(env)
  const context = job.context_json ? JSON.parse(job.context_json) : {}
  const ctx: string[] = []
  if (context.sponsorName) ctx.push(`Sponsor / promoter name: ${context.sponsorName}`)
  if (context.assetType) ctx.push(`Asset type / strategy: ${context.assetType}`)
  if (context.claimedReturn) ctx.push(`Claimed return / IRR: ${context.claimedReturn}`)
  if (context.amountAsked) ctx.push(`Minimum investment / amount asked: ${context.amountAsked}`)
  if (context.sourceType) ctx.push(`Where this came from: ${context.sourceType}`)

  // ── 1. Analyze the next pending chunk, if any ──
  const nextChunk: any = await env.DB.prepare(
    `SELECT * FROM job_chunks WHERE job_id = ? AND status = 'pending' ORDER BY chunk_id ASC LIMIT 1`
  )
    .bind(jobId)
    .first()

  if (nextChunk) {
    const chunk: Chunk = {
      chunk_id: Number(nextChunk.chunk_id),
      text: String(nextChunk.text_inline || ''),
      startPage: Number(nextChunk.start_page) || 0,
      endPage: Number(nextChunk.end_page) || 0,
      headings: nextChunk.headings ? JSON.parse(nextChunk.headings) : [],
    }
    try {
      // Images were OCR'd into the chunk text at job creation; text-only here.
      const evalResult: ChunkEvaluation = await evaluateChunk(provider, chunk, ctx)
      await env.DB.prepare(
        `UPDATE job_chunks SET status = 'done', eval_json = ?, updated_at = ? WHERE job_id = ? AND chunk_id = ?`
      )
        .bind(JSON.stringify(evalResult), now(), jobId, chunk.chunk_id)
        .run()
      const newDone = done + 1
      await touchJob(env, jobId, { done_chunks: newDone, provider: provider.name })
      return {
        jobId,
        status: 'analyzing',
        doneChunks: newDone,
        totalChunks: total,
        progress: total > 0 ? Math.min(99, Math.round((newDone / total) * 100)) : 0,
        finished: false,
      }
    } catch (err: any) {
      const msg = String(err?.message || '')
      // Rate-limit → retryable: leave chunk pending, tell client to back off.
      if (msg.startsWith('SERVICE_RATELIMIT:')) {
        const secs = Number(msg.slice('SERVICE_RATELIMIT:'.length)) || 20
        return mkResult({ status: 'analyzing', retryAfter: secs })
      }
      // Non-retryable → fail the job.
      await env.DB.prepare(`UPDATE job_chunks SET status = 'error', error_message = ?, updated_at = ? WHERE job_id = ? AND chunk_id = ?`)
        .bind(msg.slice(0, 300), now(), jobId, chunk.chunk_id)
        .run()
      await touchJob(env, jobId, { status: 'error', error_message: msg.slice(0, 300) })
      return mkResult({ status: 'error', finished: true, error: msg })
    }
  }

  // ── 2. No pending chunks → merge + report (deterministic score in TS) ──
  await touchJob(env, jobId, { status: 'merging' })
  const rows: any = await env.DB.prepare(`SELECT eval_json FROM job_chunks WHERE job_id = ? AND status = 'done' ORDER BY chunk_id ASC`)
    .bind(jobId)
    .all()
  const evals: ChunkEvaluation[] = (rows?.results || [])
    .map((r: any) => {
      try {
        return JSON.parse(r.eval_json)
      } catch {
        return null
      }
    })
    .filter(Boolean)

  const merged = mergeOnly(evals)

  if (!merged.isInvestmentRelated) {
    await touchJob(env, jobId, {
      status: 'not_relevant',
      result_json: JSON.stringify({ notRelevant: true, reason: merged.notRelevantReason }),
    })
    return { jobId, status: 'not_relevant', doneChunks: done, totalChunks: total, progress: 100, finished: true }
  }

  await touchJob(env, jobId, { status: 'reporting' })
  const report = await generateReport(provider, merged)
  const result = assembleResult(merged, report)

  await touchJob(env, jobId, { status: 'done', result_json: JSON.stringify(result) })
  return { jobId, status: 'done', doneChunks: total, totalChunks: total, progress: 100, finished: true }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Run a persisted job to completion in background-friendly steps.
 * Safe to call repeatedly: completed/error jobs no-op quickly.
 */
export async function processJobToCompletion(env: Bindings, jobId: string, maxSteps = 24): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const tick = await processNextUnit(env, jobId)
    if (tick.finished) return
    if (tick.retryAfter && tick.retryAfter > 0) {
      await sleep(Math.max(1000, tick.retryAfter * 1000))
    } else {
      await sleep(250)
    }
  }
}

// ── Saved history for a signed-in user (Feature B) ──
export interface UserJobSummary {
  jobId: string
  status: string
  createdAt: number
  riskScore: number | null
  riskLevel: string | null
  verdict: string | null
}

/** Newest-first summaries of a user's jobs (parsed from result_json). */
export async function getUserJobs(env: Bindings, userId: string, limit = 20): Promise<UserJobSummary[]> {
  if (!jobsAvailable(env) || !userId) return []
  try {
    await ensureSchema(env)
    const rows: any = await env.DB.prepare(
      `SELECT id, status, result_json, created_at FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    )
      .bind(userId, Math.max(1, Math.min(100, limit)))
      .all()
    return (rows?.results || []).map((r: any) => {
      let riskScore: number | null = null
      let riskLevel: string | null = null
      let verdict: string | null = null
      if (r.result_json) {
        try {
          const res = JSON.parse(r.result_json)
          if (typeof res?.riskScore === 'number') riskScore = res.riskScore
          if (res?.riskLevel) riskLevel = String(res.riskLevel)
          if (res?.verdict) verdict = String(res.verdict)
        } catch {
          /* ignore malformed */
        }
      }
      return {
        jobId: String(r.id),
        status: String(r.status),
        createdAt: Number(r.created_at) || 0,
        riskScore,
        riskLevel,
        verdict,
      }
    })
  } catch {
    return []
  }
}
