// ════════════════════════════════════════════════════════════════
//  DETERMINISTIC TYPESCRIPT MERGE + SCORING  (NO LLM)
//
//  Takes the per-chunk ChunkEvaluation[] produced by the LLM and merges them
//  into ONE final, scored dataset — entirely in code. Responsibilities:
//    • deduplicate findings (one entry per rule)
//    • aggregate evidence across chunks (merge quotes, keep page refs)
//    • resolve conflicts (highest evidence tier wins → monotonic)
//    • aggregate confidence (max across chunks that triggered the rule)
//    • assign deterministic severity from the fixed tier table
//    • compute weighted points, risk score, risk level, key drivers
//
//  The LLM NEVER computes the score. This module is the single source of
//  truth for scoring, identical for one-chunk and many-chunk documents.
// ════════════════════════════════════════════════════════════════

import {
  FLAG_FRAMEWORK,
  RULE_BY_N,
  TIER_SEVERITY,
  TIER_RANK,
  VALID_TIERS,
  type ChunkEvaluation,
  type RuleFinding,
  type RuleEvidence,
} from './rules'

export interface MergedEvidence {
  page: number
  section?: string
  quote: string
  reason: string
}

/** One rule after merging across all chunks + deterministic scoring. */
export interface MergedFinding {
  n: number
  name: string
  weight: number
  triggered: boolean
  evidenceTier: string
  severity: number
  weightedPoints: number
  /** Aggregated confidence 0..1 (max across triggering chunks). */
  confidence: number
  /** Distinct pages the evidence spans. */
  pages: number[]
  evidence: MergedEvidence[]
}

