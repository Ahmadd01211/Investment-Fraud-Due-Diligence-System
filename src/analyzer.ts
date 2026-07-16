// ════════════════════════════════════════════════════════════════
//  InvestSafe Pro™ — Forensic Analysis Orchestrator (server-side)
//
//  v6.0 — PRODUCTION ARCHITECTURE (permanent, not a workaround)
//
//  PIPELINE (never truncates, never scores in the LLM):
//    1. chunking.ts   → semantic, page-aware chunks (headings/clauses/tables).
//    2. providers.ts  → Kimi (primary) or OpenAI (fallback), strongest model.
//    3. rules.ts      → each chunk evaluated against ALL 21 rules; the LLM
//                       returns deterministic per-chunk JSON (triggered,
//                       confidence, tier, evidence[page/quote/reason]) ONLY.
//    4. merge.ts      → deterministic TS merge + scoring (no LLM).
//    5. report        → ONE final LLM call writes prose from the merged
//                       dataset; it does NOT score or decide which rules fired.
//
//  This module exposes both:
//    • high-level helpers used by the async job pipeline (index.tsx)
//    • backward-compatible entry points (analyzeSubmission, analyzeChunkRequest,
//      mergeChunkAnalysis, getChunkPlan, splitDocument) so existing routes keep
//      working while the async layer is adopted.
// ════════════════════════════════════════════════════════════════

import {
  selectProvider,
  selectOcrProvider,
  hasProvider,
  type AIProvider,
  type ProviderEnv,
} from './providers'
import {
  FLAG_FRAMEWORK,
  RULE_BY_N,
  CHUNK_EVAL_PROMPT,
  REPORT_PROMPT,
  type ChunkEvaluation,
  type RuleFinding,
} from './rules'
import {
  stripPageMarkers,
  type Chunk,
} from './chunking'
import { mergeEvaluations, type MergedDataset, type MergedFinding } from './merge'

export { FLAG_FRAMEWORK }

