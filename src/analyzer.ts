// ════════════════════════════════════════════════════════════════
//  InvestSafe Pro™ — Forensic Analysis Engine (server-side)
//  Uses our managed OpenAI key. No BYOK. Built on the documented
//  Barry Minkow investigative methodology (21-flag framework).
//
//  v3.0 — OpenAI-only. Model-by-length + sequential chunking with carryover.
//  ──
//  MODEL SELECTION (single call, one model):
//    • any image attached      → VISION model (image + text analyzed together in ONE prompt)
//    • text-only, short doc     → TEXT model  (fast, cheap)
//    • text-only, long doc      → LARGE model (higher capability)
//  CHUNKING (large text-only docs):
//    • Document is split into sequential chunks sized as a PERCENT of the doc
//      (default 25% → ~4 chunks), clamped to [MIN, MAX] chars. Each chunk is
//      prepended with a CARRYOVER (default 10% of chunk size) of the prior text
//      so context flows across boundaries. Chunks run SEQUENTIALLY.
//    • Results merge by taking the HIGHEST evidence tier per flag across chunks —
//      deterministic AND monotonic (more text never lowers the score).
//
//  MODEL SELECTION — GPT only, by DOCUMENT TYPE:
//    • images (screenshot / deck page / ad photo) → VISION model  (gpt-5.4)
//    • short text (small pitch / email / ad)       → SHORT model  (gpt-4.1-mini)
//    • normal text (typical offering doc)          → TEXT model   (gpt-4.1)
//    • large text (long doc → chunked)             → LARGE model  (gpt-4.1)
//    All four are env-overridable; set OPENAI_MODEL to force one for everything.
// ════════════════════════════════════════════════════════════════

export type Bindings = {
  // ── OpenAI (only provider) ──
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  /** Optional: force ONE model for everything (overrides the per-type split). */
  OPENAI_MODEL?: string
  /** Optional: model for SHORT text submissions (default gpt-4.1-mini, fast/cheap). */
  OPENAI_SHORT_MODEL?: string
  /** Optional: model for NORMAL text submissions (default gpt-4.1). */
  OPENAI_TEXT_MODEL?: string
  /** Optional: model for submissions WITH images (default gpt-5.4, sharp vision). */
  OPENAI_VISION_MODEL?: string
  /** Optional: model for LARGE/chunked text documents (default gpt-4.1). */
  OPENAI_LARGE_MODEL?: string
  /** Optional: char threshold: at/below this a doc uses the SHORT model (default 6000). */
  OPENAI_SHORT_DOC_CHARS?: string
  /** Optional: reasoning effort for GPT-5/o models (none|low|medium|high). Default low for consistency. */
  OPENAI_REASONING_EFFORT?: string

  // ── Generalized, percentage-based chunking (all optional) ──
  /**
   * Your OpenAI key's tokens-per-minute (TPM) limit. The per-chunk size is
   * DERIVED from this automatically (≤50% of TPM as input), so raising your
   * key's tier just means setting a bigger number here — no code change.
   * Default 30000 (free/low tier). Set to your real TPM to future-proof.
   */
  OPENAI_TPM?: string
  /** Target chunk size as a PERCENT of the document (default 25 → ~4 chunks). */
  CHUNK_PERCENT?: string
  /** Carryover context as a PERCENT of chunk size (default 10). */
  CARRYOVER_PERCENT?: string
  /** Hard max chars per chunk — MANUAL OVERRIDE of the TPM-derived cap. */
  MAX_CHUNK_CHARS?: string
  /** Min chars per chunk, so tiny docs aren't over-split (default 20000). */
  MIN_CHUNK_CHARS?: string
  /** Legacy alias for MAX_CHUNK_CHARS. */
  OPENAI_MAX_MATERIAL_CHARS?: string
  /** Legacy alias for a fixed carryover char count (overrides CARRYOVER_PERCENT if set). */
  OPENAI_CHUNK_CONTEXT_CHARS?: string
}

// ── GPT model defaults (by document type) ──
const DEFAULT_OPENAI_SHORT_MODEL = 'gpt-4.1-mini'
const DEFAULT_OPENAI_TEXT_MODEL = 'gpt-4.1'
const DEFAULT_OPENAI_VISION_MODEL = 'gpt-5.4'
const DEFAULT_OPENAI_LARGE_MODEL = 'gpt-4.1'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
// Text at/below this many chars is treated as a SHORT doc (cheap model).
const DEFAULT_SHORT_DOC_CHARS = 6000

// The 21-flag framework (weight = max points each flag can contribute)
export const FLAG_FRAMEWORK = [
  { n: 1,  name: 'Irrational Ratios — Expenses vs. Revenue Impossible', weight: 10 },
  { n: 2,  name: 'IRR in "Buffett-Shame Zone" (17–25%+)',
    weight: 10 },
  { n: 3,  name: 'Debt Load Mathematically Incompatible with Returns', weight: 10 },
  { n: 4,  name: 'Promoter FINRA-Barred / SEC-Sanctioned', weight: 10 },
  { n: 5,  name: 'False FDIC Insurance / "SEC Qualified" Claims', weight: 10 },
  { n: 6,  name: '"Guaranteed" / "Risk-Free" Language', weight: 9 },
  { n: 7,  name: 'Property Addresses Concealed', weight: 9 },
  { n: 8,  name: 'Nominee Structure — Concealing Barred Principal', weight: 9 },
  { n: 9,  name: 'Vertical Integration Into Internal Debt Fund', weight: 9 },
  { n: 10, name: 'Facebook / Instagram / TV / Radio Mass Advertising', weight: 8 },
  { n: 11, name: 'AUM Without Debt Disclosure', weight: 8 },
  { n: 12, name: 'Co-GP Double Counting', weight: 8 },
  { n: 13, name: '"Refer a Friend" Unlicensed Solicitation', weight: 8 },
  { n: 14, name: 'No State Licensing', weight: 8 },
  { n: 15, name: 'No Purchase Price / LTV Cap Disclosed', weight: 7 },
  { n: 16, name: 'No Failed Deal Disclosure', weight: 7 },
  { n: 17, name: 'Sudden Pivot to Unrelated Offerings (Oil/Car Wash)', weight: 7 },
  { n: 18, name: '"We Invest Our Own Money" — Unverified', weight: 5 },
  { n: 19, name: 'High-Pressure Sales Blitz — Constant Solicitation', weight: 8 },
  { n: 20, name: 'Perpetual Fundraising / Deal Churn — Acquisition Treadmill', weight: 7 },
  { n: 21, name: 'Asset Overpayment / Book Value Mismatch', weight: 9 },
]

