// ════════════════════════════════════════════════════════════════
//  InvestSafe Pro™ — Forensic Analysis Orchestrator (server-side)
//
//  v6.0 — PRODUCTION ARCHITECTURE (permanent, not a workaround)
//
//  PIPELINE (never truncates, never scores in the LLM):
//    1. chunking.ts   → semantic, page-aware chunks (headings/clauses/tables).
//    2. providers.ts  → DeepSeek (primary text reasoning) or OpenAI (fallback);
//                       OpenAI vision handles OCR (DeepSeek is text-only).
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
  selectReasoningProvider,
  selectOcrProvider,
  hasProvider,
  hasVisionProvider,
  type AIProvider,
  type ProviderEnv,
} from './providers'
import { maxPageMarker, ocrPagesToMarkedText, mergeTextSources } from './textmerge'
import {
  FLAG_FRAMEWORK,
  RULE_BY_N,
  TIER_RANK,
  CHUNK_EVAL_PROMPT,
  REPORT_PROMPT,
  type ChunkEvaluation,
  type RuleFinding,
} from './rules'
import {
  chunkDocument,
  type Chunk,
  type ChunkOptions,
} from './chunking'
import { mergeEvaluations, type MergedDataset, type MergedFinding } from './merge'

export { FLAG_FRAMEWORK }

// Re-export so index.tsx (and the async layer) can share one Bindings type.
export type Bindings = ProviderEnv & {
  // ── Chunk sizing (TPM-driven; future-proof) ──
  OPENAI_TPM?: string
  MAX_CHUNK_CHARS?: string
  MIN_CHUNK_CHARS?: string
  SKIP_BOILERPLATE?: string
  /** "true" enables bounded self-consistency voting on borderline chunks. */
  SELF_CONSISTENCY?: string

  // ── Optional accounts (Feature B) ──
  SESSION_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_REDIRECT_URI?: string
  APP_BASE_URL?: string

  // ── Async job storage bindings (optional; present after hosted deploy) ──
  DB?: any     // D1Database — jobs / chunks / findings
  R2?: any     // R2Bucket — raw uploads + extracted text
  KV?: any     // KVNamespace — premium requests (existing)
}

// ════════════════════════════════════════════════════════════════
//  MATERIAL PREPARATION  (OCR via OpenAI → merge/de-dupe → clean TEXT)
//
//  DeepSeek (reasoning) only ever receives TEXT. Any attached images or
//  scanned pages are OCR'd by OpenAI vision here, then merged and
//  de-duplicated with the pasted/PDF/DOCX text into one authoritative string.
// ════════════════════════════════════════════════════════════════

const MAX_OCR_IMAGES = 120