// Re-export so index.tsx (and the async layer) can share one Bindings type.
export type Bindings = ProviderEnv & {
  // ── Chunk sizing (TPM-driven; future-proof) ──
  OPENAI_TPM?: string
  KIMI_TPM?: string
  MAX_CHUNK_CHARS?: string
  MIN_CHUNK_CHARS?: string
  SKIP_BOILERPLATE?: string

  // ── Async job storage bindings (optional; present after hosted deploy) ──
  DB?: any     // D1Database — jobs / chunks / findings
  R2?: any     // R2Bucket — raw uploads + extracted text
  KV?: any     // KVNamespace — premium requests (existing)
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

// ── Structured context lines from the intake fields ──
export interface AnalyzeInput {
  material: string
  sponsorName?: string
  assetType?: string
  claimedReturn?: string
  amountAsked?: string
  sourceType?: string
  images?: string[]
}

function buildCtx(input: Partial<AnalyzeInput>): string[] {
  const ctx: string[] = []
  if (input.sponsorName) ctx.push(`Sponsor / promoter name: ${input.sponsorName}`)
  if (input.assetType) ctx.push(`Asset type / strategy: ${input.assetType}`)
  if (input.claimedReturn) ctx.push(`Claimed return / IRR: ${input.claimedReturn}`)
  if (input.amountAsked) ctx.push(`Minimum investment / amount asked: ${input.amountAsked}`)
  if (input.sourceType) ctx.push(`Where this came from: ${input.sourceType}`)
  return ctx
}

// ════════════════════════════════════════════════════════════════
//  CHUNKING (public)
// ════════════════════════════════════════════════════════════════

/**
 * Single-pass mode: disable server chunking and analyze in one LLM request.
 * (Requested for GPT-5 large-context usage.)
 */
export function buildChunks(_env: Bindings, material: string): Chunk[] {
  const text = String(material || '').trim()
  if (!text) return []
  return [{ chunk_id: 0, text, startPage: 1, endPage: 1, headings: [] }]
}

export interface ChunkPlanInfo {
  needsChunking: boolean
  totalChunks: number
  maxChunkChars: number
}

/** Report the chunking plan. In single-pass mode chunking is always disabled. */
export function getChunkPlan(_env: Bindings, _docLenOrText: number | string): ChunkPlanInfo {
  return { needsChunking: false, totalChunks: 1, maxChunkChars: 0 }
}

/** Authoritative server-side split (single-pass mode always returns one chunk). */
export function splitDocument(env: Bindings, text: string): { chunks: Chunk[] } {
  return { chunks: buildChunks(env, text) }
}

// ════════════════════════════════════════════════════════════════
//  ONE-CHUNK RULE EVALUATION  (LLM = evidence only, no scoring)
// ════════════════════════════════════════════════════════════════

function safeParseJson(content: string, finishReason: string | null): any {
  const trimmed = String(content).trim()
  if (finishReason === 'length') {
    throw new Error('RESPONSE_TRUNCATED: The model response was cut off due to size limits. Reduce non-essential content and retry.')
  }
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[') || /\{[\s\S]*\}/.test(trimmed)
  if (!looksJson) {
    const lower = trimmed.toLowerCase()
    if (lower.includes('credit') && (lower.includes('deplet') || lower.includes('purchase'))) {
      throw new Error('SERVICE_QUOTA: The analysis service is temporarily unavailable (account credits depleted).')
    }
    throw new Error(`SERVICE_MESSAGE: ${trimmed.slice(0, 300)}`)
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Could not parse the analysis result.')
    return JSON.parse(m[0])
  }
}

/** Normalize a raw LLM chunk result into a strict ChunkEvaluation. */
function normalizeChunkEval(raw: any, chunk: Chunk): ChunkEvaluation {
  const rulesIn: any[] = Array.isArray(raw?.rules) ? raw.rules : []
  const byId = new Map<number, any>()
  for (const r of rulesIn) {
    const id = Number(r?.rule_id)
    if (RULE_BY_N.has(id)) byId.set(id, r)
  }
  // Ensure ALL 21 rules present.
  const rules: RuleFinding[] = FLAG_FRAMEWORK.map((def) => {
    const r = byId.get(def.n)
    const triggered = r?.triggered === true
    const evidence = Array.isArray(r?.evidence)
      ? r.evidence.map((e: any) => ({
          page: Math.max(0, Number(e?.page) || chunk.startPage || 0),
          section: e?.section ? String(e.section) : undefined,
          quote: String(e?.quote || '').trim(),
          reason: String(e?.reason || '').trim(),
        }))
      : []
    return {
      rule_id: def.n,
      triggered,
      confidence: clamp(Number(r?.confidence) || 0, 0, 1),
      evidence_tier: (r?.evidence_tier || 'GAP') as any,
      evidence,
    }
  })
  return {
    chunk_id: chunk.chunk_id,
    page_range: [chunk.startPage || 0, chunk.endPage || 0],
    // Strict parsing: only explicit true counts as investment-related.
    is_investment_related: raw?.is_investment_related === true,
    not_relevant_reason: String(raw?.not_relevant_reason || ''),
    rules,
    claims: Array.isArray(raw?.claims) ? raw.claims : [],
  }
}

/**
 * Evaluate ONE chunk against the 21 rules using the active provider's
 * strongest reasoning model. Returns a strict ChunkEvaluation.
 */
export async function evaluateChunk(
  provider: AIProvider,
  chunk: Chunk,
  ctx: string[],
  images: string[] = []
): Promise<ChunkEvaluation> {
  const hasImages = images.length > 0
  const cleanText = stripPageMarkers(chunk.text)
  const pageNote = chunk.startPage
    ? `This chunk spans pages ${chunk.startPage}–${chunk.endPage}. The text below preserves [[PAGE n]] markers; cite the page each quote appears on.`
    : 'Page numbers are not available; use page 0 in evidence.'

  const textPart =
    (ctx.length ? `INVESTOR-PROVIDED CONTEXT:\n${ctx.join('\n')}\n\n` : '') +
    (chunk.headings.length ? `SECTION(S) IN THIS CHUNK: ${chunk.headings.join(' | ')}\n\n` : '') +
    `CHUNK ID: ${chunk.chunk_id}\n${pageNote}\n\n` +
    `MATERIAL TO EVALUATE:\n"""\n${chunk.text}\n"""\n\n` +
    (hasImages ? `The investor also attached ${images.length} image(s); read all text/claims in them too.\n\n` : '') +
    `Evaluate ALL 21 rules against this chunk and return the JSON object only.`

  const userContent = hasImages
    ? [{ type: 'text', text: textPart }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
    : textPart

  const res = await provider.chatJson({
    role: hasImages ? 'vision' : 'reason',
    systemPrompt: CHUNK_EVAL_PROMPT(),
    userContent,
  })
  const raw = safeParseJson(res.content, res.finishReason)
  return normalizeChunkEval(raw, chunk)
}

// ════════════════════════════════════════════════════════════════
//  FINAL REPORT  (LLM = prose only, from the merged dataset)
// ════════════════════════════════════════════════════════════════

export interface FinalReport {
  verdict: string
  summary: string
  executiveSummary: string
  keyConcerns: string[]
  recommendations: string[]
  investorAdvice: string
  disclaimer: string
}

const FALLBACK_REPORT: FinalReport = {
  verdict: '',
  summary: '',
  executiveSummary: '',
  keyConcerns: [],
  recommendations: [],
  investorAdvice: '',
  disclaimer:
    'This is an educational due-diligence aid, not legal or financial advice. Always verify with primary sources and consult a licensed professional.',
}

/** Compact the merged dataset to the minimum the report writer needs. */
function reportInputFor(merged: MergedDataset) {
  return {
    riskScore: merged.riskScore,
    riskLevel: merged.riskLevel,
    scoreBreakdown: merged.scoreBreakdown,
    triggeredRules: merged.triggeredFlags.map((f) => ({
      rule_id: f.n,
      name: f.name,
      tier: f.evidenceTier,
      confidence: f.confidence,
      pages: f.pages,
      evidence: f.evidence.slice(0, 4).map((e) => ({ page: e.page, quote: e.quote, reason: e.reason })),
    })),
    claims: merged.claims.slice(0, 20),
  }
}

/** Generate the human-readable report from the merged dataset (prose only). */
export async function generateReport(provider: AIProvider, merged: MergedDataset): Promise<FinalReport> {
  if (!merged.isInvestmentRelated) return { ...FALLBACK_REPORT }
  try {
    const res = await provider.chatJson({
      role: 'reason',
      systemPrompt: REPORT_PROMPT(),
      userContent: `FINAL ANALYSIS DATASET (already scored by the application — do not change scores):\n${JSON.stringify(
        reportInputFor(merged)
      )}`,
      maxTokens: 4000,
    })
    const raw = safeParseJson(res.content, res.finishReason)
    return {
      verdict: String(raw?.verdict || ''),
      summary: String(raw?.summary || ''),
      executiveSummary: String(raw?.executiveSummary || ''),
      keyConcerns: Array.isArray(raw?.keyConcerns) ? raw.keyConcerns.map((x: any) => String(x)) : [],
      recommendations: Array.isArray(raw?.recommendations) ? raw.recommendations.map((x: any) => String(x)) : [],
      investorAdvice: String(raw?.investorAdvice || ''),
      disclaimer: String(raw?.disclaimer || FALLBACK_REPORT.disclaimer),
    }
  } catch {
    // Report generation is non-fatal: return the deterministic data without prose.
    return { ...FALLBACK_REPORT }
  }
}

// ════════════════════════════════════════════════════════════════
//  FINAL RESULT SHAPE  (merged dataset + report, back-compat mapped)
// ════════════════════════════════════════════════════════════════

/** Combine the deterministic dataset + LLM prose into the response shape. */
export function assembleResult(merged: MergedDataset, report: FinalReport) {
  return {
    riskScore: merged.riskScore,
    riskLevel: merged.riskLevel,
    scoreBreakdown: merged.scoreBreakdown,
    verdict: report.verdict,
    summary: report.summary,
    executiveSummary: report.executiveSummary,
    keyConcerns: report.keyConcerns,
    recommendations: report.recommendations,
    // Back-compat: existing frontend reads triggeredFlags[].{n,name,weight,severity,evidenceTier,weightedPoints,evidence,explanation}
    triggeredFlags: merged.triggeredFlags.map((f) => ({
      n: f.n,
      name: f.name,
      weight: f.weight,
      severity: f.severity,
      evidenceTier: f.evidenceTier,
      weightedPoints: f.weightedPoints,
      confidence: f.confidence,
      pages: f.pages,
      // Join aggregated evidence into a readable string + keep structured array.
      evidence: f.evidence.map((e) => (e.page ? `(p.${e.page}) ` : '') + e.quote).filter(Boolean).join('\n'),
      evidenceItems: f.evidence,
      explanation: f.evidence[0]?.reason || '',
    })),
    findings: merged.findings,
    extractedClaims: merged.claims,
    contradictions: [],
    verifyNext: report.recommendations.map((r) => ({ action: r, where: '' })),
    investorAdvice: report.investorAdvice,
    disclaimer: report.disclaimer,
    chunkCount: merged.chunkCount,
    pageCount: merged.pageCount,
    analyzedAt: merged.analyzedAt,
  }
}

// ════════════════════════════════════════════════════════════════
//  SYNCHRONOUS ENTRY POINT  (small docs / images — single request)
//
//  For LARGE docs the async job pipeline (index.tsx) is used instead; this
//  path is kept for small submissions and images where one request is safe.
// ════════════════════════════════════════════════════════════════

export async function analyzeSubmission(env: Bindings, input: AnalyzeInput) {
  if (!hasProvider(env)) {
    throw new Error('SERVICE_AUTH: Analysis service is not configured. Set KIMI_API_KEY (primary) or OPENAI_API_KEY (fallback).')
  }
  const provider = selectProvider(env)
  const ctx = buildCtx(input)
  const images = (input.images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image')).slice(0, 10)
  const rawMaterial = (input.material || '').trim()

  // OCR: if only images (or images + little text), transcribe them into text
  // with page numbers preserved, then chunk+evaluate the combined text.
  let material = rawMaterial
  if (images.length > 0 && rawMaterial.length < 200) {
    try {
      const ocr = selectOcrProvider(env)
      const pages = await ocr.extract(images)
      const ocrText = pages.map((p) => `[[PAGE ${p.page}]]\n${p.text}`).join('\n\n')
      material = (rawMaterial + '\n\n' + ocrText).trim()
    } catch {
      // OCR is best-effort; fall through to vision evaluation of the images.
    }
  }

  const chunks = buildChunks(env, material)
  const evals: ChunkEvaluation[] = []

  if (chunks.length === 0) {
    // Pure-image submission (no extractable text): evaluate the image directly.
    const imgChunk: Chunk = { chunk_id: 0, text: '(image submission)', startPage: 1, endPage: 1, headings: [] }
    evals.push(await evaluateChunk(provider, imgChunk, ctx, images))
  } else {
    for (let i = 0; i < chunks.length; i++) {
      const chunkImages = i === 0 ? images : []
      evals.push(await evaluateChunk(provider, chunks[i], ctx, chunkImages))
    }
  }

  const merged = mergeEvaluations(evals)
  if (!merged.isInvestmentRelated) {
    throw new Error('NOT_RELEVANT:' + merged.notRelevantReason)
  }
  const report = await generateReport(provider, merged)
  return assembleResult(merged, report)
}

// ════════════════════════════════════════════════════════════════
//  BACKWARD-COMPAT: browser-driven chunk endpoints
//  (index.tsx /api/split, /api/analyze-chunk, /api/merge)
// ════════════════════════════════════════════════════════════════

export interface ChunkRequestInput {
  chunk: string
  chunkIndex: number
  totalChunks: number
  startPage?: number
  endPage?: number
  headings?: string[]
  sponsorName?: string
  assetType?: string
  claimedReturn?: string
  amountAsked?: string
  sourceType?: string
  images?: string[]
}

/** Analyze ONE chunk (browser-driven). Returns the raw ChunkEvaluation JSON. */
export async function analyzeChunkRequest(env: Bindings, input: ChunkRequestInput): Promise<ChunkEvaluation> {
  if (!hasProvider(env)) {
    throw new Error('SERVICE_AUTH: Analysis service is not configured.')
  }
  const provider = selectProvider(env)
  const ctx = buildCtx(input)
  const images = (input.images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image')).slice(0, 10)
  const chunk: Chunk = {
    chunk_id: Number(input.chunkIndex) || 0,
    text: String(input.chunk || ''),
    startPage: Number(input.startPage) || 0,
    endPage: Number(input.endPage) || 0,
    headings: Array.isArray(input.headings) ? input.headings : [],
  }
  return evaluateChunk(provider, chunk, ctx, images)
}

/** Merge per-chunk ChunkEvaluations into the final scored + reported result. */
export async function mergeChunkAnalysis(env: Bindings, results: any[]): Promise<any> {
  const clean = (Array.isArray(results) ? results : []).filter((r) => r && typeof r === 'object')
  if (clean.length === 0) throw new Error('SERVICE_MESSAGE:No analysis results were provided to merge.')
  const merged = mergeEvaluations(clean as ChunkEvaluation[])
  if (!merged.isInvestmentRelated) {
    throw new Error('NOT_RELEVANT:' + merged.notRelevantReason)
  }
  const provider = hasProvider(env) ? selectProvider(env) : null
  const report = provider ? await generateReport(provider, merged) : { ...FALLBACK_REPORT }
  return assembleResult(merged, report)
}

// Pure deterministic merge (no report) — used by the async pipeline.
export function mergeOnly(results: any[]): MergedDataset {
  return mergeEvaluations((results as ChunkEvaluation[]) || [])
}

export type { MergedDataset, MergedFinding, ChunkEvaluation, Chunk }
