// ════════════════════════════════════════════════════════════════
//  InvestSafe Pro™ — Forensic Analysis Engine (server-side)
//  Uses our managed OpenAI key. No BYOK. Built on the documented
//  Barry Minkow investigative methodology (21-flag framework).
// ════════════════════════════════════════════════════════════════

export type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  /** Optional: force ONE model for everything (overrides text/vision split). */
  OPENAI_MODEL?: string
  /** Optional: model for text-only submissions (default gpt-4o-mini, cheap). */
  OPENAI_TEXT_MODEL?: string
  /** Optional: model for submissions WITH images (default gpt-4o, sharp vision). */
  OPENAI_VISION_MODEL?: string
  /** Optional: reasoning effort for GPT-5/o models (none|low|medium|high). Default low for consistency. */
  OPENAI_REASONING_EFFORT?: string
}

// The 21-flag framework (weight = max points each flag can contribute)
export const FLAG_FRAMEWORK = [
  { n: 1,  name: 'Irrational Ratios — Expenses vs. Revenue Impossible', weight: 10 },
  { n: 2,  name: 'IRR in "Buffett-Shame Zone" (17–25%+)', weight: 10 },
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

export async function analyzeSubmission(env: Bindings, input: AnalyzeInput) {
  const apiKey = env.OPENAI_API_KEY
  const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')

  if (!apiKey) {
    throw new Error('Analysis service is not configured. (Missing server API key.)')
  }

  const ctx: string[] = []
  if (input.sponsorName) ctx.push(`Sponsor / promoter name: ${input.sponsorName}`)
  if (input.assetType) ctx.push(`Asset type / strategy: ${input.assetType}`)
  if (input.claimedReturn) ctx.push(`Claimed return / IRR: ${input.claimedReturn}`)
  if (input.amountAsked) ctx.push(`Minimum investment / amount asked: ${input.amountAsked}`)
  if (input.sourceType) ctx.push(`Where this came from: ${input.sourceType}`)

  const images = (input.images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image')).slice(0, 4)
  const hasImages = images.length > 0

  // Smart model routing: sharp vision model when images are attached, cheaper
  // model for text-only. OPENAI_MODEL (if set) forces one model for everything.
  const textModel = env.OPENAI_TEXT_MODEL || 'gpt-5.4-mini'
  const visionModel = env.OPENAI_VISION_MODEL || 'gpt-5.4'
  const model = env.OPENAI_MODEL || (hasImages ? visionModel : textModel)

  // Send much more of the document so scoring isn't based on a tiny, unstable
  // opening slice. gpt-5.x has a large context window; 120k chars (~30k tokens)
  // covers the substantive body of most PPMs/offering memos.
  const MAX_MATERIAL = 120000
  const rawMaterial = (input.material || '')
  const material = rawMaterial.slice(0, MAX_MATERIAL)
  const wasTruncated = rawMaterial.length > MAX_MATERIAL

  const textPart =
    (ctx.length ? `INVESTOR-PROVIDED CONTEXT:\n${ctx.join('\n')}\n\n` : '') +
    (material.trim().length
      ? `SUBMITTED MATERIAL (text) TO ANALYZE${wasTruncated ? ' (long document — analyze what is provided)' : ''}:\n"""\n${material}\n"""\n\n`
      : '') +
    (hasImages
      ? `The investor also attached ${images.length} image(s) (e.g. a screenshot of an ad, email, or pitch-deck page). Read ALL text and visual claims in the image(s) and treat them as submitted material.\n\n`
      : '') +
    `Analyze everything provided using the 21-flag framework and return the JSON object only.`

  // Build the user message. Vision requires the array content format.
  const userContent: any = hasImages
    ? [{ type: 'text', text: textPart }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
    : textPart

  // GPT-5 family (and o-series) reject `max_tokens` and require
  // `max_completion_tokens`. Older models (gpt-4o etc.) use `max_tokens`.
  const isReasoning = /^(gpt-5|o1|o3|o4)/i.test(model)
  const reqBody: any = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    // Determinism: temperature 0 + fixed seed makes the same submission yield
    // the same score on repeat runs (as much as the API allows).
    temperature: 0,
    seed: 42,
  }
  if (isReasoning) {
    // Reasoning models add internal stochastic reasoning that temperature:0
    // does NOT fully control. Low reasoning effort sharply reduces run-to-run
    // score variance for this rubric-based scoring task. Configurable.
    reqBody.reasoning_effort = env.OPENAI_REASONING_EFFORT || 'low'
    // Reasoning models need headroom for hidden reasoning tokens + the JSON.
    reqBody.max_completion_tokens = 8000
  } else {
    reqBody.max_tokens = 4000
  }

  const callApi = (b: any) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(b),
    })

  let resp = await callApi(reqBody)

  // Some models reject custom temperature/seed — retry once without them.
  if (!resp.ok) {
    const peek = await resp.clone().text().catch(() => '')
    const pl = peek.toLowerCase()
    if (resp.status === 400 && (pl.includes('temperature') || pl.includes('seed'))) {
      const fallback = { ...reqBody }
      delete fallback.temperature
      delete fallback.seed
      resp = await callApi(fallback)
    }
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    const low = txt.toLowerCase()
    // Provider quota / billing problems (OpenAI returns 429 with these).
    if (resp.status === 429 || low.includes('insufficient_quota') || low.includes('exceeded your current quota') || low.includes('billing')) {
      throw new Error('SERVICE_QUOTA: The analysis service is temporarily unavailable (API quota/billing limit reached).')
    }
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('SERVICE_AUTH: The analysis service is misconfigured (invalid API key).')
    }
    throw new Error(`Analysis service error (${resp.status}). ${txt.slice(0, 200)}`)
  }

  const data: any = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  const finish = data?.choices?.[0]?.finish_reason
  if (!content) throw new Error('Analysis service returned an empty response.')

  // The LLM proxy can return a plain-text status/error message (e.g. quota /
  // credits exhausted) with HTTP 200 instead of JSON. Detect that up front so
  // we surface a meaningful error rather than a confusing "could not parse".
  const trimmed = String(content).trim()
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[') || /\{[\s\S]*\}/.test(trimmed)
  if (!looksLikeJson) {
    const lower = trimmed.toLowerCase()
    if (lower.includes('credit') && (lower.includes('deplet') || lower.includes('purchase') || lower.includes('pack'))) {
      throw new Error('SERVICE_QUOTA: The analysis service is temporarily unavailable (account credits depleted). Please try again later or contact support.')
    }
    throw new Error(`SERVICE_MESSAGE: ${trimmed.slice(0, 300)}`)
  }

  // If the model was cut off mid-output, the JSON will be invalid.
  if (finish === 'length') {
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

  // Relevance gate: if the model decided this isn't an investment at all,
  // do NOT return a misleading "0 / Low risk" score. Signal a clear error.
  if (parsed && parsed.isInvestmentRelated === false) {
    const reason = String(parsed.notRelevantReason || '').trim()
    throw new Error('NOT_RELEVANT:' + (reason || 'This does not appear to be an investment offering, pitch, or solicitation.'))
  }

  return normalizeResult(parsed)
}

const VALID_TIERS = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'GAP']