const SYSTEM_PROMPT = `You are the Investment Integrity Engine™ (IIE), the forensic AI core of InvestSafe Pro™.
You analyze investment offerings, pitch decks, private placement memoranda (PPMs), advertisements, emails, and webinar transcripts to help ordinary investors detect fraud BEFORE they commit capital.

Your methodology is built on Barry Minkow's documented investigative framework and the patterns seen in real SEC enforcement cases (e.g. NRIA, and other Reg D fraud schemes). You are evidence-first and you NEVER fabricate facts about a specific named person or company. You analyze the LANGUAGE and STRUCTURE of what the promoter presents.

You score every submission against this 21-FLAG RED-FLAG FRAMEWORK (each flag's "weight" is the maximum points it may contribute to the risk score):

${FLAG_FRAMEWORK.map(f => `Flag ${f.n} (weight ${f.weight}): ${f.name}`).join('\n')}

SCORING RULES — use the OFFICIAL InvestSafe Pro explainable scoring formula EXACTLY (do not invent your own). To keep results CONSISTENT and REPEATABLE, severity is DETERMINED BY the evidence tier — you do NOT freely pick it:
- For each flag, decide if it is TRIGGERED by the submitted material.
- If triggered, assign an "evidenceTier" describing how strong the proof is, then the severity is FIXED by the tier:
        Tier 1 = primary-source / direct documentary proof (e.g. the PPM text itself, a Form D, a FINRA bar record, an audited statement).  → severity = 10
        Tier 2 = strong secondary evidence (e.g. the promoter's own ad / brochure / website language quoted verbatim).                     → severity = 8
        Tier 3 = weaker / indirect / circumstantial evidence.                                                                              → severity = 5
        Tier 4 = inference or pattern-match only (no concrete proof in the material).                                                       → severity = 3
        GAP = the flag is SUSPECTED but the required evidence is simply MISSING from what was provided (e.g. "no PPM disclosed").           → severity = 0
- MANDATORY: set "severity" to EXACTLY the fixed number above for the chosen tier. Do NOT use any other value. This makes scoring deterministic.
- GAP items → severity = 0 and weightedPoints = 0 (they are listed as "source gaps", they do NOT add to the score).
- Choose the tier by the strength of EVIDENCE actually present, not by how bad the flag feels. Be consistent: the same evidence must always get the same tier.
- CONSISTENCY RULES (critical — follow exactly so the same document always scores the same):
   • Only TRIGGER a flag when there is concrete support in the material. Do NOT trigger a flag on a hunch; if you are unsure whether a flag applies, do NOT include it.
   • Use the HIGHEST tier the evidence clearly supports — pick the single best-fitting tier; do not hedge between two tiers.
   • If a required disclosure is simply absent (not affirmatively wrong), classify it as GAP (severity 0), NOT as a triggered Tier 3/4 flag. This applies especially to "missing"-type flags such as Flag 7 (addresses concealed), Flag 11 (AUM without debt disclosure), Flag 15 (no purchase price/LTV), Flag 16 (no failed-deal disclosure): if the document simply does not mention the item, that is a GAP, not a scored flag.
   • A flag counts as TRIGGERED (Tier 1–4, severity > 0) ONLY when the material AFFIRMATIVELY contains problematic content (a bad claim, a contradiction, a prohibited practice) — never merely because something expected is absent.
   • Apply the same standard to every submission; identical wording must produce the identical set of flags, tiers, and therefore the identical score. Do not let minor wording differences change which flags trigger.
- weightedPoints = round( weight * severity / 10 ).
- riskScore = round( (sum of weightedPoints of ALL triggered flags) / (maximum possible points) * 100 ), where maximum possible points = sum of (weight * 1.0) over every flag actually triggered with a non-GAP tier... NO — use the OFFICIAL denominator: maximum = sum of the FULL WEIGHT of every triggered (non-GAP) flag (i.e. as if each triggered flag were severity 10). So:
        riskScore = round( totalWeightedPoints / totalTriggeredFullWeight * 100 ).
   If no non-GAP flags are triggered, riskScore = 0.
- riskLevel: 0–24 = "Low", 25–49 = "Medium", 50–74 = "High", 75–100 = "Critical".
- "keyDrivers": list the flag numbers that each contribute >= 15% of the maximum (i.e. the dominant score drivers). Use plain integers.
- Be fair to legitimate offerings: a well-disclosed, registered, conservatively-marketed investment with no triggered flags should score 0 (Low).

IMPORTANT ANALYSIS GUIDANCE:
- Treat extraordinary, "guaranteed", or "risk-free" returns as major flags.
- IRR/annual return claims of 17%+ that are presented as safe/consistent are a classic "Buffett-Shame Zone" flag.
- Mass-market advertising (Facebook, radio, TV) for a private securities offering is a strong flag.
- Missing disclosures (no PPM, no audited financials, no addresses, no LTV, no failed-deal history) are flags.
- "Refer a friend for a bonus" type solicitation is unlicensed-solicitation behavior.
- High-pressure / "closing soon" / "limited spots" urgency is a flag.
- Be fair: if the material is well-disclosed, conservative, and registered, return a LOW score with few/no flags. Do not invent fraud where there is none.

RELEVANCE GATE (do this FIRST, before scoring):
- First determine whether the submitted material (text AND/OR any attached image) is actually about an INVESTMENT, financial offering, fund, securities, business opportunity, money-making scheme, or a solicitation to invest/send money.
- A random photo (e.g. a couple, a landscape, a meme, a pet), a screenshot of unrelated content, an empty/blank image, or text that has nothing to do with investing is NOT investment-related.
- If the material is NOT investment-related, set "isInvestmentRelated": false and "notRelevantReason" to a short plain-English explanation of what you actually see (e.g. "This appears to be a personal photo of two people, not an investment offering."). In that case you may leave the scoring fields at their defaults (riskScore 0, empty arrays) — they will be ignored.
- Only if the material IS investment-related, set "isInvestmentRelated": true and perform the full 21-flag scoring below.

You must respond with ONLY a single valid JSON object (no markdown fences, no commentary) in EXACTLY this shape:
{
  "isInvestmentRelated": <true | false>,
  "notRelevantReason": "<if isInvestmentRelated is false: short plain-English description of what the submission actually appears to be; otherwise empty string>",
  "riskScore": <integer 0-100, computed with the official formula above>,
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "scoreBreakdown": {
    "totalWeightedPoints": <integer, sum of weightedPoints of triggered non-GAP flags>,
    "maxPossiblePoints": <integer, sum of full weight of triggered non-GAP flags>,
    "formula": "totalWeightedPoints ÷ maxPossiblePoints × 100",
    "keyDrivers": [<flag numbers contributing >= 15% of max>]
  },
  "verdict": "<one-sentence plain-English bottom line a non-expert investor understands>",
  "summary": "<2-4 sentence plain-English explanation of the overall finding>",
  "triggeredFlags": [
    {
      "n": <flag number 1-21>,
      "name": "<flag name>",
      "weight": <flag weight>,
      "severity": <0-10, 0 only for GAP items>,
      "evidenceTier": "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "GAP",
      "weightedPoints": <integer>,
      "evidence": "<short quote or paraphrase from the submitted text that triggers this flag, OR for GAP: what evidence is missing>",
      "explanation": "<plain-English why this matters to an investor>"
    }
  ],
  "extractedClaims": [
    { "type": "<e.g. IRR/Returns, AUM, Track Record, Guarantee, FDIC, Licensing>", "claim": "<what the promoter asserts>", "concern": "<why it should be verified>" }
  ],
  "contradictions": [
    { "claim": "<what they say>", "reality": "<what an investor should independently verify / typical reality>", "note": "<short note>" }
  ],
  "verifyNext": [
    { "action": "<concrete next step, e.g. 'Check the promoter on FINRA BrokerCheck'>", "where": "<source/URL or registry name>" }
  ],
  "investorAdvice": "<3-5 sentences of clear, calm, plain-English guidance on what to do next — written for someone with NO finance or legal background>",
  "disclaimer": "This is an educational due-diligence aid, not legal or financial advice. Always verify with primary sources and consult a licensed professional."
}`

