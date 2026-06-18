// ════════════════════════════════════════════════════════════════
//  InvestSafe Pro™ — Forensic Analysis Engine (server-side)
//  Uses our managed OpenAI key. No BYOK. Built on the documented
//  Barry Minkow investigative methodology (21-flag framework).
// ════════════════════════════════════════════════════════════════

export type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
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

SCORING RULES (the score must feel intuitive to an ordinary investor — a blatant scam should score 80–100, a clean registered fund 0–20):
- For each flag, decide if it is TRIGGERED by the submitted material.
- If triggered, assign a "severity" from 1–10 (how strongly the evidence in the text supports this flag).
- weightedPoints = round( weight * severity / 10 ).
- Compute riskScore as an INTUITIVE 0–100 danger rating, NOT a simple percentage of all 21 weights. Use this guidance:
  • If even ONE weight-10 flag fires at high severity (e.g. guaranteed/risk-free returns, FINRA-barred promoter, false FDIC claims, impossible ratios), the score should be at least 70.
  • Each additional strong flag (severity 7+) should push the score meaningfully higher.
  • 3+ strong flags together = Critical (85–100).
  • A formula that works well: riskScore = min(100, round( (highestWeightedPoints * 7) + (sum of all OTHER weightedPoints * 1.4) )). Apply judgment so the final number matches the real danger.
- riskLevel: 0–24 = "Low", 25–49 = "Medium", 50–74 = "High", 75–100 = "Critical".
- Be fair to legitimate offerings: a well-disclosed, registered, conservatively-marketed investment with no triggered flags should score 0–15 (Low).

IMPORTANT ANALYSIS GUIDANCE:
- Treat extraordinary, "guaranteed", or "risk-free" returns as major flags.
- IRR/annual return claims of 17%+ that are presented as safe/consistent are a classic "Buffett-Shame Zone" flag.
- Mass-market advertising (Facebook, radio, TV) for a private securities offering is a strong flag.
- Missing disclosures (no PPM, no audited financials, no addresses, no LTV, no failed-deal history) are flags.
- "Refer a friend for a bonus" type solicitation is unlicensed-solicitation behavior.
- High-pressure / "closing soon" / "limited spots" urgency is a flag.
- Be fair: if the material is well-disclosed, conservative, and registered, return a LOW score with few/no flags. Do not invent fraud where there is none.

You must respond with ONLY a single valid JSON object (no markdown fences, no commentary) in EXACTLY this shape:
{
  "riskScore": <integer 0-100>,
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "verdict": "<one-sentence plain-English bottom line a non-expert investor understands>",
  "summary": "<2-4 sentence plain-English explanation of the overall finding>",
  "triggeredFlags": [
    {
      "n": <flag number 1-21>,
      "name": "<flag name>",
      "weight": <flag weight>,
      "severity": <1-10>,
      "weightedPoints": <integer>,
      "evidence": "<short quote or paraphrase from the submitted text that triggers this flag>",
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
}

export async function analyzeSubmission(env: Bindings, input: AnalyzeInput) {
  const apiKey = env.OPENAI_API_KEY
  const baseUrl = (env.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1').replace(/\/$/, '')

  if (!apiKey) {
    throw new Error('Analysis service is not configured. (Missing server API key.)')
  }

  const ctx: string[] = []
  if (input.sponsorName) ctx.push(`Sponsor / promoter name: ${input.sponsorName}`)
  if (input.assetType) ctx.push(`Asset type / strategy: ${input.assetType}`)
  if (input.claimedReturn) ctx.push(`Claimed return / IRR: ${input.claimedReturn}`)
  if (input.amountAsked) ctx.push(`Minimum investment / amount asked: ${input.amountAsked}`)
  if (input.sourceType) ctx.push(`Where this came from: ${input.sourceType}`)

  const userContent =
    (ctx.length ? `INVESTOR-PROVIDED CONTEXT:\n${ctx.join('\n')}\n\n` : '') +
    `SUBMITTED MATERIAL TO ANALYZE:\n"""\n${input.material.slice(0, 24000)}\n"""\n\n` +
    `Analyze the submitted material using the 21-flag framework and return the JSON object only.`

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`Analysis service error (${resp.status}). ${txt.slice(0, 200)}`)
  }

  const data: any = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Analysis service returned an empty response.')

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    const m = content.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Could not parse the analysis result.')
    parsed = JSON.parse(m[0])
  }

  return normalizeResult(parsed)
}

// Defensive normalization so the frontend always gets a consistent shape.
function normalizeResult(r: any) {
  const maxTotal = FLAG_FRAMEWORK.reduce((s, f) => s + f.weight, 0)
  let flags = Array.isArray(r.triggeredFlags) ? r.triggeredFlags : []
  flags = flags
    .filter((f: any) => f && typeof f.n !== 'undefined')
    .map((f: any) => {
      const def = FLAG_FRAMEWORK.find((d) => d.n === Number(f.n))
      const weight = def ? def.weight : Number(f.weight) || 5
      const severity = clamp(Number(f.severity) || 5, 1, 10)
      const weightedPoints =
        typeof f.weightedPoints === 'number'
          ? Math.round(f.weightedPoints)
          : Math.round((weight * severity) / 10)
      return {
        n: Number(f.n),
        name: def ? def.name : String(f.name || 'Flag'),
        weight,
        severity,
        weightedPoints,
        evidence: String(f.evidence || ''),
        explanation: String(f.explanation || ''),
      }
    })

  let riskScore = Number(r.riskScore)
  if (!Number.isFinite(riskScore)) {
    // Intuitive fallback: heavily weight the single strongest flag, add the rest.
    const pts = flags.map((f: any) => f.weightedPoints).sort((a: number, b: number) => b - a)
    const top = pts[0] || 0
    const rest = pts.slice(1).reduce((s: number, p: number) => s + p, 0)
    riskScore = Math.round(top * 7 + rest * 1.4)
  }
  riskScore = clamp(Math.round(riskScore), 0, 100)

  let riskLevel = String(r.riskLevel || '')
  if (!['Low', 'Medium', 'High', 'Critical'].includes(riskLevel)) {
    riskLevel = riskScore >= 75 ? 'Critical' : riskScore >= 50 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low'
  }

  return {
    riskScore,
    riskLevel,
    verdict: String(r.verdict || ''),
    summary: String(r.summary || ''),
    triggeredFlags: flags.sort((a: any, b: any) => b.weightedPoints - a.weightedPoints),
    extractedClaims: Array.isArray(r.extractedClaims) ? r.extractedClaims : [],
    contradictions: Array.isArray(r.contradictions) ? r.contradictions : [],
    verifyNext: Array.isArray(r.verifyNext) ? r.verifyNext : [],
    investorAdvice: String(r.investorAdvice || ''),
    disclaimer: String(
      r.disclaimer ||
        'This is an educational due-diligence aid, not legal or financial advice. Always verify with primary sources and consult a licensed professional.'
    ),
    analyzedAt: new Date().toISOString(),
    maxTotal,
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