function normalizeTier(t: any): string {
  const s = String(t || '').trim()
  const found = VALID_TIERS.find((v) => v.toLowerCase() === s.toLowerCase())
  if (found) return found
  // tolerate "1", "tier1", "t1", "gap"
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
    .filter((f: any) => f && typeof f.n !== 'undefined')
    .map((f: any) => {
      const def = FLAG_FRAMEWORK.find((d) => d.n === Number(f.n))
      const weight = def ? def.weight : Number(f.weight) || 5
      const tier = normalizeTier(f.evidenceTier)
      // Severity is determined entirely by the tier — ignore the model's value.
      const severity = TIER_SEVERITY[tier] ?? 0

      const weightedPoints = tier === 'GAP' ? 0 : Math.round((weight * severity) / 10)
      return {
        n: Number(f.n),
        name: def ? def.name : String(f.name || 'Flag'),
        weight,
        severity,
        evidenceTier: tier,
        weightedPoints,
        evidence: String(f.evidence || ''),
        explanation: String(f.explanation || ''),
      }
    })

  // Official formula: total ÷ max × 100, where max = full weight of every
  // triggered NON-GAP flag (i.e. as if each were severity 10).
  const scored = flags.filter((f: any) => f.evidenceTier !== 'GAP')
  const totalWeightedPoints = scored.reduce((s: number, f: any) => s + f.weightedPoints, 0)
  const maxPossiblePoints = scored.reduce((s: number, f: any) => s + f.weight, 0)

  // STABILITY FLOOR: the raw "total ÷ triggered-max" ratio lets a SINGLE
  // borderline flag dominate (e.g. 1 flag = up to 100% → "Critical") even in a
  // long, otherwise-clean document. To prevent one flickering flag from swinging
  // the verdict from Low to Critical, the denominator includes a baseline floor.
  // The floor scales with how few flags triggered: with only 1–2 triggered
  // flags, a meaningful "clean evidence" baseline is added so a lone minor flag
  // reads as Low/Medium, not Critical. With several flags the floor fades out and
  // the score converges to the original formula.
  const STABILITY_FLOOR = 40 // baseline points representing "document reviewed, little/no fraud signal"
  const floorWeight = scored.length >= 4 ? 0 : STABILITY_FLOOR * (1 - scored.length / 4)
  const denom = maxPossiblePoints + floorWeight
  const riskScore = denom > 0 ? clamp(Math.round((totalWeightedPoints / denom) * 100), 0, 100) : 0

  // Key drivers: flags contributing >= 15% of the maximum.
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
    // Show GAP items last; otherwise highest weighted points first.
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