export interface AnalyzeInput {
  material: string
  sponsorName?: string
  assetType?: string
  claimedReturn?: string
  amountAsked?: string
  sourceType?: string
  /** Optional images (data URLs) — e.g. screenshots of an ad / pitch deck pages. */
  images?: string[]
}

// ════════════════════════════════════════════════════════════════
//  CHUNKING CONFIGURATION
// ════════════════════════════════════════════════════════════════

// ── Percentage-based chunking defaults (generalized to any doc size) ──
const DEFAULT_CHUNK_PERCENT = 25   // aim for ~4 chunks (25% each) by default
const DEFAULT_MIN_CHUNK_CHARS = 20000  // don't over-split small docs
const DEFAULT_CARRYOVER_PERCENT = 10 // carryover = 10% of chunk size
const CHUNK_OVERLAP = 500          // tiny raw overlap; real continuity comes from carryover
const MAX_CHUNKS = 60              // safety ceiling on number of chunks

// ── TPM-driven sizing (future-proof) ──────────────────────────────
// The single biggest constraint on chunk size is the OpenAI key's
// tokens-per-minute (TPM) limit: ONE chunk request must fit inside it,
// with headroom for the system prompt + the model's response.
//   • Set OPENAI_TPM to your key's TPM (e.g. 30000, 200000, 2000000).
//   • Chunk size is derived from it automatically — raise TPM and chunks
//     get bigger / fewer with NO code change.
//   • MAX_CHUNK_CHARS, if set, is a hard manual override that still wins.
const DEFAULT_OPENAI_TPM = 30000        // conservative default (free/low tier)
const CHARS_PER_TOKEN = 4               // rough English heuristic
const TPM_INPUT_FRACTION = 0.5          // use ≤50% of TPM for the input chunk
                                        // (leaves room for prompt + response + retry)
const HARD_MAX_CHUNK_CHARS = 300000     // absolute ceiling regardless of TPM
                                        // (~75k tokens; keeps one call sane)
const DEFAULT_MIN_TPM_CHUNK = 8000      // never derive a chunk smaller than this

/** Derive the max chunk size (chars) a single request may use, from TPM. */
function tpmMaxChunkChars(env: Bindings): number {
  // Explicit char override wins (manual control / legacy).
  const explicit = Number(env.MAX_CHUNK_CHARS) || Number(env.OPENAI_MAX_MATERIAL_CHARS)
  if (explicit > 0) return clamp(explicit, DEFAULT_MIN_TPM_CHUNK, HARD_MAX_CHUNK_CHARS)

  const tpm = Number(env.OPENAI_TPM) || DEFAULT_OPENAI_TPM
  const inputTokens = tpm * TPM_INPUT_FRACTION
  const chars = Math.floor(inputTokens * CHARS_PER_TOKEN)
  return clamp(chars, DEFAULT_MIN_TPM_CHUNK, HARD_MAX_CHUNK_CHARS)
}

/**
 * Decide the effective chunk size (chars) and carryover (chars) for a document,
 * expressed as PERCENTAGES of the doc / chunk, then clamped to safe bounds.
 * This generalizes: a small doc stays one chunk; a huge doc splits into many.
 * The per-chunk ceiling is TPM-derived (see tpmMaxChunkChars) so it scales with
 * your OpenAI key automatically.
 */