export interface MergedDataset {
  isInvestmentRelated: boolean
  notRelevantReason: string
  riskScore: number
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'
  scoreBreakdown: {
    totalWeightedPoints: number
    maxPossiblePoints: number
    formula: string
    keyDrivers: number[]
  }
  /** All 21 rules with their merged state (triggered + not-triggered). */
  findings: MergedFinding[]
  /** Only the triggered (non-GAP) rules, sorted by weightedPoints desc. */
  triggeredFlags: MergedFinding[]
  claims: { type: string; claim: string; concern: string; page?: number }[]
  chunkCount: number
  pageCount: number
  analyzedAt: string
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

// Calibration guardrails to reduce false positives on non-investment or weak-evidence text.
const MIN_TRIGGER_CONFIDENCE = 0.45
const MIN_QUOTE_CHARS = 12
const MIN_REASON_CHARS = 24

function normalizeTier(t: any): string {
  const s = String(t || '').trim()
  const found = VALID_TIERS.find((v) => v.toLowerCase() === s.toLowerCase())
  if (found) return found
  if (s.toLowerCase().includes('gap')) return 'GAP'
  const m = s.match(/([1-4])/)
  if (m) return `Tier ${m[1]}`
  return 'GAP'
}

/** Dedupe evidence items by (page + first 80 chars of quote). */
function dedupeEvidence(items: MergedEvidence[]): MergedEvidence[] {
  const seen = new Set<string>()
  const out: MergedEvidence[] = []
  for (const e of items) {
    const key = `${e.page}|${(e.quote || '').toLowerCase().slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/**
 * Merge per-chunk evaluations into ONE scored dataset (deterministic).
 */
export function mergeEvaluations(evals: ChunkEvaluation[]): MergedDataset {
  const clean = (Array.isArray(evals) ? evals : []).filter((e) => e && typeof e === 'object')

  // ── Deterministic document-level detectors (pure function of the bytes) ──
  //  Union the investment-vocabulary and legitimate-disclosure family hits that
  //  analyzer.ts stamped onto each chunk (ChunkEvaluation.det). Computing these
  //  at the DOCUMENT level (not per-chunk) is essential: a multi-chunk PPM keeps
  //  its risk factors, CIK, custodian, and LTV in DIFFERENT chunks.
  const invFamilies = new Set<number>()
  const legitFamilies = new Set<number>()
  const ppmFamilies = new Set<number>()
  const legalFamilies = new Set<number>()
  let anyLtv = false
  let anyLoss = false
  let anyWaterfall = false
  let anyAffirmativeGuarantee = false
  for (const e of clean) {
    const d = (e as any).det
    if (!d) continue
    for (const i of d.invFamilies || []) invFamilies.add(i)
    for (const i of d.legitFamilies || []) legitFamilies.add(i)
    for (const i of d.ppmFamilies || []) ppmFamilies.add(i)
    for (const i of d.legalFamilies || []) legalFamilies.add(i)
    if (d.hasLtv) anyLtv = true
    if (d.hasLoss) anyLoss = true
    if (d.hasWaterfall) anyWaterfall = true
    if (d.hasAffirmativeGuarantee) anyAffirmativeGuarantee = true
  }
  const investmentSignals = invFamilies.size
  const legitSignals = legitFamilies.size
  const ppmSignals = ppmFamilies.size
  const legalSignals = legalFamilies.size
  // A document is a formal PPM if it hits ≥4 PPM structure families AND ≥3 legal
  // formality families — scam marketing pages never have this density.
  const isFormalPPM = ppmSignals >= 4 && legalSignals >= 3
  // Strong legitimacy: either ≥3 disclosure families (original gate) OR a formal
  // PPM structure (new gate). Both suppress soft rules when no strong fraud signal.
  const strongLegit = legitSignals >= 3 || isFormalPPM

  // ── Relevance gate (DETERMINISTIC) ──
  //  A document is investment-related iff it shows ≥3 distinct investment-vocab
  //  families. The old gate counted the LLM's non-deterministic
  //  is_investment_related votes, which flipped the SAME legit document between
  //  0% (voted not-related → force-zeroed) and 53% across runs. This gate is a
  //  pure function of the text. A rule that actually triggers on concrete
  //  evidence still forces relevance below (belt-and-suspenders).
  let isInvestmentRelated = clean.length > 0 && investmentSignals >= 3
  console.log(`[mergeEvaluations] chunks=${clean.length} investmentSignals=${investmentSignals} legitSignals=${legitSignals} ppmSignals=${ppmSignals} legalSignals=${legalSignals} isFormalPPM=${isFormalPPM} anyWaterfall=${anyWaterfall} isInvestmentRelated=${isInvestmentRelated}`)

  // ── Per-rule accumulator ──
  interface Acc {
    triggered: boolean
    bestRank: number
    tier: string
    confidence: number
    evidence: MergedEvidence[]
  }
  const acc = new Map<number, Acc>()
  for (const rule of FLAG_FRAMEWORK) {
    acc.set(rule.n, { triggered: false, bestRank: 0, tier: 'GAP', confidence: 0, evidence: [] })
  }

  const allClaims: MergedDataset['claims'] = []

  for (const ev of clean) {
    // Accumulate rules from EVERY chunk. The rule-level trigger gate below
    // (confidence ≥ floor, tier ≠ GAP, concrete evidence) filters noise, so we
    // no longer drop a chunk's rules on the flaky per-chunk LLM relevance vote —
    // that OR-in was a residual source of run-to-run score flips.
    const rules: RuleFinding[] = Array.isArray(ev.rules) ? ev.rules : []
    for (const r of rules) {
      const n = Number(r?.rule_id)
      if (!RULE_BY_N.has(n)) continue
      const a = acc.get(n)!
      const tier = normalizeTier(r?.evidence_tier)
      const rank = TIER_RANK[tier] ?? 0
      const conf = clamp(Number(r?.confidence) || 0, 0, 1)

      // Collect evidence with page refs (always, so even weak signals are cited).
      const evItems: MergedEvidence[] = (Array.isArray(r?.evidence) ? r.evidence : [])
        .map((e: RuleEvidence) => ({
          page: Math.max(0, Number(e?.page) || 0),
          section: e?.section ? String(e.section) : undefined,
          quote: String(e?.quote || '').trim(),
          reason: String(e?.reason || '').trim(),
        }))
        .filter((e) => e.quote.length > 0 || e.reason.length > 0)

      const hasConcreteEvidence = evItems.some(
        (e) => e.quote.length >= MIN_QUOTE_CHARS || e.reason.length >= MIN_REASON_CHARS
      )
      const triggered =
        r?.triggered === true &&
        tier !== 'GAP' &&
        conf >= MIN_TRIGGER_CONFIDENCE &&
        hasConcreteEvidence

      if (triggered) {
        a.triggered = true
        if (rank > a.bestRank) {
          a.bestRank = rank
          a.tier = tier
        }
        a.confidence = Math.max(a.confidence, conf)
        a.evidence.push(...evItems)
      } else if (!a.triggered && evItems.length > 0) {
        // Keep GAP evidence only if the rule never triggered anywhere.
        a.evidence.push(...evItems)
      }
    }

    if (Array.isArray(ev.claims)) {
      for (const c of ev.claims) {
        allClaims.push({
          type: String(c?.type || ''),
          claim: String(c?.claim || ''),
          concern: String(c?.concern || ''),
          page: c?.page != null ? Number(c.page) : undefined,
        })
      }
    }
  }

  // ── Deterministic false-positive suppression (pre-scoring) ──
  //  Legitimate offerings previously drifted to Medium/High off weak, jittery
  //  flags. These deterministic corrections keep a well-disclosed doc LOW.

  // 1) Absence-rule cancellation — factual, applied unconditionally. A disclosed
  //    LTV/price makes rule 15 ("no LTV disclosed") false; genuine loss/risk
  //    disclosure makes rule 16 ("no failed-deal disclosure") false. (hasLoss
  //    already excludes negated whitewash like "zero chance of loss".)
  if (anyLtv) {
    const a = acc.get(15)
    if (a?.triggered) { a.triggered = false; console.log('[legit] rule#15 canceled: LTV/price disclosed') }
  }
  if (anyLoss) {
    const a = acc.get(16)
    if (a?.triggered) { a.triggered = false; console.log('[legit] rule#16 canceled: loss/risk disclosure present') }
  }
  // Rule 6 ("guaranteed/risk-free") is canceled when NO chunk in the document
  // contains affirmative guarantee language. If the LLM triggers rule 6 but the
  // deterministic sentence-level detector found only NEGATED guarantees
  // ("returns are not guaranteed", "no guarantee"), the LLM was wrong — the text
  // is a disclaimer, not a fraud claim.
  if (!anyAffirmativeGuarantee) {
    const a = acc.get(6)
    if (a?.triggered) { a.triggered = false; console.log('[legit] rule#6 canceled: no affirmative guarantee language in document (only negated disclaimers)') }
  }

  // 2) Soft-rule suppression on well-disclosed docs — GUARDED against whitewash.
  //    Fires ONLY when the doc has NO strong (Tier 1/2) flag AND fewer than 2
  //    structural-fraud rules, so a real scam that merely pastes boilerplate
  //    disclaimers can never soften its own strong or structural evidence.
  const STRONG_RANK = TIER_RANK['Tier 2'] ?? 3
  // Structural-fraud rules (irrational ratios, debt/returns mismatch, internal
  // debt fund, co-GP double counting, asset overpayment) — the NRIA archetype.
  const STRUCTURAL_RULES = new Set([1, 3, 9, 12, 21])
  // Soft / commonly-misfired rules — suppressed at Tier ≤3 on a WELL-DISCLOSED
  // doc (guarded against whitewash below). Rule 19 (high-pressure) is included:
  // a legit fund's single time-limited promo ("limited offer, bonus units") is
  // mild marketing, not a blitz, and routinely false-positives here.
  const SOFT_RULES = new Set([11, 14, 15, 16, 18, 19, 20])
  // In a formal PPM with waterfall language, rule 2 at Tier ≤3 is almost
  // certainly a waterfall breakpoint or preferred return, not a fraud promise.
  if (isFormalPPM && anyWaterfall) SOFT_RULES.add(2)
  const triggeredEntries = () => Array.from(acc.entries()).filter(([, a]) => a.triggered)
  const strongNow = triggeredEntries().filter(([, a]) => (a.bestRank ?? 0) >= STRONG_RANK).length
  const structuralNow = triggeredEntries().filter(
    ([n, a]) => STRUCTURAL_RULES.has(n) && (a.bestRank ?? 0) >= 2
  ).length
  const suppressionAllowed = strongLegit && strongNow === 0 && structuralNow < 2
  if (suppressionAllowed) {
    for (const n of SOFT_RULES) {
      const a = acc.get(n)
      if (a?.triggered && (a.bestRank ?? 0) <= (TIER_RANK['Tier 3'] ?? 2)) {
        a.triggered = false
        console.log(`[legit] rule#${n} suppressed (well-disclosed, no strong/structural fraud signal)`)
      }
    }
  }

  // ── Build merged findings + deterministic scoring ──
  const findings: MergedFinding[] = FLAG_FRAMEWORK.map((rule) => {
    const a = acc.get(rule.n)!
    const tier = a.triggered ? a.tier : 'GAP'
    const severity = TIER_SEVERITY[tier] ?? 0
    const weightedPoints = a.triggered ? Math.round((rule.weight * severity) / 10) : 0
    const evidence = dedupeEvidence(a.evidence).slice(0, 12)
    const pages = Array.from(new Set(evidence.map((e) => e.page).filter((p) => p > 0))).sort((x, y) => x - y)
    return {
      n: rule.n,
      name: rule.name,
      weight: rule.weight,
      triggered: a.triggered,
      evidenceTier: tier,
      severity,
      weightedPoints,
      confidence: a.triggered ? Number(a.confidence.toFixed(2)) : 0,
      pages,
      evidence,
    }
  })

  const triggered = findings.filter((f) => f.triggered)
  const totalWeightedPoints = triggered.reduce((s, f) => s + f.weightedPoints, 0)
  const maxPossiblePoints = triggered.reduce((s, f) => s + f.weight, 0)

  // A rule that actually triggered (concrete evidence, above the confidence
  // floor) is itself proof the document is investment-related — override a
  // conservative relevance vote so real findings are never zeroed.
  if (!isInvestmentRelated && triggered.length > 0) isInvestmentRelated = true

  const notRelevantReason = isInvestmentRelated
    ? ''
    : String(clean.find((e) => e.not_relevant_reason)?.not_relevant_reason || '') ||
      'This does not appear to be an investment offering, pitch, or solicitation.'

  // Dispositive rules {4,5,6,8} (false FDIC, guaranteed/risk-free, barred, nominee)
  // are independently conclusive of fraud → Critical floor. Structural rules
  // {1,3,9,12,21} are the NRIA archetype (irrational ratios, debt/returns
  // mismatch, internal debt fund, co-GP double counting, asset overpayment);
  // ≥2 together → High floor. STRUCTURAL_RULES is defined above in the
  // suppression pass.
  const DISPOSITIVE_RULES = new Set([4, 5, 6, 8])
  const hasDispositiveHit = triggered.some(
    (f) => DISPOSITIVE_RULES.has(f.n) && (TIER_RANK[f.evidenceTier] ?? 0) >= 2
  )
  const structuralCount = triggered.filter(
    (f) => STRUCTURAL_RULES.has(f.n) && (TIER_RANK[f.evidenceTier] ?? 0) >= 2
  ).length
  // Corroborated structural fraud: ≥2 structural rules, or 1 with high aggregate.
  const hasStructuralCorroboration = structuralCount >= 2 || (structuralCount >= 1 && totalWeightedPoints >= 18)

  // ── PROPORTIONAL COMPOSITE SCORE (deterministic port of the reference engine) ──
  //  The reference IIE scores with:  Σ(severity × weight of triggered flags)
  //                                  ÷ (Σ of ALL 21 weights × 10) × 100
  //  but lets the LLM AUTHOR the number, so it is not reproducible run-to-run.
  //  We compute the SAME proportion here in TypeScript. In our units,
  //  totalWeightedPoints already equals Σ(round(weight × severity / 10)), so the
  //  reference's ×10 cancels and the formula reduces to:
  //        totalWeightedPoints ÷ Σ(all weights) × 100.
  //
  //  Why this fixes accuracy AND consistency: the denominator is a FIXED constant
  //  (every document is scored against the same ceiling), so (a) the score grades
  //  SMOOTHLY with how many red flags are present — like the reference's 66.7 —
  //  instead of collapsing into flat bands, and (b) one extra or missing secondary
  //  rule from DeepSeek is a small fraction of that fixed ceiling, so it moves the
  //  score by only a point or two, never a jump across a level boundary.
  //
  //  CALIBRATION: the reference divides by Σ(all 21 weights)=176 — the points if
  //  EVERY flag fired. No real document triggers all 21, so that compresses every
  //  score into the low end. We divide by a realistic ceiling (~100 weighted
  //  points ≈ a dozen serious flags at strong severity) so the full 0-100 range is
  //  used and a broadly-fraudulent offering lands in High/Critical like the
  //  reference's Spartan (66.7). Raise SCORE_CEILING if scores feel too hot, lower
  //  it if they feel too cool — it is the single knob for overall sensitivity.
  const SCORE_CEILING = 100
  const riskScore = !isInvestmentRelated
    ? 0
    : (() => {
        const base = clamp(Math.round((totalWeightedPoints / SCORE_CEILING) * 100), 0, 100)
        // Deterministic floors so a terse-but-egregious offering cannot underscore
        // merely because it is short (few flags → low proportion). These are the
        // ONLY non-proportional adjustments and each is anchored to a deterministic
        // signal (the regex backstop / structural corroboration).
        if (hasDispositiveHit) return Math.max(base, 75)          // guaranteed / FDIC / barred / nominee → Critical
        if (hasStructuralCorroboration) return Math.max(base, 55) // corroborated structural fraud → High
        return base                                               // otherwise pure proportional gradation
      })()

  const keyDrivers = isInvestmentRelated
    ? triggered
        .filter((f) => maxPossiblePoints > 0 && f.weightedPoints / maxPossiblePoints >= 0.15)
        .map((f) => f.n)
    : []

  const riskLevel =
    riskScore >= 75 ? 'Critical' : riskScore >= 50 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low'
  console.log(`[mergeEvaluations] FINAL: triggeredCount=${triggered.length} totalWeightedPoints=${totalWeightedPoints} maxPossiblePoints=${maxPossiblePoints} hasDispositiveHit=${hasDispositiveHit} riskScore=${riskScore} riskLevel=${riskLevel}`)
  triggered.forEach(f => console.log(`[mergeEvaluations]   rule#${f.n} ${f.name} tier=${f.evidenceTier} sev=${f.severity} wp=${f.weightedPoints} conf=${f.confidence}`))

  // Dedupe claims.
  const seenClaims = new Set<string>()
  const claims = allClaims.filter((c) => {
    const k = `${c.type}|${c.claim}`.toLowerCase().slice(0, 100)
    if (!c.claim || seenClaims.has(k)) return false
    seenClaims.add(k)
    return true
  })

  const pageCount = Math.max(0, ...findings.flatMap((f) => f.pages), ...clean.map((e) => e.page_range?.[1] || 0))

  return {
    isInvestmentRelated,
    notRelevantReason,
    riskScore,
    riskLevel,
    scoreBreakdown: {
      totalWeightedPoints,
      maxPossiblePoints,
      formula: 'totalWeightedPoints ÷ (maxPossiblePoints + stabilityFloor) × 100',
      keyDrivers,
    },
    findings,
    triggeredFlags: triggered.sort((a, b) => b.weightedPoints - a.weightedPoints),
    claims,
    chunkCount: clean.length,
    pageCount,
    analyzedAt: new Date().toISOString(),
  }
}