/** OCR image data-URLs into marked page text (OpenAI vision). Best-effort → ''. */
export async function ocrImagesToText(env: Bindings, images: string[], pastedText = ''): Promise<string> {
  const imgs = (images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image')).slice(0, MAX_OCR_IMAGES)
  if (imgs.length === 0) return ''
  const ocr = selectOcrProvider(env)
  if (!ocr) return ''
  try {
    const startPage = maxPageMarker(pastedText) + 1
    const pages = await ocr.extract(imgs, startPage)
    return ocrPagesToMarkedText(pages)
  } catch {
    return ''
  }
}

/**
 * Produce the single clean TEXT to analyze from raw pasted text + images.
 * - No images → the trimmed pasted text.
 * - Images → OCR them (OpenAI) and merge/de-dupe with the pasted text.
 *   • merged non-empty → return it.
 *   • merged empty AND no OCR provider → throw SERVICE_CONFIG.
 *   • merged empty WITH an OCR provider → throw IMAGES_NO_TEXT.
 */
export async function prepareMaterial(env: Bindings, rawMaterial: string, images?: string[]): Promise<string> {
  const pasted = String(rawMaterial || '').trim()
  const imgs = (images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image')).slice(0, MAX_OCR_IMAGES)
  if (imgs.length === 0) return pasted

  const ocrText = await ocrImagesToText(env, imgs, pasted)
  const { text } = mergeTextSources(pasted, ocrText)
  if (text.trim().length > 0) return text.trim()

  if (!hasVisionProvider(env)) {
    throw new Error('SERVICE_CONFIG: image-only submission but no OCR provider configured (set OPENAI_API_KEY)')
  }
  throw new Error('IMAGES_NO_TEXT: no readable text extracted from image(s)')
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
 * Resolve chunk sizing from env (with safe defaults). maxChunkChars is the
 * ceiling on how much text goes into a SINGLE LLM request; it is kept well
 * below the model's context window so a chunk's structured JSON output never
 * hits the output-token cap (which would truncate findings).
 */
function resolveChunkOptions(env: Bindings): ChunkOptions {
  const toInt = (v: any, d: number) => {
    const n = parseInt(String(v ?? ''), 10)
    return Number.isFinite(n) && n > 0 ? n : d
  }
  // 60k chars ≈ ~15k input tokens per chunk — comfortably inside DeepSeek's
  // ~1M-token context and gpt-4o's 128k fallback, while keeping strong per-rule
  // recall. Larger chunks mean fewer LLM calls, so the ~1.8k-token system prompt
  // is re-sent fewer times (a direct token saving on long documents).
  const maxChunkChars = clamp(toInt(env.MAX_CHUNK_CHARS, 60000), 8000, 120000)
  const minChunkChars = clamp(toInt(env.MIN_CHUNK_CHARS, 4000), 500, maxChunkChars)
  const skipBoilerplate = String(env.SKIP_BOILERPLATE ?? 'true').toLowerCase() !== 'false'
  return { maxChunkChars, minChunkChars, maxChunks: 400, skipBoilerplate }
}

/**
 * Build the analysis chunks for a document.
 *   • Small doc (≤ maxChunkChars) → ONE request (cheapest, no overhead).
 *   • Large doc → semantic, page-aware chunks so the FULL text is analyzed —
 *     nothing is truncated, and no single request overflows the model's
 *     context or output-token budget.
 * Any attached/scanned images were already OCR'd into `material` upstream, so
 * their text is chunked here too and never dropped.
 */
export function buildChunks(env: Bindings, material: string): Chunk[] {
  const text = String(material || '').trim()
  if (!text) return []
  const opts = resolveChunkOptions(env)
  if (text.length <= opts.maxChunkChars) {
    // Keep [[PAGE n]] markers intact for single-pass so the model can cite pages.
    return [{ chunk_id: 0, text, startPage: 1, endPage: 1, headings: [] }]
  }
  return chunkDocument(text, opts)
}

export interface ChunkPlanInfo {
  needsChunking: boolean
  totalChunks: number
  maxChunkChars: number
}

/** Report the chunking plan for a document of the given length/text. */
export function getChunkPlan(env: Bindings, docLenOrText: number | string): ChunkPlanInfo {
  const len = typeof docLenOrText === 'number' ? docLenOrText : String(docLenOrText || '').length
  const opts = resolveChunkOptions(env)
  const needsChunking = len > opts.maxChunkChars
  return {
    needsChunking,
    totalChunks: needsChunking ? Math.max(2, Math.ceil(len / opts.maxChunkChars)) : 1,
    maxChunkChars: opts.maxChunkChars,
  }
}

/** Authoritative server-side split (semantic, page-aware; never truncates). */
export function splitDocument(env: Bindings, text: string): { chunks: Chunk[] } {
  return { chunks: buildChunks(env, text) }
}

// ════════════════════════════════════════════════════════════════
//  ONE-CHUNK RULE EVALUATION  (LLM = evidence only, no scoring)
// ════════════════════════════════════════════════════════════════

function safeParseJson(content: string, finishReason: string | null): any {
  let trimmed = String(content).trim()
  if (finishReason === 'length') {
    throw new Error('RESPONSE_TRUNCATED: The model response was cut off due to size limits. Reduce non-essential content and retry.')
  }
  // DeepSeek reasoning models may wrap output in <think>...</think> tags — strip them.
  trimmed = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // Strip markdown code fences (```json ... ```)
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

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
  // Deterministic pre-scoring canonicalization (pure function of the bytes):
  //   • Tier 1 is reserved for primary-source docs — clamp it otherwise.
  //   • Confidence is snapped to a 0.1 ladder so jitter can't flip the gate.
  const primary = PRIMARY_SOURCE_RE.test(chunk.text)
  // Ensure ALL 21 rules present.
  const rules: RuleFinding[] = FLAG_FRAMEWORK.map((def) => {
    const r = byId.get(def.n)
    const triggered = r?.triggered === true || String(r?.triggered).toLowerCase() === 'true'
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
      confidence: snapConfidence(r?.confidence),
      evidence_tier: canonicalTier(String(r?.evidence_tier || 'GAP'), primary) as any,
      evidence,
    }
  })

  // Deterministic detectors (relevance + legitimacy) computed from the chunk
  // text. merge.ts unions these across chunks — relevance and false-positive
  // suppression become a pure function of the document bytes.
  const det = {
    invFamilies: matchedFamilies(chunk.text, INVESTMENT_LEXICON),
    legitFamilies: matchedFamilies(chunk.text, LEGIT_DISCLOSURE_LEXICON),
    hasLtv: HAS_LTV_RE.test(chunk.text),
    hasLoss: HAS_LOSS_POS_RE.test(chunk.text) && !HAS_LOSS_NEG_RE.test(chunk.text),
  }

  return {
    chunk_id: chunk.chunk_id,
    page_range: [chunk.startPage || 0, chunk.endPage || 0],
    det,
    // Accept boolean true, string "true", or 1 — DeepSeek sometimes returns strings.
    // If rules were triggered, it's investment-related regardless of what the model said.
    is_investment_related: raw?.is_investment_related === true
      || String(raw?.is_investment_related).toLowerCase() === 'true'
      || rulesIn.some((r: any) => r?.triggered === true || String(r?.triggered).toLowerCase() === 'true')
      || (raw?.is_investment_related == null && rulesIn.length > 0),
    not_relevant_reason: String(raw?.not_relevant_reason || ''),
    rules,
    claims: Array.isArray(raw?.claims) ? raw.claims : [],
  }
}

// ════════════════════════════════════════════════════════════════
//  DETERMINISTIC TEXT DETECTORS  (pure TS — no LLM)
//
//  Relevance and false-positive suppression must NOT depend on a
//  non-deterministic LLM boolean. These detectors read the chunk bytes and
//  produce stable signals that merge.ts consumes, so the same document always
//  yields the same relevance verdict and the same legitimacy suppression.
// ════════════════════════════════════════════════════════════════

// Investment-vocabulary families. Relevance requires ≥3 DISTINCT families across
// the whole document — broad enough to catch any real offering, specific enough
// that a recipe or news article (which may mention "$5" and "20%") stays under 3.
const INVESTMENT_LEXICON: RegExp[] = [
  /\b(invest(or|ment|ing)?|offering|securit(y|ies)|fund|equity|debenture|note|bond|prospectus)\b/i,
  /\b(irr|roi|yield|returns?|distribution|dividend|coupon|nav|aum|preferred return)\b/i,
  /\b(ppm|private placement|reg(ulation)?\s?d|form\s?d|accredited investor|subscription agreement|rule\s?506)\b/i,
  /\b(capital (call|contribution|commitment)|general partner|limited partner|\bgp\b|\blp\b|sponsor|promoter)\b/i,
  /\b(minimum investment|per (unit|share)|\bunits?\b|\bshares?\b|cap(italization)? table)\b/i,
  /\$\s?\d[\d,]{2,}/,
  /\b\d{1,2}(\.\d+)?\s?%/,
]

// Genuine-disclosure families. ≥3 DISTINCT families across the document marks a
// well-disclosed offering, which deterministically suppresses weak/soft flags.
const LEGIT_DISCLOSURE_LEXICON: RegExp[] = [
  /past performance\b[^.]{0,40}\b(not|no)\b[^.]{0,20}(indicativ|guarante)/i,
  /\brisk factors?\b/i,
  /\byou (may|could|can|might) lose\b[^.]{0,30}(principal|investment|money|capital)/i,
  /\b(speculative|illiquid)\b/i,
  /\bno (assurance|guarantee)\b/i,
  /\bcik\s*#?\s*\d{6,}\b|\bsec file (no|number)\b|\bform\s?d\b|\brule\s?506\s*\(\s*[bc]\s*\)/i,
  /\bcrd\s*#?\s*\d{4,}\b|\biard\s*#?\s*\d{4,}\b/i,
  /\baudited\b[^.]{0,20}\bstatements?\b|\bindependent (registered )?(public )?(auditor|accounting)/i,
  /\b(qualified custodian|custodian|transfer agent|escrow agent)\b/i,
  /\bloan[- ]to[- ]value\b|\bltv\b[^.]{0,15}\d{1,3}\s*%|\bpurchase price\b|\bcap rate\b/i,
]

// Rule 15 (no LTV/price disclosed) is nullified when ANY of these appear.
const HAS_LTV_RE = /\bloan[- ]to[- ]value\b|\bltv\b|\bpurchase price\b|\bcap rate\b|\bacquisition price\b/i
// Rule 16 (no loss/failed-deal disclosure) is nullified by GENUINE loss/risk
// disclosure — but NOT by a scam's negated whitewash ("zero chance of loss").
const HAS_LOSS_POS_RE = /\brisk factors?\b|\b(may|could|might) lose\b|\bloss of (principal|capital|investment)\b|\brisk of loss\b|\bno assurance\b|\bloss(es)?\b|\bdefault(ed|s)?\b|\bimpair(ment|ed)?\b|\bwrite[- ]?down\b|\bunderperform/i
const HAS_LOSS_NEG_RE = /\b(no|zero|without|never|cannot|can'?t|impossible)\b[^.]{0,15}\bloss(es)?\b|\bno (chance|risk) of loss\b|\bloss[- ]free\b|\bcannot lose\b/i

// Tier 1 is reserved for primary-source documents. If none of these markers are
// present, an LLM "Tier 1" is canonicalized down to Tier 2 (marketing copy).
const PRIMARY_SOURCE_RE = /\b(form\s?d|private placement memorandum|\bppm\b|finra|brokercheck|audited (financial )?statements?|form\s?adv|10-?k|prospectus)\b/i

// Rule 2 projection guard: a high number labelled "target/projected/..." is not a
// promise. It is injected at a WEAK tier so it cannot arm the strong-flag logic.
const PROJECTION_RE = /\b(target(ed|ing)?|projected|illustrative|pro[- ]?forma|estimated|expected|up to|potential|anticipated)\b/i
const FIXED_RE = /\b(fixed|guaranteed|guarantee|coupon|locked[- ]in)\b/i

/** Distinct family indices from a lexicon that match the text. */
function matchedFamilies(text: string, lexicon: RegExp[]): number[] {
  const out: number[] = []
  for (let i = 0; i < lexicon.length; i++) if (lexicon[i].test(text)) out.push(i)
  return out
}

/** Snap a raw confidence to a fixed 0.1 ladder (round-half-up) so jittery
 * DeepSeek floats like 0.44 vs 0.46 can't flip the merge trigger gate. */
function snapConfidence(c: any): number {
  return Math.round(clamp(Number(c) || 0, 0, 1) * 10) / 10
}

/** Clamp an LLM "Tier 1" to "Tier 2" unless a primary-source marker is present. */
function canonicalTier(tier: string, primary: boolean): string {
  const t = String(tier || 'GAP')
  if (/tier\s*1/i.test(t) && !primary) return 'Tier 2'
  return t
}

// ── Deterministic pattern-matching backstop ──────────────────────
// These patterns catch dispositive fraud signals that DeepSeek inconsistently
// detects. They only ADD or UPGRADE rules — they never remove LLM findings.
// This makes scoring deterministic for the signals that matter most.

interface PatternRule {
  rule_id: number
  patterns: RegExp[]
  tier: string
  confidence: number
  reason: string
}

const BACKSTOP_RULES: PatternRule[] = [
  {
    rule_id: 6,
    patterns: [
      /\bguaranteed?\b.*\b(return|yield|income|profit)/i,
      /\b(return|yield|income)\b.*\bguaranteed?\b/i,
      /\brisk[- ]?free\b/i,
      /\bminimal\s+risk\b/i,
      /\bcapital\s+safeguard/i,
      /\b100\s*%\s*(payback|repayment|principal|bond\s*payback)/i,
      /\bsecure[,\s]+predictable\s+returns?\b/i,
      /\bfixed\b.*\b(return|yield|coupon)\b.*\b(1[2-9]|[2-9]\d)\s*%/i,
    ],
    tier: 'Tier 2',
    confidence: 0.92,
    reason: 'Deterministic pattern match: guaranteed/risk-free language detected in promoter material.',
  },
  {
    rule_id: 2,
    patterns: [
      /\b(1[7-9]|[2-9]\d)\s*%\s*(annual|yearly|fixed|irr|return|yield)\b/i,
      /\b(annual|yearly|fixed|irr|return|yield)\s*(of\s*)?(1[7-9]|[2-9]\d)\s*%/i,
      /\b16\s*%\s*(annual|yearly|fixed)\b/i,
      /\b(annual|yearly|fixed)\s*(of\s*)?16\s*%/i,
    ],
    tier: 'Tier 2',
    confidence: 0.90,
    reason: 'Deterministic pattern match: return rate in Buffett-Shame Zone (≥16% fixed).',
  },
  {
    rule_id: 10,
    patterns: [
      /utm_source\s*=\s*google_ads/i,
      /gad_campaignid\s*=\s*\d{5,}/i,
      /utm_source\s*=\s*facebook/i,
      /fbclid\s*=/i,
    ],
    tier: 'Tier 2',
    confidence: 0.95,
    reason: 'Deterministic pattern match: mass advertising campaign parameters found in source URL.',
  },
  {
    rule_id: 5,
    patterns: [
      /\bfdic\s+(insured|guaranteed|protected|backed)\b/i,
      /\bsec\s+(qualified|approved|endorsed|registered)\b(?!.*\bnot\b)/i,
      /\bsec\s+(has\s+)?approved\b/i,
    ],
    tier: 'Tier 2',
    confidence: 0.95,
    reason: 'Deterministic pattern match: false FDIC/SEC claim.',
  },
]

/**
 * Resolve the tier a backstop injection should use for THIS chunk. Rule 2 is
 * demoted to a weak tier when the high number is only a PROJECTION
 * ("target/projected 20% IRR") rather than a FIXED/guaranteed coupon — so a
 * legitimate high-yield fund is not force-flagged as a strong signal.
 */
function backstopTier(bp: PatternRule, textLower: string): string {
  if (bp.rule_id === 2 && PROJECTION_RE.test(textLower) && !FIXED_RE.test(textLower)) {
    return 'Tier 3'
  }
  return bp.tier
}

function injectIfMissing(rules: any[], textLower: string, chunk: Chunk): void {
  const rankOf = (t: string) => ({ 'Tier 1': 4, 'Tier 2': 3, 'Tier 3': 2, 'Tier 4': 1 }[t] || 0)
  for (const bp of BACKSTOP_RULES) {
    const matched = bp.patterns.some(p => p.test(textLower))
    if (!matched) continue

    const tier = backstopTier(bp, textLower)
    const existing = rules.find((r: any) => Number(r?.rule_id) === bp.rule_id)

    if (!existing || !existing.triggered) {
      // Inject the rule
      const injected = {
        rule_id: bp.rule_id,
        triggered: true,
        confidence: bp.confidence,
        evidence_tier: tier,
        evidence: [{ page: chunk.startPage || 0, section: '', quote: '[pattern-matched]', reason: bp.reason }],
      }
      if (existing) Object.assign(existing, injected)
      else rules.push(injected)
      console.log(`[backstop] injected rule #${bp.rule_id} at ${tier}`)
    } else if (rankOf(tier) > rankOf(existing.evidence_tier)) {
      // Upgrade tier
      console.log(`[backstop] upgraded rule #${bp.rule_id} from ${existing.evidence_tier} to ${tier}`)
      existing.evidence_tier = tier
      existing.confidence = Math.max(existing.confidence, bp.confidence)
    }
  }
}

/**
 * Evaluate ONE chunk ONCE at a given decoding seed. Runs the deterministic
 * backstop and returns a normalized ChunkEvaluation.
 */
async function evaluateChunkOnce(
  provider: AIProvider,
  chunk: Chunk,
  ctx: string[],
  seed: number
): Promise<ChunkEvaluation> {
  const pageNote = chunk.startPage
    ? `This chunk spans pages ${chunk.startPage}–${chunk.endPage}. The text below preserves [[PAGE n]] markers; cite the page each quote appears on.`
    : 'Page numbers are not available; use page 0 in evidence.'

  // TEXT-ONLY: any attached images/scanned pages were already OCR'd into this
  // text upstream (prepareMaterial). The reasoning model never receives images.
  const userContent =
    (ctx.length ? `INVESTOR-PROVIDED CONTEXT:\n${ctx.join('\n')}\n\n` : '') +
    (chunk.headings.length ? `SECTION(S) IN THIS CHUNK: ${chunk.headings.join(' | ')}\n\n` : '') +
    `CHUNK ID: ${chunk.chunk_id}\n${pageNote}\n\n` +
    `NOTE: Any images or scanned pages the investor attached have already been ` +
    `transcribed (OCR) into the text below; evaluate the text as-is.\n\n` +
    `MATERIAL TO EVALUATE:\n"""\n${chunk.text}\n"""\n\n` +
    `Consider all 21 rules against this chunk, but OUTPUT ONLY the rules that trigger. Return the JSON object only.`

  const res = await provider.chatJson({
    role: 'reason',
    systemPrompt: CHUNK_EVAL_PROMPT(),
    userContent,
    seed,
  })
  const raw = safeParseJson(res.content, res.finishReason)

  // Deterministic backstop: pattern-match the chunk text for dispositive signals
  // that DeepSeek inconsistently catches. If the text matches, inject/upgrade
  // the rule so scoring never depends on LLM non-determinism. Because this is a
  // pure regex over the SAME text, it produces identical injections in every
  // sample, so majority-voting can never out-vote a backstop rule.
  const rulesArr: any[] = Array.isArray(raw?.rules) ? raw.rules : []
  const textLower = chunk.text.toLowerCase()
  injectIfMissing(rulesArr, textLower, chunk)
  raw.rules = rulesArr
  if (raw?.is_investment_related !== true && rulesArr.some((r: any) => r?.triggered)) {
    raw.is_investment_related = true
  }
  return normalizeChunkEval(raw, chunk)
}

// ── Bounded self-consistency (opt-in via env.SELF_CONSISTENCY="true") ──
// The deterministic detectors + backstop + calibration already make relevance,
// legitimacy, tier, confidence, and scoring pure functions of the bytes. The
// only residual variance is WHICH rules DeepSeek emits on a borderline chunk.
// When enabled, a chunk whose first pass has a jittery (non-backstop) trigger is
// re-sampled at two more seeds and majority-voted. Clean chunks and
// backstop-only chunks stay at ONE call, so cost is bounded to where it matters.
const SC_SEEDS = [42, 7, 99]
const RANK_TO_TIER: Record<number, string> = { 4: 'Tier 1', 3: 'Tier 2', 2: 'Tier 3', 1: 'Tier 4', 0: 'GAP' }

/** A rule injected by the deterministic backstop (its quote is a sentinel). */
function isInjectedRule(r: RuleFinding): boolean {
  return (r.evidence || []).some((e) => e?.quote === '[pattern-matched]')
}

/** A chunk is "borderline" if it has a NON-backstop triggered rule sitting on a
 *  scoring boundary (Tier 2/3 toggles the strong-flag gate; low confidence
 *  toggles the confidence gate; a near-minimum quote toggles the evidence gate). */
function isBorderline(ev: ChunkEvaluation): boolean {
  const trig = ev.rules.filter((r) => r.triggered && !isInjectedRule(r))
  for (const r of trig) {
    if (r.evidence_tier === 'Tier 2' || r.evidence_tier === 'Tier 3') return true
    if (r.confidence <= 0.5) return true
    const bestQuote = (r.evidence || []).reduce((m, e) => Math.max(m, (e?.quote || '').length), 0)
    if (bestQuote > 0 && bestQuote < 20) return true
  }
  return false
}

/** Deterministic majority vote across N samples of the same chunk. A rule
 *  survives iff ≥⌈N/2⌉ samples triggered it; its tier/confidence are the median
 *  of the triggering samples; evidence is the union. */
function voteChunkEvals(samples: ChunkEvaluation[], chunk: Chunk): ChunkEvaluation {
  const need = Math.ceil(samples.length / 2)
  const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]
  const voted: RuleFinding[] = []
  for (const def of FLAG_FRAMEWORK) {
    const hits = samples
      .map((s) => s.rules.find((r) => r.rule_id === def.n))
      .filter((r): r is RuleFinding => !!r && r.triggered)
    if (hits.length < need) continue
    const medRank = median(hits.map((h) => TIER_RANK[h.evidence_tier] ?? 0))
    const evidence = hits.flatMap((h) => h.evidence || []).slice(0, 8)
    voted.push({
      rule_id: def.n,
      triggered: true,
      confidence: median(hits.map((h) => h.confidence)),
      evidence_tier: (RANK_TO_TIER[medRank] || 'Tier 3') as any,
      evidence,
    })
  }
  const base = samples[0]
  console.log(`[selfConsistency] chunk=${chunk.chunk_id} samples=${samples.length} voted=[${voted.map((v) => v.rule_id).join(',')}]`)
  return {
    chunk_id: chunk.chunk_id,
    page_range: base.page_range,
    is_investment_related: samples.some((s) => s.is_investment_related),
    not_relevant_reason: base.not_relevant_reason,
    rules: voted,
    claims: base.claims,
    det: base.det, // deterministic — identical across samples
  }
}

/**
 * Evaluate ONE chunk against the 21 rules. One LLM call by default; when
 * `voteOnBorderline` is set and the first pass is borderline, draw two more
 * samples at different seeds and majority-vote for run-to-run stability.
 */
export async function evaluateChunk(
  provider: AIProvider,
  chunk: Chunk,
  ctx: string[],
  voteOnBorderline = false
): Promise<ChunkEvaluation> {
  const first = await evaluateChunkOnce(provider, chunk, ctx, SC_SEEDS[0])
  if (!voteOnBorderline || !isBorderline(first)) return first

  const samples: ChunkEvaluation[] = [first]
  for (let i = 1; i < SC_SEEDS.length; i++) {
    try {
      samples.push(await evaluateChunkOnce(provider, chunk, ctx, SC_SEEDS[i]))
    } catch (err: any) {
      // One failed re-sample never fails the chunk — vote on what we have.
      console.warn(`[selfConsistency] resample seed=${SC_SEEDS[i]} failed: ${String(err?.message || '').slice(0, 120)}`)
    }
  }
  return samples.length >= 2 ? voteChunkEvals(samples, chunk) : first
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
      // No maxTokens override → the reason role gets its larger default budget.
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

// ── Content-hash idempotency cache (optional; needs env.KV) ──
// Guarantees byte-identical output on re-upload of the SAME material, and cuts
// cost to zero on repeats. PROMPT_VERSION MUST be bumped on any rules.ts prompt
// or merge.ts scoring change so a stale cache never serves an old score.
const PROMPT_VERSION = 'v6.1'

/** 64-bit FNV-1a (two streams) → collision-resistant hex cache key. */
export function stableHash(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0xc9dc5118
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x01000193) + (c << 1)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

export async function analyzeSubmission(env: Bindings, input: AnalyzeInput) {
  if (!hasProvider(env)) {
    throw new Error('SERVICE_AUTH: Analysis service is not configured. Set DEEPSEEK_API_KEY (primary) or OPENAI_API_KEY (fallback).')
  }
  const provider = selectReasoningProvider(env)
  const ctx = buildCtx(input)
  const images = (input.images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image')).slice(0, MAX_OCR_IMAGES)
  const rawMaterial = (input.material || '').trim()

  // OCR images (OpenAI) + merge/de-dupe with pasted text → one clean TEXT.
  // DeepSeek only ever receives text.
  const material = await prepareMaterial(env, rawMaterial, images)

  // Idempotency cache: identical material + context + prompt version → identical
  // result, served instantly. Guarded so the no-KV path is unaffected.
  const cacheKey = 'analysis:' + stableHash(PROMPT_VERSION + '|' + material + '|' + ctx.join('|'))
  if (env.KV) {
    try {
      const hit = await env.KV.get(cacheKey)
      if (hit) return JSON.parse(hit)
    } catch { /* cache miss / unavailable → recompute */ }
  }

  const vote = String(env.SELF_CONSISTENCY || '').toLowerCase() === 'true'
  const chunks = buildChunks(env, material)
  const evals: ChunkEvaluation[] = []
  for (let i = 0; i < chunks.length; i++) {
    evals.push(await evaluateChunk(provider, chunks[i], ctx, vote))
  }

  const merged = mergeEvaluations(evals)
  if (!merged.isInvestmentRelated) {
    throw new Error('NOT_RELEVANT:' + merged.notRelevantReason)
  }
  const report = await generateReport(provider, merged)
  const out = assembleResult(merged, report)
  if (env.KV) {
    try {
      await env.KV.put(cacheKey, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 30 })
    } catch { /* cache write best-effort */ }
  }
  return out
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
  const provider = selectReasoningProvider(env)
  const ctx = buildCtx(input)
  // If this browser-driven chunk carries images (no-D1 fallback path), OCR them
  // (OpenAI) and merge into the chunk text so the reasoning model only sees text.
  const images = (input.images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image')).slice(0, MAX_OCR_IMAGES)
  let chunkText = String(input.chunk || '')
  if (images.length > 0) {
    chunkText = await prepareMaterial(env, chunkText, images)
  }
  const chunk: Chunk = {
    chunk_id: Number(input.chunkIndex) || 0,
    text: chunkText,
    startPage: Number(input.startPage) || 0,
    endPage: Number(input.endPage) || 0,
    headings: Array.isArray(input.headings) ? input.headings : [],
  }
  const vote = String(env.SELF_CONSISTENCY || '').toLowerCase() === 'true'
  return evaluateChunk(provider, chunk, ctx, vote)
}

/** Merge per-chunk ChunkEvaluations into the final scored + reported result. */
export async function mergeChunkAnalysis(env: Bindings, results: any[]): Promise<any> {
  const clean = (Array.isArray(results) ? results : []).filter((r) => r && typeof r === 'object')
  if (clean.length === 0) throw new Error('SERVICE_MESSAGE:No analysis results were provided to merge.')
  const merged = mergeEvaluations(clean as ChunkEvaluation[])
  if (!merged.isInvestmentRelated) {
    throw new Error('NOT_RELEVANT:' + merged.notRelevantReason)
  }
  const provider = hasProvider(env) ? selectReasoningProvider(env) : null
  const report = provider ? await generateReport(provider, merged) : { ...FALLBACK_REPORT }
  return assembleResult(merged, report)
}

// Pure deterministic merge (no report) — used by the async pipeline.
export function mergeOnly(results: any[]): MergedDataset {
  return mergeEvaluations((results as ChunkEvaluation[]) || [])
}

export type { MergedDataset, MergedFinding, ChunkEvaluation, Chunk }