function computeChunkPlan(env: Bindings, docLen: number) {
  const chunkPct = clamp(Number(env.CHUNK_PERCENT) || DEFAULT_CHUNK_PERCENT, 5, 100)
  const carryPct = clamp(Number(env.CARRYOVER_PERCENT) || DEFAULT_CARRYOVER_PERCENT, 0, 50)
  const maxChunk = tpmMaxChunkChars(env)
  const minChunk = Math.min(Number(env.MIN_CHUNK_CHARS) || DEFAULT_MIN_CHUNK_CHARS, maxChunk)

  // Target size = chunkPct% of the document, clamped between [minChunk, maxChunk].
  let chunkSize = Math.round((docLen * chunkPct) / 100)
  chunkSize = clamp(chunkSize, minChunk, maxChunk)

  // Carryover = carryPct% of the chunk size, but never larger than a fixed
  // legacy override if the operator set one.
  let carryover =
    Number(env.OPENAI_CHUNK_CONTEXT_CHARS) || Math.round((chunkSize * carryPct) / 100)
  carryover = clamp(carryover, 0, Math.floor(chunkSize * 0.5))

  return { chunkSize, carryover, maxChunk, minChunk, chunkPct, carryPct }
}

// Tier ranking for merge (higher number = higher tier)
const TIER_RANK: Record<string, number> = {
  'Tier 1': 4,
  'Tier 2': 3,
  'Tier 3': 2,
  'Tier 4': 1,
  GAP: 0,
}

/**
 * Split a long document into overlapping chunks.
 * Each chunk is at most CHUNK_SIZE chars, with CHUNK_OVERLAP chars
 * overlapping the previous chunk to preserve context at boundaries.
 */
function splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text]
  const chunks: string[] = []
  let i = 0
  while (i < text.length && chunks.length < MAX_CHUNKS) {
    const end = Math.min(i + chunkSize, text.length)
    // Try to break at a sentence boundary near the end
    let breakPoint = end
    if (end < text.length) {
      // Look for sentence ending in the last 500 chars of this chunk
      const searchStart = Math.max(i + chunkSize - 500, i + 100)
      const searchText = text.slice(searchStart, end + 100)
      const sentenceMatch = searchText.match(/[.!?]\s+/g)
      if (sentenceMatch) {
        // Find the last sentence boundary before end
        let pos = searchStart
        let lastBoundary = -1
        for (const m of sentenceMatch) {
          const idx = text.indexOf(m, pos)
          if (idx >= 0 && idx + m.length < end) {
            lastBoundary = idx + m.length
            pos = idx + m.length
          }
        }
        if (lastBoundary > i + 100) {
          breakPoint = lastBoundary
        }
      }
    }
    chunks.push(text.slice(i, breakPoint))
    // Advance to the break point, applying a SMALL raw overlap. Guarantee real
    // forward progress: never step back more than a fraction of the chunk, so a
    // large `overlap` relative to `chunkSize` can't stall the loop (which would
    // otherwise explode into MAX_CHUNKS tiny pieces). Cross-boundary continuity
    // is handled separately by the carryover context prepended to each chunk.
    const safeOverlap = Math.min(overlap, Math.floor(chunkSize * 0.1))
    const nextStart = Math.max(breakPoint - safeOverlap, i + Math.floor(chunkSize * 0.5))
    // If the remaining tail is only overlap-sized (already fully covered by the
    // last chunk), stop — avoids a redundant micro-chunk at the end.
    if (text.length - nextStart <= safeOverlap) break
    i = nextStart
  }
  return chunks
}

// ════════════════════════════════════════════════════════════════
//  LOW-LEVEL API CALL (OpenAI / OpenAI-compatible chat completions)
// ════════════════════════════════════════════════════════════════

interface ApiConfig {
  apiKey: string
  baseUrl: string
  model: string
  reasoningEffort?: string
}

async function callLlmApi(config: ApiConfig, systemPrompt: string, userContent: any, images: string[]) {
  const isReasoning = /^(gpt-5|o1|o3|o4)/i.test(config.model)
  const reqBody: any = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    seed: 42,
  }

  if (isReasoning) {
    reqBody.reasoning_effort = config.reasoningEffort || 'low'
    // Reasoning models need extra room for reasoning tokens + the JSON output.
    reqBody.max_completion_tokens = 16000
  } else {
    reqBody.max_tokens = 4000
  }

  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(reqBody),
  })

  // Retry once without temperature/seed if rejected
  if (!resp.ok && resp.status === 400) {
    const peek = await resp.clone().text().catch(() => '')
    const pl = peek.toLowerCase()
    if (pl.includes('temperature') || pl.includes('seed')) {
      const fallback = { ...reqBody }
      delete fallback.temperature
      delete fallback.seed
      const retry = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(fallback),
      })
      return retry
    }
  }

  return resp
}

function handleApiError(resp: Response, txt: string): never {
  const low = txt.toLowerCase()
  // Log the raw upstream error so operators can see WHY (rate limit vs. quota).
  console.error(`[LLM upstream error] status=${resp.status} body=${txt.slice(0, 400)}`)

  // Out of credits / billing cap → NOT retryable (retrying won't help).
  if (low.includes('insufficient_quota') || low.includes('exceeded your current quota') || low.includes('billing') || low.includes('insufficient balance')) {
    throw new Error('SERVICE_QUOTA: The analysis service is temporarily unavailable (API quota/billing limit reached).')
  }
  // Rate limit (TPM/RPM) → RETRYABLE. Distinct prefix so the client backs off.
  // Extract the "try again in 19.81s" hint (or Retry-After header) if present.
  if (resp.status === 429) {
    let retryAfter = Number(resp.headers.get('retry-after')) || 0
    const m = txt.match(/try again in ([\d.]+)\s*s/i)
    if (m) retryAfter = Math.ceil(parseFloat(m[1]))
    throw new Error(`SERVICE_RATELIMIT:${retryAfter || ''}`)
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('SERVICE_AUTH: The analysis service is misconfigured (invalid API key).')
  }
  throw new Error(`Analysis service error (${resp.status}). ${txt.slice(0, 200)}`)
}

// ════════════════════════════════════════════════════════════════
//  MODEL SELECTION (GPT-only) + SINGLE CALL
// ════════════════════════════════════════════════════════════════

/**
 * Pick the GPT model for a submission by DOCUMENT TYPE.
 *   images        → OPENAI_VISION_MODEL (gpt-5.4)
 *   short text    → OPENAI_SHORT_MODEL  (gpt-4.1-mini)
 *   large/chunked → OPENAI_LARGE_MODEL  (gpt-4.1)
 *   normal text   → OPENAI_TEXT_MODEL   (gpt-4.1)
 * OPENAI_MODEL, if set, forces one model for everything.
 */
function pickModel(env: Bindings, opts: { hasImages: boolean; docLen: number; isChunk: boolean }): string {
  if (env.OPENAI_MODEL) return env.OPENAI_MODEL
  if (opts.hasImages) return env.OPENAI_VISION_MODEL || DEFAULT_OPENAI_VISION_MODEL
  if (opts.isChunk) return env.OPENAI_LARGE_MODEL || DEFAULT_OPENAI_LARGE_MODEL
  const shortCap = Number(env.OPENAI_SHORT_DOC_CHARS) || DEFAULT_SHORT_DOC_CHARS
  if (opts.docLen <= shortCap) return env.OPENAI_SHORT_MODEL || DEFAULT_OPENAI_SHORT_MODEL
  return env.OPENAI_TEXT_MODEL || DEFAULT_OPENAI_TEXT_MODEL
}

function makeConfig(env: Bindings, model: string): ApiConfig {
  return {
    apiKey: env.OPENAI_API_KEY as string,
    baseUrl: (env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, ''),
    model,
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
  }
}

/** Make ONE model call and return the parsed JSON result. */
async function callParsed(
  config: ApiConfig,
  systemPrompt: string,
  userContent: any,
  images: string[]
): Promise<any> {
  const resp = await callLlmApi(config, systemPrompt, userContent, images)
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    handleApiError(resp, txt)
  }
  const data: any = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  const finish = data?.choices?.[0]?.finish_reason
  if (!content) throw new Error('Analysis service returned an empty response.')
  return parseResponse(content, finish)
}

function parseResponse(content: string, finishReason: string | null): any {
  const trimmed = String(content).trim()
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[') || /\{[\s\S]*\}/.test(trimmed)

  if (!looksLikeJson) {
    const lower = trimmed.toLowerCase()
    if (lower.includes('credit') && (lower.includes('deplet') || lower.includes('purchase') || lower.includes('pack'))) {
      throw new Error('SERVICE_QUOTA: The analysis service is temporarily unavailable (account credits depleted). Please try again later or contact support.')
    }
    throw new Error(`SERVICE_MESSAGE: ${trimmed.slice(0, 300)}`)
  }

  if (finishReason === 'length') {
    throw new Error('RESPONSE_TRUNCATED: The document is very large and the analysis was cut off. Try a shorter excerpt or the key pages.')
  }

  let parsed: any
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Could not parse the analysis result.')
    try {
      parsed = JSON.parse(m[0])
    } catch {
      throw new Error('Could not parse the analysis result.')
    }
  }

  return parsed
}

// ════════════════════════════════════════════════════════════════
//  SINGLE CHUNK ANALYSIS
// ════════════════════════════════════════════════════════════════

async function analyzeOneChunk(
  config: ApiConfig,
  ctx: string[],
  material: string,
  images: string[],
  chunkIndex: number,
  totalChunks: number,
  /** carryover tail of the PREVIOUS chunk(s), for cross-boundary context. */
  carryover: string = ''
): Promise<any> {
  const textPart =
    (ctx.length ? `INVESTOR-PROVIDED CONTEXT:\n${ctx.join('\n')}\n\n` : '') +
    (carryover.trim().length
      ? `CONTEXT FROM THE PRECEDING PART OF THE SAME DOCUMENT (for continuity only — ` +
        `do NOT re-flag evidence that lives entirely in this context; flag it only if it ` +
        `also appears in the NEW MATERIAL below):\n"""\n${carryover}\n"""\n\n`
      : '') +
    (material.trim().length
      ? `NEW MATERIAL (text) TO ANALYZE — PART ${chunkIndex + 1} of ${totalChunks}:\n"""\n${material}\n"""\n\n` +
        `This is chunk ${chunkIndex + 1} of ${totalChunks}. Analyze the NEW MATERIAL above ` +
        `(using the preceding context only to understand references that span the boundary). ` +
        `Flag any evidence you see. If a required disclosure is simply absent, note it as GAP. ` +
        `Return the JSON result for this chunk.\n\n`
      : '') +
    (images.length > 0
      ? `The investor also attached ${images.length} image(s). Read ALL text and visual claims in the image(s) and treat them as submitted material.\n\n`
      : '') +
    `Analyze using the 21-flag framework and return the JSON object only.`

  const hasImages = images.length > 0
  const userContent = hasImages
    ? [{ type: 'text', text: textPart }, ...images.map((url: string) => ({ type: 'image_url', image_url: { url } }))]
    : textPart

  return callParsed(config, SYSTEM_PROMPT, userContent, images)
}

// ════════════════════════════════════════════════════════════════
//  MERGE MULTIPLE CHUNK RESULTS
// ════════════════════════════════════════════════════════════════

/**
 * Merge analysis results from multiple chunks.
 * Strategy: for each flag, take the HIGHEST evidence tier found across all chunks.
 * This is MONOTONIC — more text can only increase or maintain the score, never lower it.
 */
function mergeChunkResults(results: any[]): any {
  if (results.length === 1) return results[0]

  // Collect all unique flags found across all chunks, keeping the highest tier
  const flagMap = new Map<number, any>()
  const allClaims: any[] = []
  const allContradictions: any[] = []
  const allVerify: any[] = []
  const allAdvice: string[] = []

  for (const r of results) {
    if (!r || typeof r !== 'object') continue

    const flags = Array.isArray(r.triggeredFlags) ? r.triggeredFlags : []
    for (const f of flags) {
      if (!f || !f.n) continue
      const n = Number(f.n)
      const existing = flagMap.get(n)
      const tier = normalizeTier(f.evidenceTier)
      const rank = TIER_RANK[tier] ?? 0

      if (!existing) {
        flagMap.set(n, { ...f, evidenceTier: tier, _rank: rank })
      } else if (rank > existing._rank) {
        // Higher tier wins — replace entirely
        flagMap.set(n, { ...f, evidenceTier: tier, _rank: rank })
      } else if (rank === existing._rank && rank > 0) {
        // Same tier — concatenate evidence from this chunk
        const existingEvidence = String(existing.evidence || '')
        const newEvidence = String(f.evidence || '')
        if (newEvidence && !existingEvidence.includes(newEvidence.slice(0, 100))) {
          existing.evidence = existingEvidence + '\n[also found in another section] ' + newEvidence
        }
      }
    }

    // Collect supplementary data from all chunks
    if (Array.isArray(r.extractedClaims)) allClaims.push(...r.extractedClaims)
    if (Array.isArray(r.contradictions)) allContradictions.push(...r.contradictions)
    if (Array.isArray(r.verifyNext)) allVerify.push(...r.verifyNext)
    if (r.investorAdvice) allAdvice.push(String(r.investorAdvice))
  }

  // Deduplicate claims/contradictions by key fields
  const dedupe = (arr: any[], keyFn: (x: any) => string) => {
    const seen = new Set<string>()
    return arr.filter((x) => {
      const k = keyFn(x).toLowerCase().slice(0, 80)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  const mergedClaims = dedupe(allClaims, (c) => `${c.type || ''}|${c.claim || ''}`)
  const mergedContradictions = dedupe(allContradictions, (c) => `${c.claim || ''}|${c.reality || ''}`)
  const mergedVerify = dedupe(allVerify, (c) => `${c.action || ''}|${c.where || ''}`)

  // Build merged result — scoring will be recomputed by normalizeResult
  const merged = {
    isInvestmentRelated: results.some((r) => r?.isInvestmentRelated === true),
    notRelevantReason: '',
    riskScore: 0,
    riskLevel: 'Low',
    scoreBreakdown: {
      totalWeightedPoints: 0,
      maxPossiblePoints: 0,
      formula: 'totalWeightedPoints ÷ maxPossiblePoints × 100',
      keyDrivers: [],
    },
    verdict: results[0]?.verdict || '',
    summary: results[0]?.summary || '',
    triggeredFlags: Array.from(flagMap.values()).map((f) => ({
      n: f.n,
      name: f.name,
      weight: f.weight,
      severity: f.severity,
      evidenceTier: f.evidenceTier,
      weightedPoints: f.weightedPoints,
      evidence: f.evidence,
      explanation: f.explanation,
    })),
    extractedClaims: mergedClaims,
    contradictions: mergedContradictions,
    verifyNext: mergedVerify,
    investorAdvice: allAdvice.length > 0
      ? allAdvice[0] + (allAdvice.length > 1 ? `\n\n(Additional notes from full document review: ${allAdvice.length - 1} more sections analyzed.)` : '')
      : '',
    disclaimer: results[0]?.disclaimer || 'This is an educational due-diligence aid, not legal or financial advice. Always verify with primary sources and consult a licensed professional.',
  }

  return merged
}

// ════════════════════════════════════════════════════════════════
//  SHARED HELPERS (used by both the one-shot and streaming paths)
// ════════════════════════════════════════════════════════════════

/** Build the investor-provided context lines from the structured fields. */
function buildCtx(input: {
  sponsorName?: string
  assetType?: string
  claimedReturn?: string
  amountAsked?: string
  sourceType?: string
}): string[] {
  const ctx: string[] = []
  if (input.sponsorName) ctx.push(`Sponsor / promoter name: ${input.sponsorName}`)
  if (input.assetType) ctx.push(`Asset type / strategy: ${input.assetType}`)
  if (input.claimedReturn) ctx.push(`Claimed return / IRR: ${input.claimedReturn}`)
  if (input.amountAsked) ctx.push(`Minimum investment / amount asked: ${input.amountAsked}`)
  if (input.sourceType) ctx.push(`Where this came from: ${input.sourceType}`)
  return ctx
}

// ════════════════════════════════════════════════════════════════
//  BROWSER-DRIVEN CHUNK PIPELINE  (no Queues — each request is short)
//
//  For very large documents the browser splits the text, calls
//  analyzeChunkRequest once PER CHUNK (each returns fast, well under the
//  Worker request limit), then posts all chunk results to the merge
//  endpoint which runs the SAME merge + gate + scoring as the one-shot
//  path — so a chunked analysis scores identically to a single request.
// ════════════════════════════════════════════════════════════════

export interface ChunkPlanInfo {
  /** Whether a document of this length needs the multi-chunk path at all. */
  needsChunking: boolean
  /** Effective chunk size (chars). */
  chunkSize: number
  /** Carryover context size (chars) threaded between chunks. */
  carryover: number
  /** Raw overlap applied at split boundaries. */
  overlap: number
  /** Total number of chunks the browser should produce. */
  totalChunks: number
}

/**
 * Report the chunking plan for a document of `docLen` chars so the CLIENT can
 * split the text exactly the way the server would. `needsChunking` is false
 * when the whole doc fits one call (browser should use /api/analyze instead).
 */
export function getChunkPlan(env: Bindings, docLen: number): ChunkPlanInfo {
  const plan = computeChunkPlan(env, docLen)
  const needsChunking = docLen > plan.maxChunk
  const totalChunks = needsChunking
    ? Math.min(splitIntoChunks('x'.repeat(docLen), plan.chunkSize, CHUNK_OVERLAP).length, MAX_CHUNKS)
    : 1
  return {
    needsChunking,
    chunkSize: plan.chunkSize,
    carryover: plan.carryover,
    overlap: CHUNK_OVERLAP,
    totalChunks,
  }
}

/**
 * Authoritatively split a document into chunks server-side, so the browser
 * orchestrates the exact same chunks the one-shot path would produce (no risk
 * of the client's split drifting from the server algorithm). Also returns the
 * carryover size so the browser can thread cross-boundary context.
 */
export function splitDocument(env: Bindings, text: string): { chunks: string[]; carryover: number } {
  const plan = computeChunkPlan(env, text.length)
  const chunks = splitIntoChunks(text, plan.chunkSize, CHUNK_OVERLAP)
  return { chunks, carryover: plan.carryover }
}

export interface ChunkRequestInput {
  chunk: string
  chunkIndex: number
  totalChunks: number
  carryover?: string
  sponsorName?: string
  assetType?: string
  claimedReturn?: string
  amountAsked?: string
  sourceType?: string
  /** Only the FIRST chunk should carry images (single vision call). */
  images?: string[]
}

/**
 * Analyze ONE chunk of a large document. Uses the GPT-only per-type routing:
 * the image-bearing first chunk → vision model, all text chunks → large model.
 * Returns the raw per-chunk JSON (NOT normalized) — the client collects these
 * and posts them to mergeChunkAnalysis for the final scored report.
 */
export async function analyzeChunkRequest(env: Bindings, input: ChunkRequestInput): Promise<any> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Analysis service is not configured. (Set OPENAI_API_KEY.)')
  }
  const ctx = buildCtx(input)
  const images = (input.images || [])
    .filter((s) => typeof s === 'string' && s.startsWith('data:image'))
    .slice(0, 4)
  const hasImages = images.length > 0

  // Total doc is large (we're on the chunk path), so isChunk = true.
  const model = pickModel(env, { hasImages, docLen: Number.MAX_SAFE_INTEGER, isChunk: true })
  const config = makeConfig(env, model)

  return analyzeOneChunk(
    config,
    ctx,
    String(input.chunk || ''),
    hasImages ? images : [],
    Number(input.chunkIndex) || 0,
    Number(input.totalChunks) || 1,
    String(input.carryover || '')
  )
}

/**
 * Merge an array of per-chunk results into the final scored report, running the
 * EXACT same merge → relevance gate → normalize pipeline as analyzeSubmission.
 * This is the single source of truth for scoring on the chunked path.
 */
export function mergeChunkAnalysis(results: any[]): any {
  const clean = (Array.isArray(results) ? results : []).filter((r) => r && typeof r === 'object')
  if (clean.length === 0) {
    throw new Error('SERVICE_MESSAGE:No analysis results were provided to merge.')
  }

  const merged = mergeChunkResults(clean)

  // Relevance gate (identical to analyzeSubmission): only reject if a MAJORITY
  // of chunks say "not investment related".
  if (merged && merged.isInvestmentRelated === false) {
    const relevantCount = clean.filter((r) => r?.isInvestmentRelated === true).length
    if (relevantCount > clean.length / 2) {
      merged.isInvestmentRelated = true
    } else {
      const reason =
        String(merged.notRelevantReason || '').trim() ||
        clean.find((r) => r?.notRelevantReason)?.notRelevantReason ||
        'This does not appear to be an investment offering, pitch, or solicitation.'
      throw new Error('NOT_RELEVANT:' + reason)
    }
  }

  return normalizeResult(merged)
}

// ════════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ════════════════════════════════════════════════════════════════

export async function analyzeSubmission(env: Bindings, input: AnalyzeInput) {
  // ── GPT-only: a single OpenAI key drives every route ──
  if (!env.OPENAI_API_KEY) {
    throw new Error('Analysis service is not configured. (Set OPENAI_API_KEY.)')
  }

  const ctx = buildCtx(input)

  const images = (input.images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image')).slice(0, 4)
  const hasImages = images.length > 0
  const rawMaterial = (input.material || '').trim()

  // ── Percentage-based chunk plan (generalized to any size) ──
  const plan = computeChunkPlan(env, rawMaterial.length)

  // A single call can hold the whole doc if it has images (single vision call)
  // or it already fits one OpenAI chunk (<= plan.maxChunk).
  const singleShot = hasImages || rawMaterial.length <= plan.maxChunk

  let results: any[]

  if (singleShot) {
    // ── SINGLE SHOT (image OR doc that fits one chunk) ──
    // Model is chosen by document type: images → vision; short text → short
    // model; normal text → text model.
    const model = pickModel(env, { hasImages, docLen: rawMaterial.length, isChunk: false })
    const config = makeConfig(env, model)

    const cap = Math.max(plan.maxChunk, rawMaterial.length)
    const material = rawMaterial.slice(0, cap)
    const wasTruncated = rawMaterial.length > cap

    const textPart =
      (ctx.length ? `INVESTOR-PROVIDED CONTEXT:\n${ctx.join('\n')}\n\n` : '') +
      (material.trim().length
        ? `SUBMITTED MATERIAL (text) TO ANALYZE${wasTruncated ? ' (very long document — analyze the full body provided)' : ''}:\n"""\n${material}\n"""\n\n`
        : '') +
      (hasImages
        ? `The investor also attached ${images.length} image(s) (e.g. a screenshot of an ad, email, or pitch-deck page). Read ALL text and visual claims in the image(s) and treat them as submitted material.\n\n`
        : '') +
      `Analyze everything provided using the 21-flag framework and return the JSON object only.`

    // Image(s) + text go together in ONE prompt (single vision call).
    const userContent = hasImages
      ? [{ type: 'text', text: textPart }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
      : textPart

    results = [await callParsed(config, SYSTEM_PROMPT, userContent, images)]

  } else {
    // ── LARGE TEXT DOC: SEQUENTIAL CHUNKING WITH % CARRYOVER ──
    // Chunk size and carryover both come from the percentage-based plan.
    // Large/chunked text routes to the "large" GPT model.
    const chunks = splitIntoChunks(rawMaterial, plan.chunkSize, CHUNK_OVERLAP)

    const textModel = pickModel(env, { hasImages: false, docLen: rawMaterial.length, isChunk: true })
    const textConfig = makeConfig(env, textModel)
    const imgConfig = hasImages
      ? makeConfig(env, pickModel(env, { hasImages: true, docLen: rawMaterial.length, isChunk: true }))
      : textConfig

    results = []
    let carryover = ''
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const chunkHasImages = i === 0 && hasImages
      const config = chunkHasImages ? imgConfig : textConfig

      const res = await analyzeOneChunk(
        config,
        ctx,
        chunk,
        chunkHasImages ? images : [],
        i,
        chunks.length,
        carryover
      )
      results.push(res)

      // Carryover for the NEXT chunk = last plan.carryover chars seen so far.
      const combined = (carryover + '\n' + chunk)
      carryover = plan.carryover > 0 ? combined.slice(-plan.carryover) : ''
    }
  }

  // ── MERGE (if multiple chunks) AND NORMALIZE ──
  const merged = mergeChunkResults(results)

  // Relevance gate: if ANY chunk says not relevant, check majority
  if (merged && merged.isInvestmentRelated === false) {
    const relevantCount = results.filter((r) => r?.isInvestmentRelated === true).length
    if (relevantCount > results.length / 2) {
      // Majority says relevant — override the gate
      merged.isInvestmentRelated = true
    } else {
      const reason = String(merged.notRelevantReason || '').trim() ||
        results.find((r) => r?.notRelevantReason)?.notRelevantReason ||
        'This does not appear to be an investment offering, pitch, or solicitation.'
      throw new Error('NOT_RELEVANT:' + reason)
    }
  }

  return normalizeResult(merged)
}

const VALID_TIERS = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'GAP']

function normalizeTier(t: any): string {
  const s = String(t || '').trim()
  const found = VALID_TIERS.find((v) => v.toLowerCase() === s.toLowerCase())
  if (found) return found
  const m = s.match(/([1-4])/)
  if (s.toLowerCase().includes('gap')) return 'GAP'
  if (m) return `Tier ${m[1]}`
  return 'Tier 2'
}

// Severity is FIXED by evidence tier so the same submission scores the same
// every time (deterministic). The model only chooses the tier; the server
// assigns severity from this table — it is the single source of truth.
const TIER_SEVERITY: Record<string, number> = {
  'Tier 1': 10,
  'Tier 2': 8,
  'Tier 3': 5,
  'Tier 4': 3,
  GAP: 0,
}

// Defensive normalization + AUTHORITATIVE re-computation of the official
// InvestSafe Pro explainable score (total ÷ max × 100). Severity is derived
// solely from the evidence tier (see TIER_SEVERITY), making results repeatable.
function normalizeResult(r: any) {
  let flags = Array.isArray(r.triggeredFlags) ? r.triggeredFlags : []
  flags = flags
    .filter((f: any) => {
      if (!f) return false
      const n = Number((f as any).n)
      return Number.isInteger(n) && FLAG_FRAMEWORK.some((d) => d.n === n)
    })
    .map((f: any) => {
      const def = FLAG_FRAMEWORK.find((d) => d.n === Number(f.n))!
      const weight = def.weight
      const tier = normalizeTier(f.evidenceTier)
      const severity = TIER_SEVERITY[tier] ?? 0

      const weightedPoints = tier === 'GAP' ? 0 : Math.round((weight * severity) / 10)
      return {
        n: Number(f.n),
        name: def.name,
        weight,
        severity,
        evidenceTier: tier,
        weightedPoints,
        evidence: String(f.evidence || ''),
        explanation: String(f.explanation || ''),
      }
    })

  const scored = flags.filter((f: any) => f.evidenceTier !== 'GAP')
  const totalWeightedPoints = scored.reduce((s: number, f: any) => s + f.weightedPoints, 0)
  const maxPossiblePoints = scored.reduce((s: number, f: any) => s + f.weight, 0)

  const STABILITY_FLOOR = 40
  const floorWeight = scored.length >= 4 ? 0 : STABILITY_FLOOR * (1 - scored.length / 4)
  const denom = maxPossiblePoints + floorWeight
  const riskScore = denom > 0 ? clamp(Math.round((totalWeightedPoints / denom) * 100), 0, 100) : 0

  const keyDrivers = scored
    .filter((f: any) => maxPossiblePoints > 0 && f.weightedPoints / maxPossiblePoints >= 0.15)
    .map((f: any) => f.n)

  const riskLevel = riskScore >= 75 ? 'Critical' : riskScore >= 50 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low'

  return {
    riskScore,
    riskLevel,
    scoreBreakdown: {
      totalWeightedPoints,
      maxPossiblePoints,
      formula: 'totalWeightedPoints ÷ maxPossiblePoints × 100',
      keyDrivers,
    },
    verdict: String(r.verdict || ''),
    summary: String(r.summary || ''),
    triggeredFlags: flags.sort((a: any, b: any) => {
      if ((a.evidenceTier === 'GAP') !== (b.evidenceTier === 'GAP')) return a.evidenceTier === 'GAP' ? 1 : -1
      return b.weightedPoints - a.weightedPoints
    }),
    extractedClaims: Array.isArray(r.extractedClaims) ? r.extractedClaims : [],
    contradictions: Array.isArray(r.contradictions) ? r.contradictions : [],
    verifyNext: Array.isArray(r.verifyNext) ? r.verifyNext : [],
    investorAdvice: String(r.investorAdvice || ''),
    disclaimer: String(
      r.disclaimer ||
        'This is an educational due-diligence aid, not legal or financial advice. Always verify with primary sources and consult a licensed professional.'
    ),
    analyzedAt: new Date().toISOString(),
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
